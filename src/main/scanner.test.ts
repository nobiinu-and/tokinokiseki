import { describe, it, expect, vi, beforeEach } from 'vitest'
import path from 'path'

// --- Mocks ---

// fs
vi.mock('fs', () => {
  const existsSync = vi.fn().mockReturnValue(false)
  const readdir = vi.fn().mockResolvedValue([])
  const stat = vi.fn().mockResolvedValue({ mtime: new Date('2024-08-10T12:00:00Z') })
  return {
    default: {
      existsSync,
      promises: { readdir, stat }
    },
    existsSync,
    promises: { readdir, stat }
  }
})

// exifr
vi.mock('exifr', () => ({
  default: {
    parse: vi.fn().mockResolvedValue(null),
    orientation: vi.fn().mockResolvedValue(null)
  }
}))

// database
vi.mock('./database', () => ({
  insertPhoto: vi.fn(),
  photoExists: vi.fn().mockReturnValue(false),
  upsertFolder: vi.fn().mockReturnValue(1),
  saveDatabase: vi.fn(),
  updateFolderScanTime: vi.fn()
}))

// thumbnail
vi.mock('./thumbnail', () => ({
  generateThumbnail: vi.fn().mockResolvedValue(undefined),
  getThumbnailPath: vi.fn().mockReturnValue('/thumb/path.jpg'),
  ensureHeicCache: vi.fn().mockResolvedValue(undefined)
}))

// electron
vi.mock('electron', () => ({
  BrowserWindow: vi.fn()
}))

// IPC channels — provide the constants the scanner imports
vi.mock('../renderer/src/types/ipc', () => ({
  IPC_CHANNELS: {
    SCAN_PROGRESS: 'scan:progress',
    SCAN_COMPLETE: 'scan:complete'
  }
}))

// --- Imports (after vi.mock) ---

import fs from 'fs'
import exifr from 'exifr'
import { insertPhoto, photoExists } from './database'
import { generateThumbnail, ensureHeicCache } from './thumbnail'
import { scanFolder } from './scanner'

// --- Helpers ---

function makeDirent(name: string, isDir: boolean): object {
  return {
    name,
    isDirectory: () => isDir,
    isFile: () => !isDir
  }
}

function mockWindow(): object {
  return {
    isDestroyed: vi.fn().mockReturnValue(false),
    webContents: { send: vi.fn() }
  }
}

// --- Tests ---

describe('scanFolder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: readdir returns empty, photoExists returns false
    vi.mocked(fs.promises.readdir).mockResolvedValue([])
    vi.mocked(photoExists).mockReturnValue(false)
    vi.mocked(exifr.parse).mockResolvedValue(null)
    vi.mocked(exifr.orientation).mockResolvedValue(null)
  })

  // Helper to set up discoverFiles to return specific files
  function setupFiles(fileNames: string[]): void {
    const dirents = fileNames.map((name) => makeDirent(name, false))
    vi.mocked(fs.promises.readdir).mockResolvedValue(dirents as never)
  }

  it('EXIF orientation が generateThumbnail に正しく渡される', async () => {
    setupFiles(['photo.jpg'])
    vi.mocked(exifr.parse).mockResolvedValue({ DateTimeOriginal: new Date('2024-08-10T12:00:00Z') })
    vi.mocked(exifr.orientation).mockResolvedValue(6)

    const win = mockWindow()
    await scanFolder('/photos', win as never)

    expect(generateThumbnail).toHaveBeenCalledWith(
      path.join('/photos', 'photo.jpg'),
      6
    )
  })

  it('EXIF orientation がない場合はデフォルト 1 で渡される', async () => {
    setupFiles(['photo.jpg'])
    vi.mocked(exifr.orientation).mockResolvedValue(null)

    const win = mockWindow()
    await scanFolder('/photos', win as never)

    expect(generateThumbnail).toHaveBeenCalledWith(
      path.join('/photos', 'photo.jpg'),
      1
    )
  })

  it('exifr.orientation() がエラーの場合もデフォルト 1 で渡される', async () => {
    setupFiles(['photo.jpg'])
    vi.mocked(exifr.orientation).mockRejectedValue(new Error('EXIF read error'))

    const win = mockWindow()
    await scanFolder('/photos', win as never)

    expect(generateThumbnail).toHaveBeenCalledWith(
      path.join('/photos', 'photo.jpg'),
      1
    )
  })

  it('HEIC ファイルは ensureHeicCache が呼ばれる', async () => {
    setupFiles(['photo.heic'])

    const win = mockWindow()
    await scanFolder('/photos', win as never)

    expect(ensureHeicCache).toHaveBeenCalledWith(path.join('/photos', 'photo.heic'))
  })

  it('既存写真はスキップされ insertPhoto が呼ばれない', async () => {
    setupFiles(['existing.jpg'])
    vi.mocked(photoExists).mockReturnValue(true)

    const win = mockWindow()
    await scanFolder('/photos', win as never)

    expect(insertPhoto).not.toHaveBeenCalled()
  })

  it('insertPhoto に正しい引数が渡される', async () => {
    setupFiles(['photo.jpg'])
    const takenDate = new Date('2024-08-10T12:00:00Z')
    vi.mocked(exifr.parse).mockResolvedValue({ DateTimeOriginal: takenDate })

    const win = mockWindow()
    await scanFolder('/photos', win as never)

    expect(insertPhoto).toHaveBeenCalledWith({
      folderId: 1,
      filePath: path.join('/photos', 'photo.jpg'),
      fileName: 'photo.jpg',
      takenAt: takenDate.toISOString(),
      fileModifiedAt: expect.any(String),
      width: null,
      height: null
    })
  })

  it('サポート外の拡張子は insertPhoto が呼ばれない', async () => {
    // readdir returns a mix of supported and unsupported files
    const dirents = [
      makeDirent('photo.jpg', false),
      makeDirent('readme.txt', false),
      makeDirent('data.csv', false)
    ]
    vi.mocked(fs.promises.readdir).mockResolvedValue(dirents as never)

    const win = mockWindow()
    await scanFolder('/photos', win as never)

    // Only photo.jpg should be processed
    expect(insertPhoto).toHaveBeenCalledTimes(1)
    expect(insertPhoto).toHaveBeenCalledWith(
      expect.objectContaining({ fileName: 'photo.jpg' })
    )
  })
})
