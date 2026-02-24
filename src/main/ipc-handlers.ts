import { ipcMain, dialog, shell, BrowserWindow } from 'electron'
import { pathToFileURL } from 'url'
import fs from 'fs'
import { IPC_CHANNELS } from '../renderer/src/types/ipc'
import * as db from './database'
import { scanFolder } from './scanner'
import { getThumbnailPath, getDisplayPath } from './thumbnail'
import { startAutoTag } from './clip'
import { startDetection } from './detect'
import { startRotationCheck } from './rotation'
import { findDuplicateGroups } from './duplicate'

let isAutoTagRunning = false
let autoTagAbort: AbortController | null = null

export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle(IPC_CHANNELS.SELECT_FOLDER, async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle(IPC_CHANNELS.GET_FOLDERS, async () => {
    await db.ensureDb()
    return db.getFolders()
  })

  ipcMain.handle(IPC_CHANNELS.START_SCAN, async (_event, folderPath: string) => {
    await db.ensureDb()
    await scanFolder(folderPath, mainWindow)
  })

  ipcMain.handle(IPC_CHANNELS.GET_DATE_SUMMARY, async (_event, timelineId: number) => {
    await db.ensureDb()
    const folderIds = db.resolveTimelineFolderIds(timelineId)
    const summaries = db.getDateSummary(folderIds)
    return summaries.map((s) => ({
      ...s,
      thumbnailPath: pathToFileURL(getThumbnailPath(s.representativeFilePath)).toString()
    }))
  })

  ipcMain.handle(
    IPC_CHANNELS.GET_PHOTOS_BY_DATE,
    async (_event, timelineId: number, date: string) => {
      await db.ensureDb()
      const folderIds = db.resolveTimelineFolderIds(timelineId)
      return db.getPhotosByDate(folderIds, date)
    }
  )

  ipcMain.handle(IPC_CHANNELS.TOGGLE_BEST, async (_event, photoId: number) => {
    await db.ensureDb()
    return db.toggleBest(photoId)
  })

  ipcMain.handle(IPC_CHANNELS.GET_BEST_PHOTOS, async (_event, timelineId: number) => {
    await db.ensureDb()
    const folderIds = db.resolveTimelineFolderIds(timelineId)
    return db.getBestPhotos(folderIds)
  })

  ipcMain.handle(
    IPC_CHANNELS.GET_BEST_PHOTOS_FOR_DATE,
    async (_event, timelineId: number, date: string) => {
      await db.ensureDb()
      const folderIds = db.resolveTimelineFolderIds(timelineId)
      return db.getBestPhotosForDate(folderIds, date)
    }
  )

  ipcMain.handle(IPC_CHANNELS.GET_THUMBNAIL_PATH, async (_event, photoId: number) => {
    await db.ensureDb()
    const photo = db.getPhotoById(photoId)
    if (!photo) return null
    return pathToFileURL(getThumbnailPath(photo.filePath)).toString()
  })

  ipcMain.handle(IPC_CHANNELS.GET_PHOTO_FILE_URL, (_event, filePath: string) => {
    // For HEIC files, return the cached JPEG conversion if available
    return pathToFileURL(getDisplayPath(filePath)).toString()
  })

  // --- Tag handlers ---

  ipcMain.handle(
    IPC_CHANNELS.START_AUTO_TAG,
    async (
      _event,
      timelineId: number,
      labels: { label: string; display: string }[],
      threshold: number,
      detectEnabled: boolean,
      detectThreshold: number,
      rotationEnabled: boolean,
      rotationThreshold: number,
      date?: string
    ) => {
      if (isAutoTagRunning) {
        throw new Error('Auto-tagging is already running')
      }
      isAutoTagRunning = true
      autoTagAbort = new AbortController()
      const signal = autoTagAbort.signal
      await db.ensureDb()
      const folderIds = db.resolveTimelineFolderIds(timelineId)

      // Run in background, don't await — progress is sent via events
      ;(async () => {
        let totalTagged = 0

        // Phase 0: Rotation correction (EXIF-missing photos only)
        if (rotationEnabled) {
          await startRotationCheck(folderIds, rotationThreshold, mainWindow, date, signal)
          if (signal.aborted) {
            mainWindow.webContents.send(IPC_CHANNELS.AUTO_TAG_COMPLETE, {
              timelineId,
              tagged: totalTagged,
              cancelled: true
            })
            return
          }
        }

        // Phase 1: Object detection (YOLO)
        if (detectEnabled) {
          const r = await startDetection(folderIds, detectThreshold, mainWindow, date, signal)
          totalTagged += r.tagged
          if (signal.aborted) {
            mainWindow.webContents.send(IPC_CHANNELS.AUTO_TAG_COMPLETE, {
              timelineId,
              tagged: totalTagged,
              cancelled: true
            })
            return
          }
        }

        // Phase 2: Scene classification (CLIP)
        if (labels.length > 0) {
          const r = await startAutoTag(folderIds, labels, threshold, mainWindow, date, signal)
          totalTagged += r.tagged
          if (signal.aborted) {
            mainWindow.webContents.send(IPC_CHANNELS.AUTO_TAG_COMPLETE, {
              timelineId,
              tagged: totalTagged,
              cancelled: true
            })
            return
          }
        }

        mainWindow.webContents.send(IPC_CHANNELS.AUTO_TAG_COMPLETE, {
          timelineId,
          tagged: totalTagged
        })
      })()
        .catch((err) => {
          console.error('Auto-tag error:', err)
          mainWindow.webContents.send(IPC_CHANNELS.AUTO_TAG_COMPLETE, {
            timelineId,
            tagged: 0,
            error: err instanceof Error ? err.message : String(err)
          })
        })
        .finally(() => {
          isAutoTagRunning = false
          autoTagAbort = null
        })
    }
  )

  ipcMain.handle(IPC_CHANNELS.CANCEL_AUTO_TAG, async () => {
    autoTagAbort?.abort()
  })

  ipcMain.handle(IPC_CHANNELS.GET_TAGS_FOR_PHOTO, async (_event, photoId: number) => {
    await db.ensureDb()
    return db.getTagsForPhoto(photoId)
  })

  ipcMain.handle(IPC_CHANNELS.GET_TAG_STATS, async (_event, timelineId: number) => {
    await db.ensureDb()
    const folderIds = db.resolveTimelineFolderIds(timelineId)
    return db.getTagStats(folderIds)
  })

  ipcMain.handle(
    IPC_CHANNELS.GET_PHOTO_IDS_BY_TAG,
    async (_event, timelineId: number, tagName: string) => {
      await db.ensureDb()
      const folderIds = db.resolveTimelineFolderIds(timelineId)
      return db.getPhotoIdsByTag(folderIds, tagName)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.GET_PHOTOS_BY_TAG,
    async (_event, timelineId: number, tagName: string) => {
      await db.ensureDb()
      const folderIds = db.resolveTimelineFolderIds(timelineId)
      return db.getPhotosByTag(folderIds, tagName)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.ADD_TAG_TO_PHOTO,
    async (_event, photoId: number, tagName: string) => {
      await db.ensureDb()
      const tagId = db.upsertTag(tagName)
      db.insertPhotoTag(photoId, tagId, 1)
      db.saveDatabase()
      return db.getTagsForPhoto(photoId)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.REMOVE_TAG_FROM_PHOTO,
    async (_event, photoId: number, tagName: string) => {
      await db.ensureDb()
      db.deletePhotoTagByName(photoId, tagName)
      db.saveDatabase()
      return db.getTagsForPhoto(photoId)
    }
  )

  // --- Duplicate detection ---

  ipcMain.handle(
    IPC_CHANNELS.FIND_DUPLICATES,
    async (_event, timelineId: number, date: string, threshold?: number) => {
      await db.ensureDb()
      const folderIds = db.resolveTimelineFolderIds(timelineId)
      return findDuplicateGroups(folderIds, date, threshold)
    }
  )

  ipcMain.handle(IPC_CHANNELS.DELETE_PHOTO, async (_event, photoId: number) => {
    await db.ensureDb()
    const result = db.deletePhoto(photoId)
    if (!result) return

    // Move original file to trash
    try {
      await shell.trashItem(result.filePath)
    } catch (err) {
      console.error('Failed to trash file:', err)
    }

    // Remove thumbnail
    const thumbPath = getThumbnailPath(result.filePath)
    try {
      if (fs.existsSync(thumbPath)) {
        fs.unlinkSync(thumbPath)
      }
    } catch (err) {
      console.error('Failed to remove thumbnail:', err)
    }
  })

  // --- Timeline handlers ---

  ipcMain.handle(IPC_CHANNELS.GET_DEFAULT_TIMELINE, async () => {
    await db.ensureDb()
    return db.getOrCreateDefaultTimeline()
  })

  ipcMain.handle(IPC_CHANNELS.GET_TIMELINE_FOLDERS, async (_event, timelineId: number) => {
    await db.ensureDb()
    return db.getTimelineFolders(timelineId)
  })

  ipcMain.handle(
    IPC_CHANNELS.ADD_FOLDER_TO_TIMELINE,
    async (_event, timelineId: number, folderPath: string) => {
      await db.ensureDb()
      const folderId = db.upsertFolder(folderPath)
      db.addFolderToTimeline(timelineId, folderId)
      return { folderId }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.REMOVE_FOLDER_FROM_TIMELINE,
    async (_event, timelineId: number, folderId: number) => {
      await db.ensureDb()
      db.removeFolderFromTimeline(timelineId, folderId)
    }
  )

  // --- Event handlers ---

  ipcMain.handle(IPC_CHANNELS.GET_EVENTS, async (_event, timelineId: number) => {
    await db.ensureDb()
    return db.getEventsByTimeline(timelineId)
  })

  ipcMain.handle(
    IPC_CHANNELS.CREATE_EVENT,
    async (
      _event,
      timelineId: number,
      title: string,
      startDate: string,
      endDate: string,
      type?: 'range' | 'dates',
      dates?: string[]
    ) => {
      await db.ensureDb()
      return db.createEvent(timelineId, title, startDate, endDate, type, dates)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.UPDATE_EVENT,
    async (_event, eventId: number, title?: string, startDate?: string, endDate?: string) => {
      await db.ensureDb()
      db.updateEvent(eventId, { title, startDate, endDate })
    }
  )

  ipcMain.handle(IPC_CHANNELS.DELETE_EVENT, async (_event, eventId: number) => {
    await db.ensureDb()
    db.deleteEvent(eventId)
  })

  ipcMain.handle(IPC_CHANNELS.GET_EVENT_SUGGESTIONS, async (_event, timelineId: number) => {
    await db.ensureDb()
    const folderIds = db.resolveTimelineFolderIds(timelineId)
    return db.computeEventSuggestions(timelineId, folderIds)
  })

  ipcMain.handle(
    IPC_CHANNELS.GENERATE_EVENT_TITLE,
    async (_event, timelineId: number, startDate: string, endDate: string) => {
      await db.ensureDb()
      const folderIds = db.resolveTimelineFolderIds(timelineId)
      return db.generateEventTitle(folderIds, startDate, endDate)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.ADD_DATE_TO_EVENT,
    async (_event, eventId: number, date: string) => {
      await db.ensureDb()
      db.addDateToEvent(eventId, date)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.REMOVE_DATE_FROM_EVENT,
    async (_event, eventId: number, date: string) => {
      await db.ensureDb()
      db.removeDateFromEvent(eventId, date)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.GENERATE_EVENT_TITLE_FOR_DATES,
    async (_event, timelineId: number, dates: string[]) => {
      await db.ensureDb()
      const folderIds = db.resolveTimelineFolderIds(timelineId)
      return db.generateEventTitleForDates(folderIds, dates)
    }
  )
}
