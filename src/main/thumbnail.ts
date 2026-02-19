import { nativeImage } from 'electron'
import { Worker } from 'worker_threads'
import crypto from 'crypto'
import path from 'path'
import fs from 'fs'
import { app } from 'electron'

const THUMB_SIZE = 300
const HEIC_EXTENSIONS = new Set(['.heic', '.heif'])

let thumbDir: string
let heicCacheDir: string
let workerPath: string

export function initThumbnails(): void {
  thumbDir = path.join(app.getPath('userData'), 'thumbnails')
  heicCacheDir = path.join(app.getPath('userData'), 'heic-cache')
  if (!fs.existsSync(thumbDir)) {
    fs.mkdirSync(thumbDir, { recursive: true })
  }
  if (!fs.existsSync(heicCacheDir)) {
    fs.mkdirSync(heicCacheDir, { recursive: true })
  }

  // Worker script path (built output)
  workerPath = path.join(__dirname, 'heic-worker.js')
}

export function getThumbDir(): string {
  return thumbDir
}

export function getThumbnailFileName(filePath: string): string {
  const hash = crypto.createHash('md5').update(filePath).digest('hex')
  return `${hash}.jpg`
}

export function getThumbnailPath(filePath: string): string {
  return path.join(thumbDir, getThumbnailFileName(filePath))
}

function isHeic(filePath: string): boolean {
  return HEIC_EXTENSIONS.has(path.extname(filePath).toLowerCase())
}

function getHeicCachePath(filePath: string): string {
  const hash = crypto.createHash('md5').update(filePath).digest('hex')
  return path.join(heicCacheDir, `${hash}.jpg`)
}

function convertHeicToJpeg(filePath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerPath)

    const timeout = setTimeout(() => {
      worker.terminate()
      reject(new Error(`HEIC conversion timed out: ${filePath}`))
    }, 120000) // 2 min timeout

    worker.on('message', (msg: { success: boolean; error?: string }) => {
      clearTimeout(timeout)
      worker.terminate()
      if (msg.success) {
        resolve()
      } else {
        reject(new Error(msg.error || 'HEIC conversion failed'))
      }
    })

    worker.on('error', (err) => {
      clearTimeout(timeout)
      worker.terminate()
      reject(err)
    })

    worker.postMessage({ filePath, outputPath })
  })
}

function createThumbnailFromPath(sourcePath: string, thumbPath: string): void {
  const image = nativeImage.createFromPath(sourcePath)
  if (image.isEmpty()) {
    throw new Error(`Failed to load image: ${sourcePath}`)
  }

  const size = image.getSize()
  const scale = Math.min(THUMB_SIZE / size.width, THUMB_SIZE / size.height, 1)
  const newWidth = Math.round(size.width * scale)
  const newHeight = Math.round(size.height * scale)

  const resized = image.resize({ width: newWidth, height: newHeight, quality: 'good' })
  const jpegBuffer = resized.toJPEG(80)

  fs.writeFileSync(thumbPath, jpegBuffer)
}

export async function generateThumbnail(filePath: string): Promise<string> {
  const thumbPath = getThumbnailPath(filePath)

  if (fs.existsSync(thumbPath)) {
    return thumbPath
  }

  if (isHeic(filePath)) {
    // HEIC: convert to JPEG cache first, then generate thumbnail from that
    const jpegCachePath = getHeicCachePath(filePath)

    if (!fs.existsSync(jpegCachePath)) {
      await convertHeicToJpeg(filePath, jpegCachePath)
    }

    createThumbnailFromPath(jpegCachePath, thumbPath)
    return thumbPath
  }

  // Non-HEIC: direct thumbnail generation
  createThumbnailFromPath(filePath, thumbPath)
  return thumbPath
}

/**
 * Get the displayable file URL for a photo.
 * For HEIC files, returns the cached JPEG conversion.
 * For other formats, returns the original file.
 */
export function getDisplayPath(filePath: string): string {
  if (isHeic(filePath)) {
    const jpegCachePath = getHeicCachePath(filePath)
    if (fs.existsSync(jpegCachePath)) {
      return jpegCachePath
    }
  }
  return filePath
}
