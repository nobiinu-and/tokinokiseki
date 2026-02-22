# 写真回転補正 仕様書

## 概要

EXIF Orientation タグによる回転補正だけでは、天地逆や横向きの画像が残る場合がある。
画像のピクセル内容から天地を判定する仕組みを追加し、EXIF 欠損・不正時にも正しく補正する。

## EXIF だけでは失敗するケース

| 原因 | 状況 |
|---|---|
| EXIF が欠損・不正 | スクリーンショット、SNS経由の画像、古いカメラ、画像編集ソフトで保存時にEXIFが消える |
| EXIF は正しいが適用漏れ | ライブラリによっては Orientation=1 以外を無視する実装がある |

---

## アーキテクチャ

EXIF → YOLO ヒント → CLIP 精密判定 の3段フォールバック構成を採用する。
追加モデルは不要で、タグ付け機能で導入済みの YOLO と CLIP をそのまま流用する。

```
写真入力
 │
 ├─ Step 1: EXIF Orientation 適用（基本処理）
 │
 ├─ Step 2: YOLO 検出結果から回転ヒントを取得
 │   └─ 人物 box の縦横比・頭部位置で簡易判定
 │
 └─ Step 3: EXIF 欠損 or YOLO が回転の疑いを示した場合のみ
     └─ CLIP ゼロショットで 4方向スコアリング → 最適回転角を決定
```

CLIP の追加推論は「疑わしい画像だけ」に限定されるため、全画像に4回推論するコストを回避できる。

---

## 実装詳細

### Step 1: EXIF Orientation の確認

```javascript
function getExifOrientation(imageBuffer) {
  // EXIF の Orientation タグ (0x0112) を読み取る
  // 値: 1=正常, 3=180°, 6=90°CW, 8=270°CW, etc.
  // 返り値: 回転角度 (0, 90, 180, 270) or null (EXIF欠損)
}
```

### Step 2: YOLO 検出結果による簡易判定

タグ付けパイプラインで既に実行済みの YOLO 検出結果を再利用する。
人物のバウンディングボックスの形状と位置から回転の兆候を検出する。

```javascript
function inferOrientationFromDetections(detections, imageWidth, imageHeight) {
  const people = detections.filter(d => d.label === 'person');
  if (people.length === 0) return null; // 人物なしは判定不能

  // 正立した人物は通常「縦長」の box
  // 横向き画像では人物の box が「横長」になる
  const tallCount = people.filter(d => {
    const h = d.box.ymax - d.box.ymin;
    const w = d.box.xmax - d.box.xmin;
    return h > w;
  }).length;

  const wideCount = people.length - tallCount;

  if (wideCount > tallCount) {
    // 人物が横長 → 画像が 90° or 270° 回転している可能性
    return { needsRotation: true, likely: '90 or 270' };
  }

  // 天地逆の判定: 人物の頭部位置（box の上端）が画像下半分にある
  const upsideDownCount = people.filter(d => {
    const headY = d.box.ymin;
    return headY > imageHeight * 0.5;
  }).length;

  if (upsideDownCount > people.length / 2) {
    return { needsRotation: true, likely: '180' };
  }

  return { needsRotation: false };
}
```

#### 判定ロジックの根拠

- **横向き判定**: 正立した人物の box は縦横比 > 1（縦長）。画像が 90°/270° 回転していると人物の box が横長になる
- **天地逆判定**: 正立画像では人物の頭（box 上端）は画像の上半分に位置する。180° 回転していると頭が画像の下半分にくる

### Step 3: CLIP ゼロショットによる精密判定

画像を 0°/90°/180°/270° の4パターンに回転させ、それぞれ「正しい向きの写真か」を CLIP で判定する。

