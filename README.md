# ときのきせき

**あなたの癒しのギャラリーへ、ようこそ**

フォルダに眠る写真を、日付ごとの「イベント」として自動整理。お気に入りを選んで、スライドショーで思い出をふりかえる — そんなシンプルな写真ビューアです。

## 主な機能

- **フォルダスキャン** — 選択したフォルダ内の写真を再帰的にスキャンし、EXIF 情報を自動解析
- **イベントグルーピング** — 撮影日ごとに写真を自動分類。連続する日は「旅行」としてまとめて表示
- **ベストマーク** — お気に入りの写真に星をつけて、あとから見返しやすく
- **スライドショー** — イベント単位・ベスト写真のみなど、柔軟な再生が可能
- **HEIC 対応** — iPhone で撮影した HEIC/HEIF ファイルも自動変換して表示
- **ダークテーマ** — 目にやさしいダークモード UI

## 対応フォーマット

| 形式 | 拡張子 |
|------|--------|
| JPEG | `.jpg`, `.jpeg` |
| PNG | `.png` |
| HEIC/HEIF | `.heic`, `.heif` |
| WebP | `.webp` |

## セットアップ

### 必要な環境

- Node.js 18 以上
- npm

### インストール・起動

```bash
# 依存パッケージのインストール
npm install

# 開発モードで起動（ホットリロード対応）
npm run dev

# プロダクションビルド
npm run build

# Windows インストーラー生成（NSIS）
npm run package
```

## 技術スタック

| カテゴリ | 技術 |
|----------|------|
| フレームワーク | Electron + React 18 |
| 言語 | TypeScript |
| ビルドツール | electron-vite (Vite 5) |
| データベース | sql.js (WASM SQLite) |
| EXIF 解析 | exifr |
| HEIC 変換 | heic-convert (Worker Thread) |
| ルーティング | react-router-dom (HashRouter) |
| 仮想スクロール | react-virtuoso |

## アーキテクチャ

Electron の 3 プロセス構成:

```
┌─────────────────────────────────────────────────┐
│  Main Process (src/main/)                       │
│  ├── database.ts    — sql.js SQLite ラッパー     │
│  ├── scanner.ts     — フォルダ走査 + EXIF 解析   │
│  ├── thumbnail.ts   — サムネイル生成              │
│  ├── heic-worker.ts — HEIC→JPEG 変換 (Worker)   │
│  └── ipc-handlers.ts — IPC ハンドラ登録          │
├─────────────────────────────────────────────────┤
│  Preload (src/preload/)                         │
│  └── contextBridge で window.api を公開          │
├─────────────────────────────────────────────────┤
│  Renderer (src/renderer/src/)                   │
│  ├── screens/    — 4 画面 (フォルダ選択,         │
│  │                 イベント一覧, 詳細, スライド)  │
│  ├── components/ — UI コンポーネント              │
│  ├── hooks/      — カスタムフック                 │
│  └── context/    — アプリ状態管理                 │
└─────────────────────────────────────────────────┘
```

---

## English

### Overview

**Toki no Kiseki** ("Traces of Time") is a desktop photo viewer for Windows, built with Electron. It automatically organizes photos from a selected folder into date-based "events," lets you mark your favorites, and plays them back as a slideshow.

### Features

- **Folder scanning** — Recursively scans folders and extracts EXIF metadata
- **Event grouping** — Automatically groups photos by date; consecutive days are displayed as "trips"
- **Best marks** — Star your favorite photos for easy access
- **Slideshow** — Play back events or best-marked photos with customizable options
- **HEIC support** — Automatically converts iPhone HEIC/HEIF files for display
- **Dark theme** — Easy-on-the-eyes dark mode UI

### Tech Stack

Electron + React 18 + TypeScript, with sql.js (WASM SQLite) for metadata storage and electron-vite for builds.

---

## ライセンス

[MIT License](./LICENSE)
