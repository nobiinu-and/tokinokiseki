import { parentPort } from 'worker_threads'
import {
  env,
  pipeline,
  RawImage,
  type ZeroShotImageClassificationPipeline
} from '@huggingface/transformers'

let classifier: ZeroShotImageClassificationPipeline | null = null

/**
 * Apply EXIF orientation by rotating/flipping pixel data.
 * Returns a new RawImage with corrected orientation.
 */
function applyExifOrientation(image: RawImage, orientation: number): RawImage {
  if (orientation === 1 || orientation < 1 || orientation > 8) return image

  const { width, height, channels } = image
  const src = image.data as Uint8ClampedArray

  // Helper: create output and copy pixel from (srcX, srcY) to (dstX, dstY)
  const rotate = (
    newW: number,
    newH: number,
    mapFn: (x: number, y: number) => [number, number]
  ): RawImage => {
    const dst = new Uint8ClampedArray(newW * newH * channels)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const srcIdx = (y * width + x) * channels
        const [dx, dy] = mapFn(x, y)
        const dstIdx = (dy * newW + dx) * channels
        for (let c = 0; c < channels; c++) {
          dst[dstIdx + c] = src[srcIdx + c]
        }
      }
    }
    return new RawImage(dst, newW, newH, channels)
  }

  switch (orientation) {
    case 2: // flip horizontal
      return rotate(width, height, (x, y) => [width - 1 - x, y])
    case 3: // rotate 180
      return rotate(width, height, (x, y) => [width - 1 - x, height - 1 - y])
    case 4: // flip vertical
      return rotate(width, height, (x, y) => [x, height - 1 - y])
    case 5: // transpose (rotate 90 CW + flip horizontal)
      return rotate(height, width, (x, y) => [y, x])
    case 6: // rotate 90 CW
      return rotate(height, width, (x, y) => [height - 1 - y, x])
    case 7: // transverse (rotate 90 CCW + flip horizontal)
      return rotate(height, width, (x, y) => [width - 1 - y, width - 1 - x])
    case 8: // rotate 90 CCW
      return rotate(height, width, (x, y) => [y, width - 1 - x])
    default:
      return image
  }
}

parentPort?.on(
  'message',
  async (msg: {
    type: string
    cacheDir?: string
    imagePath?: string
    labels?: string[]
    orientation?: number
  }) => {
    try {
      if (msg.type === 'init') {
        // Configure model cache directory
        env.cacheDir = msg.cacheDir || ''
        // Disable local model check to always allow download
        env.allowLocalModels = true
        // Use WASM backend (onnxruntime-node may not work on Node v24)
        env.backends.onnx.wasm.numThreads = 1

        classifier = await pipeline(
          'zero-shot-image-classification',
          'Xenova/clip-vit-base-patch32',
          { dtype: 'q8' }
        )

        parentPort?.postMessage({ type: 'ready' })
      } else if (msg.type === 'check-rotation') {
        if (!classifier) {
          parentPort?.postMessage({ type: 'error', message: 'Model not initialized' })
          return
        }

        const baseImage = await RawImage.read(msg.imagePath!)

        // Map: correction degrees -> EXIF orientation value
        const rotations: { degrees: number; orientation: number }[] = [
          { degrees: 0, orientation: 1 },
          { degrees: 90, orientation: 6 },
          { degrees: 180, orientation: 3 },
          { degrees: 270, orientation: 8 }
        ]

        const rotationLabels = [
          'a correctly oriented upright photo',
          'a rotated or upside down photo'
        ]

        let bestDegrees = 0
        let bestScore = -1

        for (const rot of rotations) {
          const rotated =
            rot.orientation === 1 ? baseImage : applyExifOrientation(baseImage, rot.orientation)
          const results = await classifier(rotated, rotationLabels)
          const resultArray = results as Array<{ label: string; score: number }>
          const uprightScore =
            resultArray.find((r) => r.label === rotationLabels[0])?.score ?? 0

          if (uprightScore > bestScore) {
            bestScore = uprightScore
            bestDegrees = rot.degrees
          }
        }

        parentPort?.postMessage({
          type: 'rotation-result',
          rotation: bestDegrees,
          confidence: bestScore
        })
      } else if (msg.type === 'classify') {
        if (!classifier) {
          parentPort?.postMessage({ type: 'error', message: 'Model not initialized' })
          return
        }

        // Load image and apply EXIF orientation correction
        let image = await RawImage.read(msg.imagePath!)
        const orientation = msg.orientation ?? 1
        if (orientation !== 1) {
          image = applyExifOrientation(image, orientation)
        }

        // Single-pass: classify with all labels + baseline "a photo" at once.
        // The image is encoded only once regardless of label count (~7x faster).
        const allLabels = [...msg.labels!, 'a photo']
        const results = await classifier(image, allLabels)
        const resultArray = results as Array<{ label: string; score: number }>

        // Derive independent binary score per label from the joint softmax.
        // binary_score(i) = p(i) / (p(i) + p(baseline))
        // Mathematically equivalent to per-label binary softmax.
        const baselineScore = resultArray.find((r) => r.label === 'a photo')?.score ?? 0
        const tags = resultArray
          .filter((r) => r.label !== 'a photo')
          .map((r) => ({
            label: r.label,
            score: baselineScore > 0 ? r.score / (r.score + baselineScore) : 1
          }))

        parentPort?.postMessage({ type: 'result', tags })
      }
    } catch (err) {
      parentPort?.postMessage({
        type: 'error',
        message: err instanceof Error ? err.message : String(err)
      })
    }
  }
)
