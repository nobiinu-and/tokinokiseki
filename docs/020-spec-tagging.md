\# 写真タグ付け機能 仕様書



\## 概要



Electron アプリにオフライン完結の写真タグ付け機能を組み込む。

CLIP 単体では画像全体を1ベクトルに変換するため複数被写体の個別認識が困難。

そこで \*\*物体検出 → 個別分類\*\* のパイプラインを採用し、3種類のタグを付与する。



\## アーキテクチャ



```

写真入力

&nbsp;├─① 物体検出 (DETR/YOLO) → 人・犬・車… 複数タグ + バウンディングボックス

&nbsp;├─② 顔検出 → 顔埋め込み → 顔クラスタリング/識別 → 人物名タグ

&nbsp;└─③ シーン分類 (画像全体) → 屋外・夜景・パーティー… 雰囲気タグ

```



物体検出で先に個別領域を切り出し、各領域を分類するのがポイント。

CLIP はシーン・雰囲気の分類（画像全体のゼロショット分類）にのみ使用する。



---



\## タスク別の使用ライブラリ・モデル



| タスク | ライブラリ | モデル | サイズ目安 |

|---|---|---|---|

| 物体・被写体検出 | Transformers.js | `Xenova/detr-resnet-50` | ~160MB |

| 物体検出（軽量版） | Transformers.js | `Xenova/yolos-tiny` | ~25MB |

| 顔検出・識別 | face-api.js | SSD MobileNet + FaceRecognition | ~6MB |

| シーン・雰囲気 | Transformers.js | `Xenova/clip-vit-base-patch32` | ~350MB |



\### 依存パッケージ



```bash

npm install @huggingface/transformers face-api.js

```



---



\## 実装詳細



\### 1. 物体・被写体検出（Transformers.js）



DETR または YOLO で画像内の複数オブジェクトを検出し、それぞれにラベルを付ける。



```javascript

import { pipeline } from '@huggingface/transformers';



const detector = await pipeline('object-detection', 'Xenova/detr-resnet-50');

const results = await detector(imageUrl, { threshold: 0.7 });

// 出力例:

// \[

//   { label: "person", score: 0.98, box: { xmin, ymin, xmax, ymax } },

//   { label: "dog",    score: 0.92, box: { xmin, ymin, xmax, ymax } },

//   { label: "car",    score: 0.85, box: { xmin, ymin, xmax, ymax } },

// ]

```



\- `threshold` を調整してノイズを除去する（0.5〜0.8 推奨）

\- `label` をそのまま写真のタグとして使用する

\- 同一ラベルが複数ある場合は個数もメタデータに含めてよい（例: `person x3`）



\### 2. 顔検出・識別（face-api.js）



\#### 2-1. モデル読み込み



モデルファイルはアプリにバンドルしてローカルから読み込む。



```javascript

import \* as faceapi from 'face-api.js';



const MODEL\_PATH = './models/face-api'; // アプリ内のモデルディレクトリ



await faceapi.nets.ssdMobilenetv1.loadFromDisk(MODEL\_PATH);

await faceapi.nets.faceLandmark68Net.loadFromDisk(MODEL\_PATH);

await faceapi.nets.faceRecognitionNet.loadFromDisk(MODEL\_PATH);

```



\#### 2-2. 顔検出 + 埋め込みベクトル取得



```javascript

const detections = await faceapi

&nbsp; .detectAllFaces(imageElement)

&nbsp; .withFaceLandmarks()

&nbsp; .withFaceDescriptors();



// detections\[i].descriptor → Float32Array(128)  顔の特徴ベクトル

// detections\[i].detection.box → { x, y, width, height }

```



\#### 2-3. 顔識別（既知の人物とのマッチング）



ユーザーが事前に「この顔は○○さん」とラベル付けした埋め込みベクトルを保存しておき、

新しい写真の顔と比較して同一人物を識別する。



```javascript

// 登録済みの顔データ

const labeledDescriptors = \[

&nbsp; new faceapi.LabeledFaceDescriptors('田中太郎', \[descriptor1, descriptor2]),

&nbsp; new faceapi.LabeledFaceDescriptors('鈴木花子', \[descriptor3]),

];



// マッチャー作成（閾値 0.6 = ユークリッド距離）

const matcher = new faceapi.FaceMatcher(labeledDescriptors, 0.6);



// 各顔を識別

detections.forEach(d => {

&nbsp; const bestMatch = matcher.findBestMatch(d.descriptor);

&nbsp; console.log(bestMatch.label);    // → "田中太郎" or "unknown"

&nbsp; console.log(bestMatch.distance); // → 0.35 (小さいほど類似)

});

```



\#### 2-4. 顔登録フロー（UI側で実装）



1\. ユーザーが写真を開く → 顔が自動検出される

2\. 検出された顔の横に名前入力欄を表示

3\. 名前を入力 → 埋め込みベクトルと名前をローカルDBに保存

4\. 以降の写真では自動識別。unknown の場合は新規登録を促す



\### 3. シーン・雰囲気分類（Transformers.js + CLIP ゼロショット）



画像全体をCLIPに渡し、事前定義したラベル候補からスコアの高いものをタグとする。



