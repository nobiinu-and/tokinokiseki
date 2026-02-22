import type { Folder, Photo, EventSummary, ScanProgress, PhotoTag, AutoTagProgress, TagLabelDef, DuplicateGroup, TravelGroup } from './models'

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

  startAutoTag(folderId: number, labels: TagLabelDef[], threshold: number, detectEnabled: boolean, detectThreshold: number, rotationEnabled: boolean, rotationThreshold: number, date?: string): Promise<void>
  cancelAutoTag(): Promise<void>
  onAutoTagProgress(callback: (progress: AutoTagProgress) => void): () => void
  onAutoTagComplete(callback: (result: { folderId: number; tagged: number; cancelled?: boolean }) => void): () => void
  getTagsForPhoto(photoId: number): Promise<PhotoTag[]>
  getTagStats(folderId: number): Promise<{ name: string; count: number }[]>
  getPhotoIdsByTag(folderId: number, tagName: string): Promise<number[]>
  getPhotosByTag(folderId: number, tagName: string): Promise<Photo[]>
  addTagToPhoto(photoId: number, tagName: string): Promise<PhotoTag[]>
  removeTagFromPhoto(photoId: number, tagName: string): Promise<PhotoTag[]>

  findDuplicates(folderId: number, date: string, threshold?: number): Promise<DuplicateGroup[]>
  deletePhoto(photoId: number): Promise<void>

  getTravelGroups(folderId: number): Promise<TravelGroup[]>
  createTravelGroup(folderId: number, title: string, startDate: string, endDate: string): Promise<number>
  updateTravelGroup(id: number, title: string, startDate: string, endDate: string): Promise<void>
  deleteTravelGroup(id: number): Promise<void>
  getTravelTitleSuggestion(folderId: number, startDate: string, endDate: string): Promise<string>
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}
