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
  orientationCorrection: number | null
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

export interface PhotoTag {
  name: string
  confidence: number
}

export interface AutoTagProgress {
  phase: 'filtering_exif' | 'checking_rotation' | 'loading_detect_model' | 'detecting' | 'loading_model' | 'classifying'
  current: number
  total: number
}

export interface TagLabelDef {
  label: string
  display: string
}

export interface DuplicatePhotoInfo {
  id: number
  filePath: string
  fileName: string
  hash: string
}

export interface DuplicateGroup {
  photos: DuplicatePhotoInfo[]
}