```javascript
async function detectOrientation(imageUrl, classifier) {
  const rotations = [0, 90, 180, 270];

  // 画像を4方向に回転させた版を作る
  const rotatedImages = await Promise.all(
    rotations.map(deg => rotateImage(imageUrl, deg))
  );

  // 各回転画像に対して「正位置の写真らしさ」をスコアリング
  const scores = await Promise.all(
    rotatedImages.map(img =>
      classifier(img, [
        'a correctly oriented upright photo',
        'a rotated or upside down photo',
      ])
    )
  );

  // 「正位置」スコアが最も高い回転角を採用
  let bestIdx = 0;
  let bestScore = 0;
  scores.forEach((result, i) => {
    const uprightScore = result.find(
      r => r.label === 'a correctly oriented upright photo'
    ).score;
    if (uprightScore > bestScore) {
      bestScore = uprightScore;
      bestIdx = i;
    }
  });

  return {
    rotation: rotations[bestIdx],
    confidence: bestScore,
  };
}
```

#### 画像回転ユーティリティ

Canvas API を使って画像を任意角度に回転させる。

```javascript
async function rotateImage(imageUrl, degrees) {
  const img = await loadImage(imageUrl);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (degrees === 90 || degrees === 270) {
    canvas.width = img.height;
    canvas.height = img.width;
  } else {
    canvas.width = img.width;
    canvas.height = img.height;
  }

  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);

  return canvas.toDataURL('image/jpeg');
}
```

---

## 統合：回転補正パイプライン

```javascript
async function correctOrientation(imageUrl, imageElement, detections) {
  const { width, height } = imageElement;

  // Step 1: EXIF 確認
  const exifOrientation = getExifOrientation(imageUrl);

  // Step 2: YOLO 検出結果から回転ヒントを取得（検出結果は再利用）
  const hint = inferOrientationFromDetections(detections, width, height);

  // Step 3: EXIF が欠損、または YOLO が回転の疑いを示した場合のみ CLIP 判定
  if (!exifOrientation || (hint && hint.needsRotation)) {
    const result = await detectOrientation(imageUrl, classifier);
    if (result.confidence > 0.6 && result.rotation !== 0) {
      return result.rotation; // この角度で補正
    }
  }

  return 0; // 補正不要
}
```

### タグ付けパイプラインとの統合順序

回転補正はタグ付けの **前** に実行する。回転が間違った状態でタグ付けすると精度が落ちるため。

```
写真入力
 ├─ EXIF Orientation 適用
 ├─ YOLO 仮実行（回転ヒント取得用）
 ├─ 必要に応じて CLIP 回転判定 → 画像回転
 │
 └─ 回転補正済み画像で本タグ付け実行
     ├─ 物体検出 (YOLO)
     ├─ 顔検出・識別 (face-api.js)
     └─ シーン分類 (CLIP)
```

※ YOLO を回転判定用と本タグ付け用で2回実行することになる。パフォーマンスが問題になる場合は、Step 2 を省略して EXIF 欠損時に直接 CLIP 判定に進む簡易版も検討可。

---

## パフォーマンス考慮事項

| 処理 | コスト | 発生条件 |
|---|---|---|
| EXIF 読み取り | ほぼゼロ | 全画像 |
| YOLO ヒント判定 | 検出結果の再利用のみ | 全画像（追加推論なし） |
| CLIP 4方向判定 | CLIP 推論 ×4 回 | EXIF 欠損 or YOLO が疑い検出した画像のみ |
| 画像回転 (Canvas) | 軽微 | 補正が必要な画像のみ |

大量処理時の最適化として、CLIP 判定の対象を絞り込むことがポイント。
EXIF が正常で YOLO ヒントも問題なしなら CLIP 判定をスキップする。

---

## 既知の限界・注意点

- **風景・対称的な画像**: 空や海の境界がない対称構図では CLIP の判定精度が落ちる
- **人物のいない写真**: YOLO ヒント（Step 2）が機能しない。CLIP 判定のみに依存する
- **CLIPのプロンプト調整**: `'a correctly oriented upright photo'` の文言は画像の種類に応じてチューニングの余地がある（例: 風景写真向けに `'a photo with sky on top'` を追加）
- **閾値の調整**: `confidence > 0.6` の閾値は実データで検証して調整する。低すぎると誤補正、高すぎると漏れが増える