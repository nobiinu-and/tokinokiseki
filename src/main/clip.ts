import { Worker } from 'worker_threads'
import { BrowserWindow, app } from 'electron'
import path from 'path'
import fs from 'fs'
import exifr from 'exifr'
import { IPC_CHANNELS } from '../renderer/src/types/ipc'
import * as db from './database'
import { getThumbnailPath } from './thumbnail'

interface LabelDef {
  label: string
  display: string
}

export async function startAutoTag(
  folderId: number,
  labels: LabelDef[],
  threshold: number,
  mainWindow: BrowserWindow,
  date?: string,
  signal?: AbortSignal
): Promise<{ tagged: number }> {
  await db.ensureDb()
  const photos = date
    ? db.getPhotosByDate(folderId, date).map((p) => ({ id: p.id, filePath: p.filePath }))
    : db.getAllPhotosInFolder(folderId)
  const total = photos.length

  if (total === 0) {
    return { tagged: 0 }
  }

  // Prepare model cache directory
  const cacheDir = path.join(app.getPath('userData'), 'clip-models')
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true })
  }

  const workerPath = path.join(__dirname, 'clip-worker.js')
  const worker = new Worker(workerPath)

  // Ensure tags exist in DB
  const tagMap = new Map<string, { tagId: number; display: string }>()
  for (const l of labels) {
    const tagId = db.upsertTag(l.display)
    tagMap.set(l.label, { tagId, display: l.display })
  }
  db.saveDatabase()

  const labelStrings = labels.map((l) => l.label)

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
      total
    })

    worker.postMessage({ type: 'init', cacheDir })
  })

  // Process each photo
  let processed = 0
  let tagged = 0

  for (const photo of photos) {
    if (signal?.aborted) {
      db.saveDatabase()
      worker.terminate()
      return { tagged }
    }

    // Use thumbnail if available for faster processing
    const thumbPath = getThumbnailPath(photo.filePath)
    const imagePath = fs.existsSync(thumbPath) ? thumbPath : photo.filePath

    // Always read EXIF orientation from the original file.
    // nativeImage does not reliably apply EXIF rotation when generating thumbnails,
    // so both thumbnails and originals may need correction.
    let orientation = 1
    try {
      orientation = (await exifr.orientation(photo.filePath)) || 1
    } catch {
      // No EXIF data
    }

    try {
      const result = await new Promise<{ label: string; score: number }[]>(
        (resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error(`Classification timed out: ${photo.filePath}`))
          }, 30000)

          const handler = (msg: { type: string; tags?: { label: string; score: number }[]; message?: string }): void => {
            if (msg.type === 'result') {
              clearTimeout(timeout)
              worker.off('message', handler)
              resolve(msg.tags || [])
            } else if (msg.type === 'error') {
              clearTimeout(timeout)
              worker.off('message', handler)
              reject(new Error(msg.message || 'Classification failed'))
            }
          }
          worker.on('message', handler)
          worker.postMessage({ type: 'classify', imagePath, labels: labelStrings, orientation })
        }
      )

      // Save tags above threshold
      let photoTagged = false
      for (const tag of result) {
        if (tag.score >= threshold) {
          const entry = tagMap.get(tag.label)
          if (entry) {
            db.insertPhotoTag(photo.id, entry.tagId, tag.score)
            photoTagged = true
          }
        }
      }
      if (photoTagged) tagged++
    } catch (err) {
      console.error(`Failed to classify photo ${photo.filePath}:`, err)
    }

    processed++
    if (processed % 5 === 0 || processed === total) {
      db.saveDatabase()
    }

    mainWindow.webContents.send(IPC_CHANNELS.AUTO_TAG_PROGRESS, {
      phase: 'classifying' as const,
      current: processed,
      total
    })
  }

  db.saveDatabase()
  worker.terminate()

  return { tagged }
}
