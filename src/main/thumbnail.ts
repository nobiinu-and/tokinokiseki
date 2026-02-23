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

// --- HEIC Worker Pool ---

import os from 'os'

const HEIC_POOL_SIZE = Math.max(2, Math.min(os.cpus().length - 1, 4))
let heicPool: Worker[] = []
let heicPoolIdx = 0
let heicPoolIdleTimer: ReturnType<typeof setTimeout> | null = null

function ensureHeicPool(): void {
  if (heicPool.length > 0) {
    // Reset idle timer
    if (heicPoolIdleTimer) clearTimeout(heicPoolIdleTimer)
    heicPoolIdleTimer = setTimeout(shutdownHeicPool, 30000)
    return
  }

  ensureDirs()
  for (let i = 0; i < HEIC_POOL_SIZE; i++) {
    const w = new Worker(workerPath!)
    w.on('error', () => { /* handled per-request */ })
    heicPool.push(w)
  }
  heicPoolIdx = 0

  heicPoolIdleTimer = setTimeout(shutdownHeicPool, 30000)
}

function shutdownHeicPool(): void {
  for (const w of heicPool) w.terminate()
  heicPool = []
  heicPoolIdleTimer = null
}

let heicRequestId = 0

function convertHeicToJpeg(filePath: string, outputPath: string): Promise<void> {
  ensureHeicPool()
  const worker = heicPool[heicPoolIdx % heicPool.length]
  heicPoolIdx++
  const reqId = ++heicRequestId

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      worker.off('message', handler)
      reject(new Error(`HEIC conversion timed out: ${filePath}`))
    }, 120000)

    const handler = (msg: { reqId: number; success: boolean; error?: string }): void => {
      if (msg.reqId !== reqId) return // Not our response
      clearTimeout(timeout)
      worker.off('message', handler)
      if (msg.success) {
        resolve()
      } else {
        reject(new Error(msg.error || 'HEIC conversion failed'))
      }
    }

    worker.on('message', handler)
    worker.postMessage({ reqId, filePath, outputPath })
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

/**
 * Convert HEIC to JPEG cache if needed. Returns true if conversion was performed.
 * Can be called in parallel for multiple files before generateThumbnail.
 */
export async function ensureHeicCache(filePath: string): Promise<boolean> {
  if (!isHeic(filePath)) return false
  ensureDirs()
  const jpegCachePath = getHeicCachePath(filePath)
  if (fs.existsSync(jpegCachePath)) return false

  await convertHeicToJpeg(filePath, jpegCachePath)
  return true
}

export async function generateThumbnail(
  filePath: string,
  knownOrientation?: number
): Promise<string> {
  const thumbPath = getThumbnailPath(filePath)

  if (isHeic(filePath)) {
    // HEIC: ensure JPEG cache exists (may already be done by parallel pre-conversion)
    await ensureHeicCache(filePath)
    const jpegCachePath = getHeicCachePath(filePath)
    createThumbnailFromPath(jpegCachePath, thumbPath, 1)
    return thumbPath
  }

  if (fs.existsSync(thumbPath)) {
    return thumbPath
  }

  // Use provided orientation or read EXIF
  let orientation = knownOrientation ?? 1
  if (knownOrientation == null) {
    try {
      orientation = (await exifr.orientation(filePath)) || 1
    } catch {
      // No EXIF data
    }
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
