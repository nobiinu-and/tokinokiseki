import { Worker } from 'worker_threads'
import { BrowserWindow, app } from 'electron'
import path from 'path'
import fs from 'fs'
import exifr from 'exifr'
import { IPC_CHANNELS } from '../renderer/src/types/ipc'
import * as db from './database'
import { getThumbnailPath, regenerateThumbnail } from './thumbnail'

export async function startRotationCheck(
  folderId: number,
  threshold: number,
  mainWindow: BrowserWindow,
  date?: string,
  signal?: AbortSignal
): Promise<{ checked: number; corrected: number }> {
  await db.ensureDb()
  const photos = db.getPhotosNeedingRotationCheck(folderId, date)
  const total = photos.length

  if (total === 0) {
    return { checked: 0, corrected: 0 }
  }

  // Filter to only photos missing EXIF orientation
  const needsCheck: { id: number; filePath: string }[] = []
  for (let i = 0; i < photos.length; i++) {
    if (signal?.aborted) {
      db.saveDatabase()
      return { checked: 0, corrected: 0 }
    }

    const photo = photos[i]
    let orientation: number | null = null
    try {
      orientation = await exifr.orientation(photo.filePath)
    } catch {
      // No EXIF data
    }
    if (orientation == null) {
      needsCheck.push(photo)
    } else {
      // Has EXIF orientation — mark as not needing correction
      db.updateOrientationCorrection(photo.id, 0)
    }

    if ((i + 1) % 50 === 0 || i + 1 === total) {
      mainWindow.webContents.send(IPC_CHANNELS.AUTO_TAG_PROGRESS, {
        phase: 'filtering_exif' as const,
        current: i + 1,
        total
      })
    }
  }

  if (needsCheck.length === 0) {
    db.saveDatabase()
    return { checked: total, corrected: 0 }
  }

  const checkTotal = needsCheck.length

  // Prepare model cache directory
  const cacheDir = path.join(app.getPath('userData'), 'clip-models')
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true })
  }

  const workerPath = path.join(__dirname, 'clip-worker.js')
  const worker = new Worker(workerPath)

  // Wait for model init
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      worker.terminate()
      reject(new Error('CLIP model initialization timed out (5 min)'))
    }, 300000)

    const handler = (msg: { type: string; message?: string }): void => {
      if (msg.type === 'ready') {
        clearTimeout(timeout)
        worker.off('message', handler)
        resolve()
      } else if (msg.type === 'error') {
        clearTimeout(timeout)
        worker.off('message', handler)
        reject(new Error(msg.message || 'CLIP init failed'))
      }
    }
    worker.on('message', handler)
    worker.on('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })

    mainWindow.webContents.send(IPC_CHANNELS.AUTO_TAG_PROGRESS, {
      phase: 'loading_model' as const,
      current: 0,
      total: checkTotal
    })

    worker.postMessage({ type: 'init', cacheDir })
  })

  let processed = 0
  let corrected = 0

  for (const photo of needsCheck) {
    if (signal?.aborted) {
      db.saveDatabase()
      worker.terminate()
      return { checked: total, corrected }
    }

    // Use thumbnail if available for faster processing
    const thumbPath = getThumbnailPath(photo.filePath)
    const imagePath = fs.existsSync(thumbPath) ? thumbPath : photo.filePath

    try {
      const result = await new Promise<{ rotation: number; confidence: number }>(
        (resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error(`Rotation check timed out: ${photo.filePath}`))
          }, 60000)

          const handler = (msg: {
            type: string
            rotation?: number
            confidence?: number
            message?: string
          }): void => {
            if (msg.type === 'rotation-result') {
              clearTimeout(timeout)
              worker.off('message', handler)
              resolve({ rotation: msg.rotation!, confidence: msg.confidence! })
            } else if (msg.type === 'error') {
              clearTimeout(timeout)
              worker.off('message', handler)
              reject(new Error(msg.message || 'Rotation check failed'))
            }
          }
          worker.on('message', handler)
          worker.postMessage({ type: 'check-rotation', imagePath })
        }
      )

      if (result.confidence > threshold && result.rotation !== 0) {
        db.updateOrientationCorrection(photo.id, result.rotation)
        regenerateThumbnail(photo.filePath, result.rotation)
        corrected++
      } else {
        db.updateOrientationCorrection(photo.id, 0)
      }
    } catch (err) {
      console.error(`Failed rotation check for ${photo.filePath}:`, err)
      // Mark as checked (no correction) to avoid re-checking
      db.updateOrientationCorrection(photo.id, 0)
    }

    processed++
    if (processed % 5 === 0 || processed === checkTotal) {
      db.saveDatabase()
    }

    mainWindow.webContents.send(IPC_CHANNELS.AUTO_TAG_PROGRESS, {
      phase: 'checking_rotation' as const,
      current: processed,
      total: checkTotal
    })
  }

  db.saveDatabase()
  worker.terminate()

  return { checked: total, corrected }
}
