import type { Folder, Photo, DateCardSummary, ScanProgress, PhotoTag, AutoTagProgress, TagLabelDef, DuplicateGroup, Timeline, EventConfirmed, EventSuggestion } from './models'

export interface ElectronAPI {
  selectFolder(): Promise<string | null>
  getFolders(): Promise<Folder[]>
  startScan(folderPath: string): Promise<void>
  onScanProgress(callback: (progress: ScanProgress) => void): () => void
  onScanComplete(callback: () => void): () => void
  getDateSummary(timelineId: number): Promise<DateCardSummary[]>
  getPhotosByDate(timelineId: number, date: string): Promise<Photo[]>
  toggleBest(photoId: number): Promise<boolean>
  getBestPhotos(timelineId: number): Promise<Photo[]>
  getBestPhotosForDate(timelineId: number, date: string): Promise<Photo[]>
  getThumbnailPath(photoId: number): Promise<string>
  getPhotoFileUrl(filePath: string): Promise<string>

  startAutoTag(timelineId: number, labels: TagLabelDef[], threshold: number, detectEnabled: boolean, detectThreshold: number, rotationEnabled: boolean, rotationThreshold: number, date?: string): Promise<void>
  cancelAutoTag(): Promise<void>
  onAutoTagProgress(callback: (progress: AutoTagProgress) => void): () => void
  onAutoTagComplete(callback: (result: { timelineId: number; tagged: number; cancelled?: boolean }) => void): () => void
  getTagsForPhoto(photoId: number): Promise<PhotoTag[]>
  getTagStats(timelineId: number): Promise<{ name: string; count: number }[]>
  getPhotoIdsByTag(timelineId: number, tagName: string): Promise<number[]>
  getPhotosByTag(timelineId: number, tagName: string): Promise<Photo[]>
  addTagToPhoto(photoId: number, tagName: string): Promise<PhotoTag[]>
  removeTagFromPhoto(photoId: number, tagName: string): Promise<PhotoTag[]>

  findDuplicates(timelineId: number, date: string, threshold?: number): Promise<DuplicateGroup[]>
  deletePhoto(photoId: number): Promise<void>

  getDefaultTimeline(): Promise<Timeline>
  getTimelineFolders(timelineId: number): Promise<Folder[]>
  addFolderToTimeline(timelineId: number, folderPath: string): Promise<{ folderId: number }>
  removeFolderFromTimeline(timelineId: number, folderId: number): Promise<void>

  getEvents(timelineId: number): Promise<EventConfirmed[]>
  createEvent(timelineId: number, title: string, startDate: string, endDate: string, type?: 'range' | 'dates', dates?: string[]): Promise<EventConfirmed>
  updateEvent(eventId: number, title?: string, startDate?: string, endDate?: string): Promise<void>
  deleteEvent(eventId: number): Promise<void>
  getEventSuggestions(timelineId: number): Promise<EventSuggestion[]>
  generateEventTitle(timelineId: number, startDate: string, endDate: string): Promise<string>
  addDateToEvent(eventId: number, date: string): Promise<void>
  removeDateFromEvent(eventId: number, date: string): Promise<boolean>
  generateEventTitleForDates(timelineId: number, dates: string[]): Promise<string>
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}
