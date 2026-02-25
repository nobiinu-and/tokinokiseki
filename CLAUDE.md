# CLAUDE.md

このファイルは Claude Code (claude.ai/code) がこのリポジトリで作業する際のガイドです。

## ビルド・実行コマンド

```bash
npm run dev        # 開発サーバー起動（レンダラーはHMR、メインプロセスは再起動が必要）
npm run build      # プロダクションビルド
npm run package    # ビルド + Windowsインストーラー生成（NSIS）
npx vitest run     # テスト実行（Vitest）
```

## 環境制約

- Node.js v24.13.1 — ネイティブモジュールのプリビルドバイナリがない
- **`better-sqlite3` や `sharp` は使用禁止** — コンパイルできない。代わりに `sql.js`（WASM）と Electron の `nativeImage` を使う
- Windows 向け開発

## アーキテクチャ

Electron アプリの3プロセス構成:

```
Main Process (src/main/)
├── index.ts          — アプリライフサイクル、DB・サムネイル初期化、ウィンドウ生成
├── database.ts       — sql.js ラッパー（インメモリSQLite、手動でディスク保存）
├── scanner.ts        — フォルダ再帰走査、EXIF解析、サムネイル生成
├── thumbnail.ts      — nativeImage サムネイル + HEIC変換の制御
├── heic-worker.ts    — Worker Thread: heic-convert で HEIC→JPEG 変換
├── clip.ts / clip-worker.ts   — CLIP モデルによるシーン分類・回転補正
├── detect.ts / detect-worker.ts — YOLO モデルによる物体検出
├── rotation.ts       — 画像回転補正
├── duplicate.ts      — 重複写真検出
├── ipc-handlers.ts   — 全 ipcMain.handle() の登録
└── scanner.test.ts   — スキャナーのユニットテスト（Vitest）

Preload (src/preload/index.ts)
└── contextBridge で window.api を公開

Renderer (src/renderer/src/)
├── App.tsx           — HashRouter + TabBar レイアウト
├── screens/          — Home, Timeline, DateDetail, Gallery, EventDetail,
│                       TagDetail, BestCollection, TagSearch, Slideshow
├── components/       — DateCard, PhotoThumbnail, Lightbox, TopBar, TabBar,
│                       ScanProgress, EventManager, SuggestionBanner, etc.
├── hooks/            — useTimeline, usePhotos, useScan, useSlideshow,
│                       usePhotoTags, useCountUp
├── utils/            — dateUtils（formatDate, buildDateGroups）
├── context/          — AppContext（timelineId, isScanning, loading）
└── types/            — IPCチャンネル名、モデル定義、electron.d.ts
```

### 3空間モデル（ナビゲーション）

アプリは3つの空間で構成され、下部タブバーで自由に行き来する:

| 空間 | ルート | 役割 |
|------|--------|------|
| ホーム (`/`) | Home | サマリー表示、フォルダ管理、今日の提案 |
| タイムライン (`/timeline`) | Timeline → DateDetail | 記録の川を眺める。発見し、触れる（入力の場） |
| ギャラリー (`/gallery`) | Gallery → EventDetail / TagDetail / BestCollection | 記憶の棚。行動の成果が形になる（出力の場） |

詳細は `docs/040-spec-ui-design.md` と `docs/vision.md` を参照。

## 主要パターン

### IPC チャンネルの追加手順

全チャンネル名は `src/renderer/src/types/ipc.ts` に一元管理（main, preload, renderer で共有）。

新しい IPC ハンドラを追加する手順:
1. `src/renderer/src/types/ipc.ts` の `IPC_CHANNELS` にチャンネル名を追加
2. `src/main/ipc-handlers.ts` に `ipcMain.handle()` を追加
3. `src/preload/index.ts` で `contextBridge` 経由で公開
4. `src/renderer/src/types/electron.d.ts` の `ElectronAPI` に型を追加

### sql.js（データベース）

- 完全にインメモリで動作。`saveDatabase()` で手動ディスク保存
- データ変更後は必ず `saveDatabase()` を呼ぶこと
- WASM ファイルが実行時にアクセス可能であること — `electron-builder.yml` で `asarUnpack: '**/sql.js/dist/**'`
- `electron.vite.config.ts` の `externalizeDepsPlugin()` で sql.js を外部依存として維持

