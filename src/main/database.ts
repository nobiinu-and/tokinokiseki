import initSqlJs, { Database as SqlJsDatabase } from 'sql.js'
import path from 'path'
import fs from 'fs'
import { app } from 'electron'

let db: SqlJsDatabase
let dbPath: string

function getWasmPath(): string {
  // In production, node_modules is inside the asar or unpacked
  const wasmFile = 'sql-wasm.wasm'
  const devPath = path.join(__dirname, '../../node_modules/sql.js/dist', wasmFile)
  if (fs.existsSync(devPath)) return devPath

  // Fallback for packaged app
  const prodPath = path.join(process.resourcesPath, 'app.asar.unpacked/node_modules/sql.js/dist', wasmFile)
  if (fs.existsSync(prodPath)) return prodPath

  // Let sql.js find it automatically
  return ''
}

export async function initDatabase(): Promise<void> {
  dbPath = path.join(app.getPath('userData'), 'easyalbum.db')

  const wasmPath = getWasmPath()
  const config = wasmPath ? { locateFile: (): string => wasmPath } : undefined
  const SQL = await initSqlJs(config)

  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath)
    db = new SQL.Database(buffer)
  } else {
    db = new SQL.Database()
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL UNIQUE,
      last_scanned_at TEXT
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      folder_id INTEGER NOT NULL,
      file_path TEXT NOT NULL UNIQUE,
      file_name TEXT NOT NULL,
      taken_at TEXT,
      file_modified_at TEXT,
      width INTEGER,
      height INTEGER,
      is_best INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (folder_id) REFERENCES folders(id)
    )
  `)

  db.run('CREATE INDEX IF NOT EXISTS idx_photos_taken_at ON photos(taken_at)')
  db.run('CREATE INDEX IF NOT EXISTS idx_photos_is_best ON photos(is_best)')
  db.run('CREATE INDEX IF NOT EXISTS idx_photos_folder_id ON photos(folder_id)')

  saveDatabase()
}

export function saveDatabase(): void {
  const data = db.export()
  const buffer = Buffer.from(data)
  fs.writeFileSync(dbPath, buffer)
}

export function getDb(): SqlJsDatabase {
  return db
}

// --- Folder queries ---

export function upsertFolder(folderPath: string): number {
  const existing = db.exec('SELECT id FROM folders WHERE path = ?', [folderPath])
  if (existing.length > 0 && existing[0].values.length > 0) {
    return existing[0].values[0][0] as number
  }
  db.run('INSERT INTO folders (path, last_scanned_at) VALUES (?, datetime("now"))', [folderPath])
  const result = db.exec('SELECT last_insert_rowid()')
  const id = result[0].values[0][0] as number
  saveDatabase()
  return id
}

export function getFolders(): { id: number; path: string; lastScannedAt: string | null }[] {
  const result = db.exec('SELECT id, path, last_scanned_at FROM folders ORDER BY id DESC')
  if (result.length === 0) return []
  return result[0].values.map((row) => ({
    id: row[0] as number,
    path: row[1] as string,
    lastScannedAt: row[2] as string | null
  }))
}

// --- Photo queries ---

export function photoExists(filePath: string): boolean {
  const result = db.exec('SELECT 1 FROM photos WHERE file_path = ?', [filePath])
  return result.length > 0 && result[0].values.length > 0
}

export function insertPhoto(photo: {
  folderId: number
  filePath: string
  fileName: string
  takenAt: string | null
  fileModifiedAt: string | null
  width: number | null
  height: number | null
}): number {
  db.run(
    `INSERT INTO photos (folder_id, file_path, file_name, taken_at, file_modified_at, width, height)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      photo.folderId,
      photo.filePath,
      photo.fileName,
      photo.takenAt,
      photo.fileModifiedAt,
      photo.width,
      photo.height
    ]
  )
  const result = db.exec('SELECT last_insert_rowid()')
  return result[0].values[0][0] as number
}

