import { parentPort } from 'worker_threads'
import fs from 'fs'
import heicConvert from 'heic-convert'

parentPort?.on('message', async (msg: { reqId: number; filePath: string; outputPath: string }) => {
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
})
