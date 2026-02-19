# CLAUDE.md

このファイルは Claude Code (claude.ai/code) がこのリポジトリで作業する際のガイドです。

## ビルド・実行コマンド

```bash
npm run dev        # 開発サーバー起動（レンダラーはHMR、メインプロセスは再起動が必要）
npm run build      # プロダクションビルド
npm run package    # ビルド + Windowsインストーラー生成（NSIS）
```

テストフレームワークは未導入。

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
└── ipc-handlers.ts   — 全 ipcMain.handle() の登録

Preload (src/preload/index.ts)
└── contextBridge で window.api を公開

Renderer (src/renderer/src/)
├── App.tsx           — HashRouter（4ルート）
├── screens/          — FolderSelect, EventList, EventDetail, Slideshow
├── components/       — EventCard, PhotoThumbnail, Lightbox, TopBar, ScanProgress
├── hooks/            — useEvents, usePhotos, useScan, useSlideshow
├── context/          — AppContext（currentFolder, isScanning）
└── types/            — IPCチャンネル名、モデル定義、electron.d.ts
```

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

### イベントグルーピング

日付単位で写真をグルーピング。3枚以上の日は「イベント」として大きく表示、1〜2枚はコンパクト表示。2日以内の間隔で連続するイベント日は「旅行」として視覚的にグループ化（`useEvents.ts` の `computeConsecutiveGroups` 参照）。

## 設定上の注意

- `webSecurity: false`（BrowserWindow）— `<img>` タグで `file://` URL を使用するために必要
- `sandbox: false` — preload スクリプトで Node.js API を使用するために必要
- パスエイリアス `@/` → `src/renderer/src/`（レンダラーのみ）
