import { parentPort } from 'worker_threads'
import fs from 'fs'
import heicConvert from 'heic-convert'

interface HeicRequest {
  reqId: number
  filePath: string
  outputPath: string
}

const queue: HeicRequest[] = []
let processing = false

async function processQueue(): Promise<void> {
  if (processing) return
  processing = true

  while (queue.length > 0) {
    const msg = queue.shift()!
    try {
      const inputBuffer = fs.readFileSync(msg.filePath)
      const outputBuffer = await heicConvert({
        buffer: new Uint8Array(inputBuffer),
        format: 'JPEG',
        quality: 0.85
      })
      fs.writeFileSync(msg.outputPath, Buffer.from(outputBuffer))
      parentPort?.postMessage({ reqId: msg.reqId, success: true })
    } catch (err) {
      parentPort?.postMessage({
        reqId: msg.reqId,
        success: false,
        error: err instanceof Error ? err.message : String(err)
      })
    }
  }

  processing = false
}

parentPort?.on('message', (msg: HeicRequest) => {
  queue.push(msg)
  processQueue()
})
