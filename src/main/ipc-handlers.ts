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

  ipcMain.handle(IPC_CHANNELS.GET_FOLDERS, () => {
    return db.getFolders()
  })

  ipcMain.handle(IPC_CHANNELS.START_SCAN, async (_event, folderPath: string) => {
    await scanFolder(folderPath, mainWindow)
  })

  ipcMain.handle(IPC_CHANNELS.GET_EVENT_SUMMARY, (_event, folderId: number) => {
    const summaries = db.getEventSummary(folderId)
    return summaries.map((s) => ({
      ...s,
      thumbnailPath: pathToFileURL(getThumbnailPath(s.representativeFilePath)).toString()
    }))
  })

  ipcMain.handle(
    IPC_CHANNELS.GET_PHOTOS_BY_DATE,
    (_event, folderId: number, date: string) => {
      return db.getPhotosByDate(folderId, date)
    }
  )

  ipcMain.handle(IPC_CHANNELS.TOGGLE_BEST, (_event, photoId: number) => {
    return db.toggleBest(photoId)
  })

  ipcMain.handle(IPC_CHANNELS.GET_BEST_PHOTOS, (_event, folderId: number) => {
    return db.getBestPhotos(folderId)
  })

  ipcMain.handle(
    IPC_CHANNELS.GET_BEST_PHOTOS_FOR_DATE,
    (_event, folderId: number, date: string) => {
      return db.getBestPhotosForDate(folderId, date)
    }
  )

  ipcMain.handle(IPC_CHANNELS.GET_THUMBNAIL_PATH, (_event, photoId: number) => {
    const photo = db.getPhotoById(photoId)
    if (!photo) return null
    return pathToFileURL(getThumbnailPath(photo.filePath)).toString()
  })

  ipcMain.handle(IPC_CHANNELS.GET_PHOTO_FILE_URL, (_event, filePath: string) => {
    // For HEIC files, return the cached JPEG conversion if available
    return pathToFileURL(getDisplayPath(filePath)).toString()
  })
}
