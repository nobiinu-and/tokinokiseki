import initSqlJs, { Database as SqlJsDatabase } from 'sql.js'
import path from 'path'
import fs from 'fs'
import { app } from 'electron'

let db: SqlJsDatabase | null = null
let dbPath: string
let initPromise: Promise<void> | null = null

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
  if (db) return
  if (initPromise) return initPromise

  initPromise = (async () => {
    dbPath = path.join(app.getPath('userData'), 'tokinokiseki.db')

    const wasmPath = getWasmPath()
    const config = wasmPath ? { locateFile: (): string => wasmPath } : undefined
    const SQL = await initSqlJs(config)

    const isNewDb = !fs.existsSync(dbPath)
    if (!isNewDb) {
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

    // Add orientation_correction column if not exists
    const colInfo = db.exec("PRAGMA table_info('photos')")
    const hasOrientationCol =
      colInfo.length > 0 &&
      colInfo[0].values.some((row) => row[1] === 'orientation_correction')
    if (!hasOrientationCol) {
      db.run('ALTER TABLE photos ADD COLUMN orientation_correction INTEGER DEFAULT NULL')
    }

    db.run(`
      CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE
      )
    `)

    db.run(`
      CREATE TABLE IF NOT EXISTS photo_tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        photo_id INTEGER NOT NULL,
        tag_id INTEGER NOT NULL,
        confidence REAL NOT NULL DEFAULT 0,
        FOREIGN KEY (photo_id) REFERENCES photos(id),
        FOREIGN KEY (tag_id) REFERENCES tags(id),
        UNIQUE(photo_id, tag_id)
      )
    `)
    db.run('CREATE INDEX IF NOT EXISTS idx_photo_tags_photo ON photo_tags(photo_id)')
    db.run('CREATE INDEX IF NOT EXISTS idx_photo_tags_tag ON photo_tags(tag_id)')

    // --- Timeline tables ---
    db.run(`
      CREATE TABLE IF NOT EXISTS timelines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL DEFAULT 'メイン',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)
    db.run(`
      CREATE TABLE IF NOT EXISTS timeline_folders (
        timeline_id INTEGER NOT NULL,
        folder_id INTEGER NOT NULL,
        PRIMARY KEY (timeline_id, folder_id),
        FOREIGN KEY (timeline_id) REFERENCES timelines(id),
        FOREIGN KEY (folder_id) REFERENCES folders(id)
      )
    `)

    // Migration: if timelines table is empty, create default and add all existing folders
    const tlCount = db.exec('SELECT COUNT(*) FROM timelines')
    const hasTimelines = tlCount.length > 0 && (tlCount[0].values[0][0] as number) > 0
    if (!hasTimelines) {
      db.run("INSERT INTO timelines (name) VALUES ('メイン')")
      const tlIdResult = db.exec('SELECT last_insert_rowid()')
      const tlId = tlIdResult[0].values[0][0] as number
      const existingFolders = db.exec('SELECT id FROM folders')
      if (existingFolders.length > 0) {
        for (const row of existingFolders[0].values) {
          db.run('INSERT OR IGNORE INTO timeline_folders (timeline_id, folder_id) VALUES (?, ?)', [
            tlId,
            row[0] as number
          ])
        }
      }
    }

    // Only save if schema was actually modified (first run or migration)
    if (isNewDb || !hasOrientationCol || !hasTimelines) {
      saveDatabase()
    }
  })()

  return initPromise
}

/** Ensure DB is ready before accessing. Call from async IPC handlers. */
export async function ensureDb(): Promise<SqlJsDatabase> {
  if (!db) {
    await initDatabase()
  }
  return db!
}

function getDb(): SqlJsDatabase {
  if (!db) throw new Error('Database not initialized. Call ensureDb() first.')
  return db
}

export function saveDatabase(): void {
  const data = getDb().export()
  const buffer = Buffer.from(data)
  const fd = fs.openSync(dbPath, 'w')
  fs.writeSync(fd, buffer)
  fs.fsyncSync(fd)
  fs.closeSync(fd)
}

// --- Timeline helpers ---

function inClause(ids: number[]): string {
  return ids.map((id) => Number(id)).join(',')
}

export function resolveTimelineFolderIds(timelineId: number): number[] {
  const d = getDb()
  const result = d.exec('SELECT folder_id FROM timeline_folders WHERE timeline_id = ?', [
    timelineId
  ])
  if (result.length === 0) return []
  return result[0].values.map((row) => row[0] as number)
}

export function getOrCreateDefaultTimeline(): { id: number; name: string } {
  const d = getDb()
  const result = d.exec('SELECT id, name FROM timelines ORDER BY id LIMIT 1')
  if (result.length > 0 && result[0].values.length > 0) {
    return { id: result[0].values[0][0] as number, name: result[0].values[0][1] as string }
  }
  d.run("INSERT INTO timelines (name) VALUES ('メイン')")
  const idResult = d.exec('SELECT last_insert_rowid()')
  const id = idResult[0].values[0][0] as number
  saveDatabase()
  return { id, name: 'メイン' }
}

export function getTimelineFolders(
  timelineId: number
): { id: number; path: string; lastScannedAt: string | null }[] {
  const d = getDb()
  const result = d.exec(
    `SELECT f.id, f.path, f.last_scanned_at
     FROM folders f
     JOIN timeline_folders tf ON tf.folder_id = f.id
     WHERE tf.timeline_id = ?
     ORDER BY f.id DESC`,
    [timelineId]
  )
  if (result.length === 0) return []
  return result[0].values.map((row) => ({
    id: row[0] as number,
    path: row[1] as string,
    lastScannedAt: row[2] as string | null
  }))
}

export function addFolderToTimeline(timelineId: number, folderId: number): void {
  const d = getDb()
  d.run('INSERT OR IGNORE INTO timeline_folders (timeline_id, folder_id) VALUES (?, ?)', [
    timelineId,
    folderId
  ])
  saveDatabase()
}

export function removeFolderFromTimeline(timelineId: number, folderId: number): void {
  const d = getDb()
  // Cascade delete: photo_tags → photos → timeline_folders, then folder
  d.run(
    'DELETE FROM photo_tags WHERE photo_id IN (SELECT id FROM photos WHERE folder_id = ?)',
    [folderId]
  )
  d.run('DELETE FROM photos WHERE folder_id = ?', [folderId])
  d.run('DELETE FROM timeline_folders WHERE timeline_id = ? AND folder_id = ?', [
    timelineId,
    folderId
  ])
  d.run('DELETE FROM folders WHERE id = ?', [folderId])
  saveDatabase()
}

// --- Folder queries ---

export function upsertFolder(folderPath: string): number {
  const d = getDb()
  const existing = d.exec('SELECT id FROM folders WHERE path = ?', [folderPath])
  if (existing.length > 0 && existing[0].values.length > 0) {
    return existing[0].values[0][0] as number
  }
  d.run('INSERT INTO folders (path, last_scanned_at) VALUES (?, datetime("now"))', [folderPath])
  const result = d.exec('SELECT last_insert_rowid()')
  const id = result[0].values[0][0] as number
  saveDatabase()
  return id
}

export function getFolders(): { id: number; path: string; lastScannedAt: string | null }[] {
  const d = getDb()
  const result = d.exec('SELECT id, path, last_scanned_at FROM folders ORDER BY id DESC')
  if (result.length === 0) return []
  return result[0].values.map((row) => ({
    id: row[0] as number,
    path: row[1] as string,
    lastScannedAt: row[2] as string | null
  }))
}

// --- Photo queries ---

export function photoExists(filePath: string): boolean {
  const d = getDb()
  const result = d.exec('SELECT 1 FROM photos WHERE file_path = ?', [filePath])
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
  const d = getDb()
  d.run(
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
  const result = d.exec('SELECT last_insert_rowid()')
  return result[0].values[0][0] as number
}

export function getDateSummary(
  folderIds: number[]
): {
  date: string
  photoCount: number
  representativePhotoId: number
  representativeFilePath: string
  hasBest: boolean
}[] {
  if (folderIds.length === 0) return []
  const d = getDb()
  const ids = inClause(folderIds)
  const result = d.exec(
    `SELECT
       date(COALESCE(taken_at, file_modified_at)) as event_date,
       COUNT(*) as photo_count,
       MIN(id) as representative_id,
       (SELECT file_path FROM photos p2
        WHERE p2.folder_id IN (${ids})
        AND date(COALESCE(p2.taken_at, p2.file_modified_at)) = date(COALESCE(photos.taken_at, photos.file_modified_at))
        ORDER BY p2.id LIMIT 1) as representative_path,
       MAX(is_best) as has_best
     FROM photos
     WHERE folder_id IN (${ids})
     GROUP BY event_date
     ORDER BY event_date DESC`
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
  folderIds: number[],
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
  orientationCorrection: number | null
}[] {
  if (folderIds.length === 0) return []
  const d = getDb()
  const ids = inClause(folderIds)
  const result = d.exec(
    `SELECT id, folder_id, file_path, file_name, taken_at, file_modified_at,
            width, height, is_best, created_at, orientation_correction
     FROM photos
     WHERE folder_id IN (${ids}) AND date(COALESCE(taken_at, file_modified_at)) = ?
     ORDER BY COALESCE(taken_at, file_modified_at) ASC`,
    [date]
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
    createdAt: row[9] as string,
    orientationCorrection: row[10] as number | null
  }))
}

export function toggleBest(photoId: number): boolean {
  const d = getDb()
  d.run('UPDATE photos SET is_best = CASE WHEN is_best = 1 THEN 0 ELSE 1 END WHERE id = ?', [
    photoId
  ])
  const result = d.exec('SELECT is_best FROM photos WHERE id = ?', [photoId])
  const newValue = result.length > 0 ? (result[0].values[0][0] as number) === 1 : false
  saveDatabase()
  return newValue
}

export function getBestPhotos(
  folderIds: number[]
): { id: number; filePath: string; fileName: string; takenAt: string | null }[] {
  if (folderIds.length === 0) return []
  const d = getDb()
  const ids = inClause(folderIds)
  const result = d.exec(
    `SELECT id, file_path, file_name, taken_at
     FROM photos
     WHERE folder_id IN (${ids}) AND is_best = 1
     ORDER BY COALESCE(taken_at, file_modified_at) DESC`
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
  folderIds: number[],
  date: string
): { id: number; filePath: string; fileName: string; takenAt: string | null }[] {
  if (folderIds.length === 0) return []
  const d = getDb()
  const ids = inClause(folderIds)
  const result = d.exec(
    `SELECT id, file_path, file_name, taken_at
     FROM photos
     WHERE folder_id IN (${ids}) AND is_best = 1 AND date(COALESCE(taken_at, file_modified_at)) = ?
     ORDER BY COALESCE(taken_at, file_modified_at) ASC`,
    [date]
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
  const d = getDb()
  const result = d.exec('SELECT file_path, file_name FROM photos WHERE id = ?', [photoId])
  if (result.length === 0 || result[0].values.length === 0) return null
  return {
    filePath: result[0].values[0][0] as string,
    fileName: result[0].values[0][1] as string
  }
}

export function deletePhoto(photoId: number): { filePath: string } | null {
  const d = getDb()
  const result = d.exec('SELECT file_path FROM photos WHERE id = ?', [photoId])
  if (result.length === 0 || result[0].values.length === 0) return null
  const filePath = result[0].values[0][0] as string

  d.run('DELETE FROM photo_tags WHERE photo_id = ?', [photoId])
  d.run('DELETE FROM photos WHERE id = ?', [photoId])
  saveDatabase()
  return { filePath }
}

export function updateFolderScanTime(folderId: number): void {
  const d = getDb()
  d.run('UPDATE folders SET last_scanned_at = datetime("now") WHERE id = ?', [folderId])
  saveDatabase()
}

// --- Tag queries ---

export function upsertTag(name: string): number {
  const d = getDb()
  const existing = d.exec('SELECT id FROM tags WHERE name = ?', [name])
  if (existing.length > 0 && existing[0].values.length > 0) {
    return existing[0].values[0][0] as number
  }
  d.run('INSERT INTO tags (name) VALUES (?)', [name])
  const result = d.exec('SELECT last_insert_rowid()')
  return result[0].values[0][0] as number
}

export function insertPhotoTag(photoId: number, tagId: number, confidence: number): void {
  const d = getDb()
  d.run(
    `INSERT INTO photo_tags (photo_id, tag_id, confidence) VALUES (?, ?, ?)
     ON CONFLICT(photo_id, tag_id) DO UPDATE SET confidence = excluded.confidence`,
    [photoId, tagId, confidence]
  )
}

export function getTagsForPhoto(photoId: number): { name: string; confidence: number }[] {
  const d = getDb()
  const result = d.exec(
    `SELECT t.name, pt.confidence
     FROM photo_tags pt
     JOIN tags t ON t.id = pt.tag_id
     WHERE pt.photo_id = ?
     ORDER BY pt.confidence DESC`,
    [photoId]
  )
  if (result.length === 0) return []
  return result[0].values.map((row) => ({
    name: row[0] as string,
    confidence: row[1] as number
  }))
}

export function getTagStats(folderIds: number[]): { name: string; count: number }[] {
  if (folderIds.length === 0) return []
  const d = getDb()
  const ids = inClause(folderIds)
  const result = d.exec(
    `SELECT t.name, COUNT(*) as cnt
     FROM photo_tags pt
     JOIN tags t ON t.id = pt.tag_id
     JOIN photos p ON p.id = pt.photo_id
     WHERE p.folder_id IN (${ids})
     GROUP BY t.name
     ORDER BY cnt DESC`
  )
  if (result.length === 0) return []
  return result[0].values.map((row) => ({
    name: row[0] as string,
    count: row[1] as number
  }))
}

export function getPhotosByTag(
  folderIds: number[],
  tagName: string
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
  orientationCorrection: number | null
}[] {
  if (folderIds.length === 0) return []
  const d = getDb()
  const ids = inClause(folderIds)
  const result = d.exec(
    `SELECT p.id, p.folder_id, p.file_path, p.file_name, p.taken_at,
            p.file_modified_at, p.width, p.height, p.is_best, p.created_at,
            p.orientation_correction
     FROM photos p
     JOIN photo_tags pt ON pt.photo_id = p.id
     JOIN tags t ON t.id = pt.tag_id
     WHERE p.folder_id IN (${ids}) AND t.name = ?
     ORDER BY COALESCE(p.taken_at, p.file_modified_at) DESC`,
    [tagName]
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
    createdAt: row[9] as string,
    orientationCorrection: row[10] as number | null
  }))
}

export function getPhotoIdsByTag(folderIds: number[], tagName: string): number[] {
  if (folderIds.length === 0) return []
  const d = getDb()
  const ids = inClause(folderIds)
  const result = d.exec(
    `SELECT pt.photo_id
     FROM photo_tags pt
     JOIN tags t ON t.id = pt.tag_id
     JOIN photos p ON p.id = pt.photo_id
     WHERE p.folder_id IN (${ids}) AND t.name = ?
     ORDER BY pt.confidence DESC`,
    [tagName]
  )
  if (result.length === 0) return []
  return result[0].values.map((row) => row[0] as number)
}

export function deletePhotoTagByName(photoId: number, tagName: string): void {
  const d = getDb()
  d.run(
    `DELETE FROM photo_tags WHERE photo_id = ? AND tag_id = (SELECT id FROM tags WHERE name = ?)`,
    [photoId, tagName]
  )
}

export function clearPhotoTags(folderIds: number[]): void {
  if (folderIds.length === 0) return
  const d = getDb()
  const ids = inClause(folderIds)
  d.run(
    `DELETE FROM photo_tags WHERE photo_id IN (
       SELECT id FROM photos WHERE folder_id IN (${ids})
     )`
  )
  saveDatabase()
}

export function getAllPhotosInFolders(
  folderIds: number[]
): { id: number; filePath: string }[] {
  if (folderIds.length === 0) return []
  const d = getDb()
  const ids = inClause(folderIds)
  const result = d.exec(
    `SELECT id, file_path FROM photos WHERE folder_id IN (${ids}) ORDER BY id`
  )
  if (result.length === 0) return []
  return result[0].values.map((row) => ({
    id: row[0] as number,
    filePath: row[1] as string
  }))
}

// --- Orientation correction ---

export function updateOrientationCorrection(photoId: number, correction: number): void {
  const d = getDb()
  d.run('UPDATE photos SET orientation_correction = ? WHERE id = ?', [correction, photoId])
}

export function getPhotosNeedingRotationCheck(
  folderIds: number[],
  date?: string
): { id: number; filePath: string }[] {
  if (folderIds.length === 0) return []
  const d = getDb()
  const ids = inClause(folderIds)
  const query = date
    ? `SELECT id, file_path FROM photos
       WHERE folder_id IN (${ids}) AND orientation_correction IS NULL
         AND date(COALESCE(taken_at, file_modified_at)) = ?
       ORDER BY id`
    : `SELECT id, file_path FROM photos
       WHERE folder_id IN (${ids}) AND orientation_correction IS NULL
       ORDER BY id`
  const params = date ? [date] : []
  const result = d.exec(query, params.length > 0 ? params : undefined)
  if (result.length === 0) return []
  return result[0].values.map((row) => ({
    id: row[0] as number,
    filePath: row[1] as string
  }))
}
