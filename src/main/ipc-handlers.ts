import { ipcMain, dialog, BrowserWindow } from 'electron'
import { pathToFileURL } from 'url'
import { IPC_CHANNELS } from '../renderer/src/types/ipc'
import * as db from './database'
import { scanFolder } from './scanner'
import { getThumbnailPath, getDisplayPath } from './thumbnail'

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

  ipcMain.handle(IPC_CHANNELS.GET_EVENT_SUMMARY, async (_event, folderId: number) => {
    await db.ensureDb()
    const summaries = db.getEventSummary(folderId)
    return summaries.map((s) => ({
      ...s,
      thumbnailPath: pathToFileURL(getThumbnailPath(s.representativeFilePath)).toString()
    }))
  })

  ipcMain.handle(
    IPC_CHANNELS.GET_PHOTOS_BY_DATE,
    async (_event, folderId: number, date: string) => {
      await db.ensureDb()
      return db.getPhotosByDate(folderId, date)
    }
  )

  ipcMain.handle(IPC_CHANNELS.TOGGLE_BEST, async (_event, photoId: number) => {
    await db.ensureDb()
    return db.toggleBest(photoId)
  })

  ipcMain.handle(IPC_CHANNELS.GET_BEST_PHOTOS, async (_event, folderId: number) => {
    await db.ensureDb()
    return db.getBestPhotos(folderId)
  })

  ipcMain.handle(
    IPC_CHANNELS.GET_BEST_PHOTOS_FOR_DATE,
    async (_event, folderId: number, date: string) => {
      await db.ensureDb()
      return db.getBestPhotosForDate(folderId, date)
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
}
