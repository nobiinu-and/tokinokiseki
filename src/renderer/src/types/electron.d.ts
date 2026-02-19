import type { Folder, Photo, EventSummary, ScanProgress } from './models'

export interface ElectronAPI {
  selectFolder(): Promise<string | null>
  getFolders(): Promise<Folder[]>
  startScan(folderPath: string): Promise<void>
  onScanProgress(callback: (progress: ScanProgress) => void): () => void
  onScanComplete(callback: () => void): () => void
  getEventSummary(folderId: number): Promise<EventSummary[]>
  getPhotosByDate(folderId: number, date: string): Promise<Photo[]>
  toggleBest(photoId: number): Promise<boolean>
  getBestPhotos(folderId: number): Promise<Photo[]>
  getBestPhotosForDate(folderId: number, date: string): Promise<Photo[]>
  getThumbnailPath(photoId: number): Promise<string>
  getPhotoFileUrl(filePath: string): Promise<string>
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}
