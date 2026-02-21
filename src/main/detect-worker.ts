import { parentPort } from 'worker_threads'
import {
  env,
  pipeline,
  RawImage,
  type ObjectDetectionPipeline
} from '@huggingface/transformers'

let detector: ObjectDetectionPipeline | null = null

/**
 * Apply EXIF orientation by rotating/flipping pixel data.
 * Returns a new RawImage with corrected orientation.
 */
function applyExifOrientation(image: RawImage, orientation: number): RawImage {
  if (orientation === 1 || orientation < 1 || orientation > 8) return image

  const { width, height, channels } = image
  const src = image.data as Uint8ClampedArray

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
    case 2:
      return rotate(width, height, (x, y) => [width - 1 - x, y])
    case 3:
      return rotate(width, height, (x, y) => [width - 1 - x, height - 1 - y])
    case 4:
      return rotate(width, height, (x, y) => [x, height - 1 - y])
    case 5:
      return rotate(height, width, (x, y) => [y, x])
    case 6:
      return rotate(height, width, (x, y) => [height - 1 - y, x])
    case 7:
      return rotate(height, width, (x, y) => [width - 1 - y, width - 1 - x])
    case 8:
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
    threshold?: number
    orientation?: number
  }) => {
    try {
      if (msg.type === 'init') {
        env.cacheDir = msg.cacheDir || ''
        env.allowLocalModels = true
        env.backends.onnx.wasm.numThreads = 1

        detector = await pipeline('object-detection', 'Xenova/yolos-tiny', { dtype: 'q8' })

        parentPort?.postMessage({ type: 'ready' })
      } else if (msg.type === 'detect') {
        if (!detector) {
          parentPort?.postMessage({ type: 'error', message: 'Model not initialized' })
          return
        }

        let image = await RawImage.read(msg.imagePath!)
        const orientation = msg.orientation ?? 1
        if (orientation !== 1) {
          image = applyExifOrientation(image, orientation)
        }

        const threshold = msg.threshold ?? 0.5
        const results = await detector(image, { threshold })
        const resultArray = results as Array<{
          label: string
          score: number
          box: { xmin: number; ymin: number; xmax: number; ymax: number }
        }>

        // De-duplicate: keep only the highest confidence per label
        const bestByLabel = new Map<string, number>()
        for (const det of resultArray) {
          const existing = bestByLabel.get(det.label) ?? 0
          if (det.score > existing) {
            bestByLabel.set(det.label, det.score)
          }
        }

        const tags = Array.from(bestByLabel.entries()).map(([label, score]) => ({
          label,
          score
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
