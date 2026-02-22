import { nativeImage } from 'electron'
import { Worker } from 'worker_threads'
import crypto from 'crypto'
import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import exifr from 'exifr'

const THUMB_SIZE = 300
const HEIC_EXTENSIONS = new Set(['.heic', '.heif'])

let thumbDir: string | null = null
let heicCacheDir: string | null = null
let workerPath: string | null = null

function ensureDirs(): void {
  if (thumbDir) return
  thumbDir = path.join(app.getPath('userData'), 'thumbnails')
  heicCacheDir = path.join(app.getPath('userData'), 'heic-cache')
  if (!fs.existsSync(thumbDir)) {
    fs.mkdirSync(thumbDir, { recursive: true })
  }
  if (!fs.existsSync(heicCacheDir)) {
    fs.mkdirSync(heicCacheDir, { recursive: true })
  }
  workerPath = path.join(__dirname, 'heic-worker.js')
}

export function initThumbnails(): void {
  ensureDirs()
}

export function getThumbDir(): string {
  ensureDirs()
  return thumbDir!
}

export function getThumbnailFileName(filePath: string): string {
  const hash = crypto.createHash('md5').update(filePath).digest('hex')
  return `${hash}.jpg`
}

export function getThumbnailPath(filePath: string): string {
  ensureDirs()
  return path.join(thumbDir!, getThumbnailFileName(filePath))
}

function isHeic(filePath: string): boolean {
  return HEIC_EXTENSIONS.has(path.extname(filePath).toLowerCase())
}

function getHeicCachePath(filePath: string): string {
  ensureDirs()
  const hash = crypto.createHash('md5').update(filePath).digest('hex')
  return path.join(heicCacheDir!, `${hash}.jpg`)
}

function convertHeicToJpeg(filePath: string, outputPath: string): Promise<void> {
  ensureDirs()
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerPath!)

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

/**
 * Rotate a nativeImage's bitmap based on EXIF orientation.
 * nativeImage does not reliably apply EXIF rotation, so we do it manually.
 */
function applyOrientationToNativeImage(
  img: Electron.NativeImage,
  orientation: number
): Electron.NativeImage {
  if (!orientation || orientation === 1) return img

  const { width, height } = img.getSize()
  const src = img.toBitmap()
  const bpp = 4 // BGRA, 4 bytes per pixel

  const transform = (
    newW: number,
    newH: number,
    mapFn: (x: number, y: number) => [number, number]
  ): Electron.NativeImage => {
    const dst = Buffer.alloc(newW * newH * bpp)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const srcOff = (y * width + x) * bpp
        const [dx, dy] = mapFn(x, y)
        const dstOff = (dy * newW + dx) * bpp
        src.copy(dst, dstOff, srcOff, srcOff + bpp)
      }
    }
    return nativeImage.createFromBitmap(dst, { width: newW, height: newH })
  }

  switch (orientation) {
    case 2:
      return transform(width, height, (x, y) => [width - 1 - x, y])
    case 3:
      return transform(width, height, (x, y) => [width - 1 - x, height - 1 - y])
    case 4:
      return transform(width, height, (x, y) => [x, height - 1 - y])
    case 5:
      return transform(height, width, (x, y) => [y, x])
    case 6:
      return transform(height, width, (x, y) => [height - 1 - y, x])
    case 7:
      return transform(height, width, (x, y) => [height - 1 - y, width - 1 - x])
    case 8:
      return transform(height, width, (x, y) => [y, width - 1 - x])
    default:
      return img
  }
}

function createThumbnailFromPath(
  sourcePath: string,
  thumbPath: string,
  orientation: number = 1
): void {
  const image = nativeImage.createFromPath(sourcePath)
  if (image.isEmpty()) {
    throw new Error(`Failed to load image: ${sourcePath}`)
  }

  const size = image.getSize()
  const scale = Math.min(THUMB_SIZE / size.width, THUMB_SIZE / size.height, 1)
  const newWidth = Math.round(size.width * scale)
  const newHeight = Math.round(size.height * scale)

  const resized = image.resize({ width: newWidth, height: newHeight, quality: 'good' })
  const corrected = applyOrientationToNativeImage(resized, orientation)
  const jpegBuffer = corrected.toJPEG(80)

  fs.writeFileSync(thumbPath, jpegBuffer)
}

const CORRECTION_TO_ORIENTATION: Record<number, number> = {
  90: 6,
  180: 3,
  270: 8
}

export function regenerateThumbnail(filePath: string, correctionDegrees: number): void {
  const thumbPath = getThumbnailPath(filePath)
  const orientation = CORRECTION_TO_ORIENTATION[correctionDegrees] || 1

  if (isHeic(filePath)) {
    const jpegCachePath = getHeicCachePath(filePath)
    if (fs.existsSync(jpegCachePath)) {
      createThumbnailFromPath(jpegCachePath, thumbPath, orientation)
      return
    }
  }

  createThumbnailFromPath(filePath, thumbPath, orientation)
}

export async function generateThumbnail(filePath: string): Promise<string> {
  const thumbPath = getThumbnailPath(filePath)

  if (isHeic(filePath)) {
    // HEIC: convert to JPEG cache first, then generate thumbnail from that.
    // heic-convert already applies HEIF rotation (irot) during decoding,
    // so the JPEG cache has correct pixel orientation — use orientation=1
    // to avoid double-rotation from EXIF orientation tag.
    const jpegCachePath = getHeicCachePath(filePath)

    if (!fs.existsSync(jpegCachePath)) {
      await convertHeicToJpeg(filePath, jpegCachePath)
    }

    createThumbnailFromPath(jpegCachePath, thumbPath, 1)
    return thumbPath
  }

  if (fs.existsSync(thumbPath)) {
    return thumbPath
  }

  // Read EXIF orientation from the original file
  let orientation = 1
  try {
    orientation = (await exifr.orientation(filePath)) || 1
  } catch {
    // No EXIF data
  }

  // Non-HEIC: direct thumbnail generation
  createThumbnailFromPath(filePath, thumbPath, orientation)
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
