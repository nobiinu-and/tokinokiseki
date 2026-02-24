import fs from 'fs'
import path from 'path'
import exifr from 'exifr'
import { BrowserWindow } from 'electron'
import { insertPhoto, photoExists, upsertFolder, saveDatabase, updateFolderScanTime } from './database'
import { generateThumbnail, getThumbnailPath, ensureHeicCache } from './thumbnail'
import { IPC_CHANNELS } from '../renderer/src/types/ipc'
import type { ScanProgress } from '../renderer/src/types/models'

const SUPPORTED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.heic', '.heif', '.webp'])
const HEIC_EXTENSIONS = new Set(['.heic', '.heif'])

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

  // Check existence once for all files and reuse in HEIC pre-convert + main loop
  const existsSet = new Set<string>()
  for (const f of files) {
    if (photoExists(f)) {
      existsSet.add(f)
    }
  }

  // Pre-convert HEIC files in parallel (worker pool handles concurrency)
  const heicFiles = files.filter(
    (f) => HEIC_EXTENSIONS.has(path.extname(f).toLowerCase()) && !existsSet.has(f)
  )
  if (heicFiles.length > 0) {
    const HEIC_BATCH = 8
    const failedFiles: string[] = []

    for (let b = 0; b < heicFiles.length; b += HEIC_BATCH) {
      const batch = heicFiles.slice(b, b + HEIC_BATCH)
      const results = await Promise.allSettled(batch.map((f) => ensureHeicCache(f)))
      for (let j = 0; j < results.length; j++) {
        if (results[j].status === 'rejected') {
          failedFiles.push(batch[j])
        }
      }

      sendProgress(window, {
        phase: 'converting_heic',
        current: Math.min(b + HEIC_BATCH, heicFiles.length),
        total: heicFiles.length,
        currentFile: ''
      })
    }

    // Retry failed files one by one
    if (failedFiles.length > 0) {
      console.log(`[scan] HEIC pre-convert: ${failedFiles.length} failed, retrying...`)
      let retrySuccess = 0
      for (const f of failedFiles) {
        try {
          await ensureHeicCache(f)
          retrySuccess++
        } catch {
          // Will be handled during main loop
        }
      }
      if (retrySuccess < failedFiles.length) {
        console.log(`[scan] HEIC retry: ${retrySuccess}/${failedFiles.length} recovered`)
      }
    }
  }

  let insertedCount = 0

  for (let i = 0; i < files.length; i++) {
    const filePath = files[i]

    if (existsSet.has(filePath)) {
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

    // Extract EXIF date and orientation
    let takenAt: string | null = null
    let orientation: number = 1
    try {
      const exif = await exifr.parse(filePath, {
        pick: ['DateTimeOriginal']
      })
      if (exif?.DateTimeOriginal instanceof Date) {
        takenAt = exif.DateTimeOriginal.toISOString()
      }
    } catch {
      // EXIF not available
    }
    try {
      // exifr.orientation() returns numeric EXIF orientation (1-8)
      // Note: exifr.parse() translates Orientation to a string, so we use the dedicated helper
      orientation = (await exifr.orientation(filePath)) || 1
    } catch {
      // No orientation data
    }

    // Fallback to file modified date
    let fileModifiedAt: string | null = null
    try {
      const stat = await fs.promises.stat(filePath)
      fileModifiedAt = stat.mtime.toISOString()
    } catch {
      // stat failed
    }

    // Generate thumbnail (pass orientation to avoid second EXIF read)
    try {
      await generateThumbnail(filePath, orientation)
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

    // Periodically yield to the event loop so GC can reclaim nativeImage memory.
    if (insertedCount % 100 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0))
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
