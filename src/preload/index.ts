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

  getDateSummary: (timelineId: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_DATE_SUMMARY, timelineId),

  getPhotosByDate: (timelineId: number, date: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_PHOTOS_BY_DATE, timelineId, date),

  toggleBest: (photoId: number) => ipcRenderer.invoke(IPC_CHANNELS.TOGGLE_BEST, photoId),

  getBestPhotos: (timelineId: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_BEST_PHOTOS, timelineId),

  getBestPhotosForDate: (timelineId: number, date: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_BEST_PHOTOS_FOR_DATE, timelineId, date),

  getThumbnailPath: (photoId: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_THUMBNAIL_PATH, photoId),

  getPhotoFileUrl: (filePath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_PHOTO_FILE_URL, filePath),

  // --- Tags ---

  startAutoTag: (timelineId: number, labels: { label: string; display: string }[], threshold: number, detectEnabled: boolean, detectThreshold: number, rotationEnabled: boolean, rotationThreshold: number, date?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.START_AUTO_TAG, timelineId, labels, threshold, detectEnabled, detectThreshold, rotationEnabled, rotationThreshold, date),

  cancelAutoTag: () => ipcRenderer.invoke(IPC_CHANNELS.CANCEL_AUTO_TAG),

  onAutoTagProgress: (callback: (progress: unknown) => void) => {
    const handler = (_event: unknown, progress: unknown): void => callback(progress)
    ipcRenderer.on(IPC_CHANNELS.AUTO_TAG_PROGRESS, handler as never)
    return (): void => {
      ipcRenderer.removeListener(IPC_CHANNELS.AUTO_TAG_PROGRESS, handler as never)
    }
  },

  onAutoTagComplete: (callback: (result: unknown) => void) => {
    const handler = (_event: unknown, result: unknown): void => callback(result)
    ipcRenderer.on(IPC_CHANNELS.AUTO_TAG_COMPLETE, handler as never)
    return (): void => {
      ipcRenderer.removeListener(IPC_CHANNELS.AUTO_TAG_COMPLETE, handler as never)
    }
  },

  getTagsForPhoto: (photoId: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_TAGS_FOR_PHOTO, photoId),

  getTagStats: (timelineId: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_TAG_STATS, timelineId),

  getPhotoIdsByTag: (timelineId: number, tagName: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_PHOTO_IDS_BY_TAG, timelineId, tagName),

  getPhotosByTag: (timelineId: number, tagName: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_PHOTOS_BY_TAG, timelineId, tagName),

  addTagToPhoto: (photoId: number, tagName: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.ADD_TAG_TO_PHOTO, photoId, tagName),

  removeTagFromPhoto: (photoId: number, tagName: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.REMOVE_TAG_FROM_PHOTO, photoId, tagName),

  // --- Duplicates ---

  findDuplicates: (timelineId: number, date: string, threshold?: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.FIND_DUPLICATES, timelineId, date, threshold),

  deletePhoto: (photoId: number) => ipcRenderer.invoke(IPC_CHANNELS.DELETE_PHOTO, photoId),

  // --- Timeline ---

  getDefaultTimeline: () => ipcRenderer.invoke(IPC_CHANNELS.GET_DEFAULT_TIMELINE),

  getTimelineFolders: (timelineId: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_TIMELINE_FOLDERS, timelineId),

  addFolderToTimeline: (timelineId: number, folderPath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.ADD_FOLDER_TO_TIMELINE, timelineId, folderPath),

  removeFolderFromTimeline: (timelineId: number, folderId: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.REMOVE_FOLDER_FROM_TIMELINE, timelineId, folderId),

  // --- Events ---

  getEvents: (timelineId: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_EVENTS, timelineId),

  createEvent: (timelineId: number, title: string, startDate: string, endDate: string, type?: 'range' | 'dates', dates?: string[]) =>
    ipcRenderer.invoke(IPC_CHANNELS.CREATE_EVENT, timelineId, title, startDate, endDate, type, dates),

  updateEvent: (eventId: number, title?: string, startDate?: string, endDate?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.UPDATE_EVENT, eventId, title, startDate, endDate),

  deleteEvent: (eventId: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.DELETE_EVENT, eventId),

  getEventSuggestions: (timelineId: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_EVENT_SUGGESTIONS, timelineId),

  generateEventTitle: (timelineId: number, startDate: string, endDate: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.GENERATE_EVENT_TITLE, timelineId, startDate, endDate),

  addDateToEvent: (eventId: number, date: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.ADD_DATE_TO_EVENT, eventId, date),

  removeDateFromEvent: (eventId: number, date: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.REMOVE_DATE_FROM_EVENT, eventId, date),

  generateEventTitleForDates: (timelineId: number, dates: string[]) =>
    ipcRenderer.invoke(IPC_CHANNELS.GENERATE_EVENT_TITLE_FOR_DATES, timelineId, dates)
})
