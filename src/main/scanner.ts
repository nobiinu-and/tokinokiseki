import fs from 'fs'
import path from 'path'
import exifr from 'exifr'
import { BrowserWindow } from 'electron'
import { insertPhoto, photoExists, upsertFolder, saveDatabase, updateFolderScanTime } from './database'
import { generateThumbnail, getThumbnailPath, thumbPerf, ensureHeicCache } from './thumbnail'
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

  // Pre-convert HEIC files in parallel (worker pool handles concurrency)
  const heicFiles = files.filter(
    (f) => HEIC_EXTENSIONS.has(path.extname(f).toLowerCase()) && !photoExists(f)
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
      console.log(`[scan-perf] HEIC pre-convert: ${failedFiles.length} failed, retrying...`)
      let retrySuccess = 0
      for (const f of failedFiles) {
        try {
          await ensureHeicCache(f)
          retrySuccess++
        } catch {
          // Will be handled during main loop
        }
      }
      console.log(`[scan-perf] HEIC retry: ${retrySuccess}/${failedFiles.length} recovered`)
    }

    console.log(`[scan-perf] HEIC pre-convert: ${heicFiles.length} files, heic:${Math.round(thumbPerf.heic)}ms`)
    thumbPerf.heic = 0
    thumbPerf.heicCount = 0
  }

  let insertedCount = 0

  // --- Perf logging ---
  const PERF_INTERVAL = 50
  let perfExif = 0
  let perfStat = 0
  let perfThumb = 0
  let perfInsert = 0
  let perfExists = 0
  let perfBatchStart = performance.now()

  for (let i = 0; i < files.length; i++) {
    const filePath = files[i]

    let t0 = performance.now()
    const exists = photoExists(filePath)
    perfExists += performance.now() - t0

    if (exists) {
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

    // Extract EXIF date and orientation in a single read
    let takenAt: string | null = null
    let orientation: number = 1
    t0 = performance.now()
    try {
      const exif = await exifr.parse(filePath, {
        pick: ['DateTimeOriginal', 'Orientation']
      })
      if (exif?.DateTimeOriginal instanceof Date) {
        takenAt = exif.DateTimeOriginal.toISOString()
      }
      if (typeof exif?.Orientation === 'number') {
        orientation = exif.Orientation
      }
    } catch {
      // EXIF not available
    }
    perfExif += performance.now() - t0

    // Fallback to file modified date
    let fileModifiedAt: string | null = null
    t0 = performance.now()
    try {
      const stat = await fs.promises.stat(filePath)
      fileModifiedAt = stat.mtime.toISOString()
    } catch {
      // stat failed
    }
    perfStat += performance.now() - t0

    // Generate thumbnail (pass orientation to avoid second EXIF read)
    t0 = performance.now()
    try {
      await generateThumbnail(filePath, orientation)
    } catch (err) {
      console.error(`Thumbnail generation failed for ${filePath}:`, err)
    }
    perfThumb += performance.now() - t0

    // Insert into DB
    t0 = performance.now()
    insertPhoto({
      folderId,
      filePath,
      fileName: path.basename(filePath),
      takenAt,
      fileModifiedAt,
      width: null,
      height: null
    })
    perfInsert += performance.now() - t0

    insertedCount++

    // Periodically yield to the event loop so GC can reclaim nativeImage memory.
    if (insertedCount % 100 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0))
      saveDatabase()
    }

    // Perf log every PERF_INTERVAL photos
    if (insertedCount % PERF_INTERVAL === 0) {
      const batchElapsed = performance.now() - perfBatchStart
      const mem = process.memoryUsage()
      console.log(
        `[scan-perf] #${insertedCount} | batch ${PERF_INTERVAL} in ${Math.round(batchElapsed)}ms` +
        ` | exists:${Math.round(perfExists)}ms exif:${Math.round(perfExif)}ms` +
        ` stat:${Math.round(perfStat)}ms thumb:${Math.round(perfThumb)}ms` +
        ` (load:${Math.round(thumbPerf.load)}ms resize:${Math.round(thumbPerf.resize)}ms` +
        ` encode:${Math.round(thumbPerf.encode)}ms write:${Math.round(thumbPerf.write)}ms` +
        ` heic:${Math.round(thumbPerf.heic)}ms x${thumbPerf.heicCount})` +
        ` insert:${Math.round(perfInsert)}ms` +
        ` | rss:${Math.round(mem.rss / 1024 / 1024)}MB` +
        ` heap:${Math.round(mem.heapUsed / 1024 / 1024)}/${Math.round(mem.heapTotal / 1024 / 1024)}MB` +
        ` external:${Math.round(mem.external / 1024 / 1024)}MB`
      )
      thumbPerf.load = 0
      thumbPerf.resize = 0
      thumbPerf.encode = 0
      thumbPerf.write = 0
      thumbPerf.heic = 0
      thumbPerf.heicCount = 0
      thumbPerf.count = 0
      perfExif = 0
      perfStat = 0
      perfThumb = 0
      perfInsert = 0
      perfExists = 0
      perfBatchStart = performance.now()
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