```javascript

const classifier = await pipeline(

&nbsp; 'zero-shot-image-classification',

&nbsp; 'Xenova/clip-vit-base-patch32'

);



// カスタマイズ可能なラベル候補

const sceneLabels = \[

&nbsp; 'outdoor', 'indoor', 'party', 'wedding', 'beach',

&nbsp; 'mountain', 'city', 'night scene', 'sunset',

&nbsp; 'portrait', 'group photo', 'landscape', 'food',

&nbsp; 'sports', 'concert', 'travel', 'celebration',

];



const results = await classifier(imageUrl, sceneLabels);

// 出力例:

// \[

//   { label: "beach",   score: 0.85 },

//   { label: "outdoor", score: 0.78 },

//   { label: "sunset",  score: 0.45 },

//   ...

// ]



// スコアが閾値以上のものをタグとして採用

const sceneTags = results.filter(r => r.score > 0.3).map(r => r.label);

```



\- `sceneLabels` はアプリの設定で追加・変更できるようにする

\- 日本語ラベルを使いたい場合は多言語CLIPモデル（`Xenova/clip-vit-base-patch32` でも英語ラベルが安定）を検討するか、ラベルの表示名だけ日本語にマッピングする



---



\## 統合：タグ付けパイプライン



```javascript

async function generateTags(imageElement, imageUrl) {

&nbsp; const tags = {

&nbsp;   objects: \[],  // 物体・被写体

&nbsp;   people: \[],   // 人物名

&nbsp;   scenes: \[],   // シーン・雰囲気

&nbsp; };



&nbsp; // ① 物体検出

&nbsp; const objects = await detector(imageUrl, { threshold: 0.7 });

&nbsp; tags.objects = objects.map(o => ({

&nbsp;   label: o.label,

&nbsp;   score: o.score,

&nbsp;   box: o.box,

&nbsp; }));



&nbsp; // ② 顔識別

&nbsp; const faces = await faceapi

&nbsp;   .detectAllFaces(imageElement)

&nbsp;   .withFaceLandmarks()

&nbsp;   .withFaceDescriptors();



&nbsp; tags.people = faces.map(f => {

&nbsp;   const match = faceMatcher.findBestMatch(f.descriptor);

&nbsp;   return {

&nbsp;     name: match.label,

&nbsp;     distance: match.distance,

&nbsp;     box: f.detection.box,

&nbsp;   };

&nbsp; });



&nbsp; // ③ シーン分類

&nbsp; const scenes = await classifier(imageUrl, sceneLabels);

&nbsp; tags.scenes = scenes

&nbsp;   .filter(s => s.score > 0.3)

&nbsp;   .map(s => ({ label: s.label, score: s.score }));



&nbsp; return tags;

}

```



---



\## パフォーマンス考慮事項



\### 実行速度



\- WASM (CPU) 実行は GPU 推論より遅い。1枚あたり数秒〜十数秒かかる場合がある

\- 大量処理時はバックグラウンドワーカー（Web Worker / Node.js worker\_threads）で並列化を検討

\- Transformers.js v3 の WebGPU バックエンドを使うと大幅に高速化可能



\### モデルの配布方法



\- \*\*アプリ同梱\*\*: モデルファイルをアプリのリソースに含める。オフライン完結が保証される

&nbsp; - `Xenova/detr-resnet-50` (~160MB) + face-api.js (~6MB) + CLIP (~350MB) = 合計 ~516MB

&nbsp; - 軽量構成: `Xenova/yolos-tiny` (~25MB) + face-api.js (~6MB) + CLIP (~350MB) = 合計 ~381MB

\- \*\*初回ダウンロード + キャッシュ\*\*: 初回起動時にモデルをダウンロードしローカルにキャッシュ。アプリサイズを小さくできるが初回はネット接続が必要



\### Transformers.js のローカルモデル読み込み



```javascript

const detector = await pipeline('object-detection', 'Xenova/detr-resnet-50', {

&nbsp; local\_files\_only: true,

&nbsp; cache\_dir: './models/transformers',

});

```



\### メモリ使用量



\- モデルごとに数百MBのメモリを消費する

\- 3つのモデルを同時にロードすると 1GB 以上になる可能性がある

\- 必要に応じてモデルを逐次ロード/アンロードする戦略も検討



---



\## 出力フォーマット例



```json

{

&nbsp; "file": "IMG\_2024\_0601.jpg",

&nbsp; "tags": {

&nbsp;   "objects": \[

&nbsp;     { "label": "person", "score": 0.98, "box": { "xmin": 10, "ymin": 20, "xmax": 200, "ymax": 400 } },

&nbsp;     { "label": "dog", "score": 0.92, "box": { "xmin": 220, "ymin": 150, "xmax": 350, "ymax": 380 } }

&nbsp;   ],

&nbsp;   "people": \[

&nbsp;     { "name": "田中太郎", "distance": 0.35, "box": { "x": 50, "y": 20, "width": 80, "height": 100 } },

&nbsp;     { "name": "unknown", "distance": 0.75, "box": { "x": 300, "y": 30, "width": 70, "height": 90 } }

&nbsp;   ],

&nbsp;   "scenes": \[

&nbsp;     { "label": "outdoor", "score": 0.85 },

&nbsp;     { "label": "beach", "score": 0.72 }

&nbsp;   ]

&nbsp; }

}

```

