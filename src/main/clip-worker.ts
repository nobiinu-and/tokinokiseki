import { parentPort } from 'worker_threads'
import { env, pipeline, type ZeroShotImageClassificationPipeline } from '@huggingface/transformers'

let classifier: ZeroShotImageClassificationPipeline | null = null

parentPort?.on('message', async (msg: { type: string; cacheDir?: string; imagePath?: string; labels?: string[] }) => {
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
    } else if (msg.type === 'classify') {
      if (!classifier) {
        parentPort?.postMessage({ type: 'error', message: 'Model not initialized' })
        return
      }

      // Single-pass: classify with all labels + baseline "a photo" at once.
      // The image is encoded only once regardless of label count (~7x faster).
      const allLabels = [...msg.labels!, 'a photo']
      const results = await classifier(msg.imagePath!, allLabels)
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
})