export function getEventSummary(
  folderId: number
): {
  date: string
  photoCount: number
  representativePhotoId: number
  representativeFilePath: string
  hasBest: boolean
}[] {
  const result = db.exec(
    `SELECT
       date(COALESCE(taken_at, file_modified_at)) as event_date,
       COUNT(*) as photo_count,
       MIN(id) as representative_id,
       (SELECT file_path FROM photos p2
        WHERE p2.folder_id = photos.folder_id
        AND date(COALESCE(p2.taken_at, p2.file_modified_at)) = date(COALESCE(photos.taken_at, photos.file_modified_at))
        ORDER BY p2.id LIMIT 1) as representative_path,
       MAX(is_best) as has_best
     FROM photos
     WHERE folder_id = ?
     GROUP BY event_date
     ORDER BY event_date DESC`,
    [folderId]
  )
  if (result.length === 0) return []
  return result[0].values.map((row) => ({
    date: row[0] as string,
    photoCount: row[1] as number,
    representativePhotoId: row[2] as number,
    representativeFilePath: row[3] as string,
    hasBest: (row[4] as number) === 1
  }))
}

export function getPhotosByDate(
  folderId: number,
  date: string
): {
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
}[] {
  const result = db.exec(
    `SELECT id, folder_id, file_path, file_name, taken_at, file_modified_at,
            width, height, is_best, created_at
     FROM photos
     WHERE folder_id = ? AND date(COALESCE(taken_at, file_modified_at)) = ?
     ORDER BY COALESCE(taken_at, file_modified_at) ASC`,
    [folderId, date]
  )
  if (result.length === 0) return []
  return result[0].values.map((row) => ({
    id: row[0] as number,
    folderId: row[1] as number,
    filePath: row[2] as string,
    fileName: row[3] as string,
    takenAt: row[4] as string | null,
    fileModifiedAt: row[5] as string | null,
    width: row[6] as number | null,
    height: row[7] as number | null,
    isBest: (row[8] as number) === 1,
    createdAt: row[9] as string
  }))
}

export function toggleBest(photoId: number): boolean {
  db.run('UPDATE photos SET is_best = CASE WHEN is_best = 1 THEN 0 ELSE 1 END WHERE id = ?', [
    photoId
  ])
  const result = db.exec('SELECT is_best FROM photos WHERE id = ?', [photoId])
  const newValue = result.length > 0 ? (result[0].values[0][0] as number) === 1 : false
  saveDatabase()
  return newValue
}

export function getBestPhotos(
  folderId: number
): { id: number; filePath: string; fileName: string; takenAt: string | null }[] {
  const result = db.exec(
    `SELECT id, file_path, file_name, taken_at
     FROM photos
     WHERE folder_id = ? AND is_best = 1
     ORDER BY COALESCE(taken_at, file_modified_at) DESC`,
    [folderId]
  )
  if (result.length === 0) return []
  return result[0].values.map((row) => ({
    id: row[0] as number,
    filePath: row[1] as string,
    fileName: row[2] as string,
    takenAt: row[3] as string | null
  }))
}

export function getBestPhotosForDate(
  folderId: number,
  date: string
): { id: number; filePath: string; fileName: string; takenAt: string | null }[] {
  const result = db.exec(
    `SELECT id, file_path, file_name, taken_at
     FROM photos
     WHERE folder_id = ? AND is_best = 1 AND date(COALESCE(taken_at, file_modified_at)) = ?
     ORDER BY COALESCE(taken_at, file_modified_at) ASC`,
    [folderId, date]
  )
  if (result.length === 0) return []
  return result[0].values.map((row) => ({
    id: row[0] as number,
    filePath: row[1] as string,
    fileName: row[2] as string,
    takenAt: row[3] as string | null
  }))
}

export function getPhotoById(
  photoId: number
): { filePath: string; fileName: string } | null {
  const result = db.exec('SELECT file_path, file_name FROM photos WHERE id = ?', [photoId])
  if (result.length === 0 || result[0].values.length === 0) return null
  return {
    filePath: result[0].values[0][0] as string,
    fileName: result[0].values[0][1] as string
  }
}

export function updateFolderScanTime(folderId: number): void {
  db.run('UPDATE folders SET last_scanned_at = datetime("now") WHERE id = ?', [folderId])
  saveDatabase()
}
