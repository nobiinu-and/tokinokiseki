import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '../renderer/src/types/ipc'

contextBridge.exposeInMainWorld('api', {
  selectFolder: () => ipcRenderer.invoke(IPC_CHANNELS.SELECT_FOLDER),

  getFolders: () => ipcRenderer.invoke(IPC_CHANNELS.GET_FOLDERS),

  startScan: (folderPath: string) => ipcRenderer.invoke(IPC_CHANNELS.START_SCAN, folderPath),

  onScanProgress: (callback: (progress: unknown) => void) => {
    const handler = (_event: unknown, progress: unknown): void => callback(progress)
    ipcRenderer.on(IPC_CHANNELS.SCAN_PROGRESS, handler as never)
    return (): void => {
      ipcRenderer.removeListener(IPC_CHANNELS.SCAN_PROGRESS, handler as never)
    }
  },

  onScanComplete: (callback: () => void) => {
    const handler = (): void => callback()
    ipcRenderer.on(IPC_CHANNELS.SCAN_COMPLETE, handler)
    return (): void => {
      ipcRenderer.removeListener(IPC_CHANNELS.SCAN_COMPLETE, handler)
    }
  },

  getEventSummary: (folderId: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_EVENT_SUMMARY, folderId),

  getPhotosByDate: (folderId: number, date: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_PHOTOS_BY_DATE, folderId, date),

  toggleBest: (photoId: number) => ipcRenderer.invoke(IPC_CHANNELS.TOGGLE_BEST, photoId),

  getBestPhotos: (folderId: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_BEST_PHOTOS, folderId),

  getBestPhotosForDate: (folderId: number, date: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_BEST_PHOTOS_FOR_DATE, folderId, date),

  getThumbnailPath: (photoId: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_THUMBNAIL_PATH, photoId),

  getPhotoFileUrl: (filePath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_PHOTO_FILE_URL, filePath)
})