### HEIC 対応

HEIC ファイルは2段階で処理:
1. **Worker Thread**（`heic-worker.ts`）で HEIC→JPEG 変換し `userData/heic-cache/` にキャッシュ
2. キャッシュ済み JPEG から `nativeImage` で**サムネイル生成**
3. **フルサイズ表示**も `getDisplayPath()` 経由でキャッシュ JPEG を使用（ブラウザは HEIC を直接表示できない）

Worker は `electron.vite.config.ts` で別エントリポイントとして定義。

### サムネイル命名規則

ファイルパス → MD5ハッシュ → `userData/thumbnails/{hash}.jpg`。長辺300px、JPEG品質80。

### タイムライン・フォルダ管理

複数フォルダの写真を1つのタイムラインに統合表示する設計:
- `timelines` テーブル + `timeline_folders` テーブルでN:M関係
- レンダラーは `timelineId` でAPIを呼ぶ。mainプロセスが `timelineId → folderIds[]` に解決
- DB関数は `folderIds: number[]` を受け取り `WHERE folder_id IN (...)` で検索
- スキャンは引き続きフォルダ単位（`scanFolder(path)`）。スキャン後にフォルダをタイムラインに追加
- 初回起動時にデフォルトタイムライン「メイン」を自動作成、既存フォルダをマイグレーション

### 日付カードグルーピング

日付単位で写真をグルーピング。3枚以上の日は大きなカード（`isLargeCard`）で表示、1〜2枚はコンパクト表示。

### できごと機能

日付を「できごと」としてグルーピングする機能。2つのタイプをサポート:

**Range型（期間）**: 旅行・帰省など、連続する日付の範囲
- `events` テーブルで管理（timeline_id, title, type='range', start_date, end_date）
- 範囲選択: 2クリック方式で手動作成。順序は自動判定（min/max）

**Dates型（日付リスト）**: プラモデル制作・DIYなど、飛び飛びの個別日付
- `event_dates` テーブルで個別日付を管理（event_id, date）
- `events.start_date`/`end_date` は `event_dates` の min/max から自動同期（クエリ効率のため）
- 作成: 複数日付をクリック選択 → タイトル入力
- EventManager から「日付を追加」で既存イベントに日付を追加可能

共通:
- 重複許可: 同じ日が複数のできごとに含まれてOK
- タイムライン上で日付カードにイベントラベルを表示（dates型は所属日のみ）
- サジェスト: 固定パラメータ（minDays=2, maxGap=1, minPhotosPerDay=3）で自動検出、バナーで提示（常にrange型）
- タイトル自動生成: 期間/日付内の写真タグから上位1〜2個を使用（`TAG_DISPLAY_NAMES` マッピングで日本語化）
- 関連コンポーネント: `SuggestionBanner`, `EventTitleDialog`, `RangeSelectBar`, `DatesSelectBar`, `AddDatesBar`, `EventManager`

### 自動タグ付け

ONNX Runtime で CLIP / YOLO モデルを Worker Thread 上で実行:
- **シーン分類**（CLIP）: 屋外・屋内・夜景などを自動判定
- **物体検出**（YOLO）: 人物・動物・食べ物などを自動検出
- **回転補正**（CLIP）: EXIF 情報がない写真の向きを自動判定
- UI上では技術用語（CLIP, YOLO, 閾値）を隠し、「シーンを分類する」「写っているものを見つける」等の表現を使う

### 共有ユーティリティ

- `src/renderer/src/utils/dateUtils.ts` — `formatDate`（不正日付セーフ）、`buildDateGroups`（写真の日付グルーピング）
- `src/renderer/src/hooks/usePhotoTags.ts` — 写真タグの読み込み・追加・削除を一元管理するカスタムフック

## 設定上の注意

- `webSecurity: false`（BrowserWindow）— `<img>` タグで `file://` URL を使用するために必要
- `sandbox: false` — preload スクリプトで Node.js API を使用するために必要
- パスエイリアス `@/` → `src/renderer/src/`（レンダラーのみ）
