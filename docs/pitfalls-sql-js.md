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
