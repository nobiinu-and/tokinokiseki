export interface Folder {
  id: number
  path: string
  lastScannedAt: string | null
}

export interface Photo {
  id: number
  folderId: number
  filePath: string
  fileName: string
  takenAt: string | null
  fileModifiedAt: string | null
  width: number | null
  height: number | null
  isBest: boolean
  createdAt: string
}

export interface EventGroup {
  date: string
  displayDate: string
  photoCount: number
  representativeThumbPath: string
  photos: Photo[]
  isEvent: boolean
  consecutiveGroupId: number | null
}

export interface EventSummary {
  date: string
  photoCount: number
  representativePhotoId: number
  representativeFilePath: string
  thumbnailPath: string
  hasBest: boolean
}

export interface ScanProgress {
  phase: 'discovering' | 'processing'
  current: number
  total: number
  currentFile: string
}
