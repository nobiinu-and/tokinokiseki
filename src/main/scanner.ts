import fs from 'fs'
import path from 'path'
import exifr from 'exifr'
import { BrowserWindow } from 'electron'
import { insertPhoto, photoExists, upsertFolder, saveDatabase, updateFolderScanTime } from './database'
import { generateThumbnail, getThumbnailPath } from './thumbnail'
import { IPC_CHANNELS } from '../renderer/src/types/ipc'
import type { ScanProgress } from '../renderer/src/types/models'

const SUPPORTED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.heic', '.heif', '.webp'])

async function discoverFiles(dirPath: string): Promise<string[]> {
  const results: string[] = []

  async function walk(dir: string): Promise<void> {
    let entries: fs.Dirent[]
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(fullPath)
      } else if (SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        results.push(fullPath)
      }
    }
  }

  await walk(dirPath)
  return results
}

function sendProgress(window: BrowserWindow, progress: ScanProgress): void {
  if (!window.isDestroyed()) {
    window.webContents.send(IPC_CHANNELS.SCAN_PROGRESS, progress)
  }
}

export async function scanFolder(folderPath: string, window: BrowserWindow): Promise<void> {
  const folderId = upsertFolder(folderPath)

  sendProgress(window, {
    phase: 'discovering',
    current: 0,
    total: 0,
    currentFile: ''
  })

  const files = await discoverFiles(folderPath)
  const total = files.length

  let insertedCount = 0

  for (let i = 0; i < files.length; i++) {
    const filePath = files[i]

    if (photoExists(filePath)) {
      // Regenerate missing thumbnails for already-registered photos
      if (!fs.existsSync(getThumbnailPath(filePath))) {
        try {
          await generateThumbnail(filePath)
        } catch {
          // Thumbnail generation failed
        }
      }
      if (i % 50 === 0 || i === files.length - 1) {
        sendProgress(window, {
          phase: 'processing',
          current: i + 1,
          total,
          currentFile: path.basename(filePath)
        })
      }
      continue
    }

    // Extract EXIF date
    let takenAt: string | null = null
    try {
      const exif = await exifr.parse(filePath, { pick: ['DateTimeOriginal'] })
      if (exif?.DateTimeOriginal instanceof Date) {
        takenAt = exif.DateTimeOriginal.toISOString()
      }
    } catch {
      // EXIF not available
    }

    // Fallback to file modified date
    let fileModifiedAt: string | null = null
    try {
      const stat = await fs.promises.stat(filePath)
      fileModifiedAt = stat.mtime.toISOString()
    } catch {
      // stat failed
    }

    // Generate thumbnail
    try {
      await generateThumbnail(filePath)
    } catch (err) {
      console.error(`Thumbnail generation failed for ${filePath}:`, err)
    }

    // Insert into DB
    insertPhoto({
      folderId,
      filePath,
      fileName: path.basename(filePath),
      takenAt,
      fileModifiedAt,
      width: null,
      height: null
    })

    insertedCount++

    // Save DB periodically (every 100 inserts)
    if (insertedCount % 100 === 0) {
      saveDatabase()
    }

    // Send progress (throttled)
    if (i % 10 === 0 || i === files.length - 1) {
      sendProgress(window, {
        phase: 'processing',
        current: i + 1,
        total,
        currentFile: path.basename(filePath)
      })
    }
  }

  // Final save
  saveDatabase()
  updateFolderScanTime(folderId)

  if (!window.isDestroyed()) {
    window.webContents.send(IPC_CHANNELS.SCAN_COMPLETE)
  }
}
