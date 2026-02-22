# sql.js の落とし穴

## initDatabase() での無条件 saveDatabase() によるデータ消失

### 現象

`initDatabase()` の末尾で毎回 `saveDatabase()` を呼んでいたところ、直前のセッションで追加したタグデータが消失するケースが発生した。

- アプリを閉じてすぐ再起動すると、前回追加したタグが消えている
- 時間を置いてから閉じた場合は問題なし

### 背景: sql.js の動作モデル

sql.js は SQLite をWASMにコンパイルしたもので、**完全にインメモリ**で動作する。ディスク上のファイルとは自動的に同期されない。

```
起動時:  fs.readFileSync(dbPath) → new SQL.Database(buffer)  // ファイル → メモリ
保存時:  db.export() → fs.writeFileSync(dbPath, buffer)      // メモリ → ファイル
```

`db.export()` はメモリ上の SQLite データベースを丸ごとバイナリに**再シリアライズ**する。

### 問題のコード（修正前）

```typescript
export async function initDatabase(): Promise<void> {
  const buffer = fs.readFileSync(dbPath)
  db = new SQL.Database(buffer)    // ディスクからメモリに読み込み

  db.run('CREATE TABLE IF NOT EXISTS folders ...')
  db.run('CREATE TABLE IF NOT EXISTS photos ...')
  db.run('CREATE TABLE IF NOT EXISTS tags ...')
  db.run('CREATE TABLE IF NOT EXISTS photo_tags ...')

  saveDatabase()  // ← 毎回無条件に呼んでいた
}
```

`CREATE TABLE IF NOT EXISTS` はテーブルが既に存在する場合は論理的に何もしない。しかし、その後の `db.export()` による再シリアライズで、元のファイルと異なるバイナリが生成された可能性がある。

### 原因の仮説

sql.js（内部の SQLite エンジン）が `CREATE TABLE IF NOT EXISTS` を実行する際に、テーブルが既に存在していても内部的なページキャッシュやメタデータの状態が変わり、`export()` の出力バイナリが元のファイルと一致しなくなる。その結果、直前のセッションで正しく保存されたデータが、起動時の不要な再書き込みで上書き・破損した。

正確な内部メカニズムは sql.js / SQLite WASM の実装詳細に依存するため完全には解明していないが、修正により問題は解消された。

### 修正後

スキーマが実際に変更された場合（初回起動またはマイグレーション時）のみ保存するようにした。

```typescript
const isNewDb = !fs.existsSync(dbPath)

// ... CREATE TABLE IF NOT EXISTS ...
// ... ALTER TABLE migration check ...

if (isNewDb || !hasOrientationCol) {
  saveDatabase()
}
```

### 教訓

1. **sql.js では不要な `export()` + ファイル書き込みを避ける** — インメモリDBの再シリアライズは冪等とは限らない
2. **データ変更を伴わない初期化処理で `saveDatabase()` を呼ばない** — スキーマ変更時のみ保存する
3. **`saveDatabase()` は同期関数にする** — `fs.openSync` + `fs.writeSync` + `fs.fsyncSync` で確実にディスクに書き込む

---

## アプリ終了時の冗長な saveDatabase() によるデータ消失

### 現象

上記の `initDatabase()` 修正後も、タグの**削除**がアプリ再起動後に復活するケースが発生した（追加は正常に保存されていた）。

- タグ削除後すぐに × ボタンで閉じると、再起動時に削除したタグが復活する
- イベント一覧に画面遷移してから閉じると問題なし
- 間欠的に発生（毎回ではない）

### 原因

`before-quit` と `process.on('exit')` で `saveDatabase()` を呼んでいた。各データ変更操作（IPC ハンドラ等）は既に操作直後に `saveDatabase()` を呼んでディスクに正しく保存しているが、終了時の冗長な `db.export()` 再実行が**直前の正しいファイルを古いスナップショットで上書き**していた。

```typescript
// 修正前（index.ts）
app.on('before-quit', () => {
  saveDatabase()   // ← db.export() で再シリアライズ → 正しいファイルを上書き
})
process.on('exit', () => {
  saveDatabase()   // ← 同上
})
```

### なぜ画面遷移すると問題が起きないか

画面遷移時に IPC 呼び出し（`getEventSummary` 等の読み取り操作）が発生し、これが sql.js の内部状態をリフレッシュする。その結果、終了時の `db.export()` が正しいスナップショットを返すようになる。

### 修正

終了時の `saveDatabase()` を完全に削除した。全てのデータ変更箇所で個別に `saveDatabase()` を呼んでいるため、終了時の保存は不要。

```typescript
// 修正後（index.ts）
// saveDatabase() is called by each data-modifying operation individually.
// Redundant re-export via db.export() at quit time can overwrite correct data
// with a stale snapshot (known sql.js quirk).
```

### 教訓

4. **終了時に冗長な `saveDatabase()` を呼ばない** — 各操作で既に保存しているなら、終了時の `db.export()` 再実行は害になりうる
5. **sql.js の `db.export()` は冪等ではない** — 同じ論理状態でも、呼び出しタイミングによって異なるバイナリを返すことがある
6. **「念のため保存」は逆効果** — インメモリDBでは不要な再シリアライズがデータを壊すリスクがある
