import { Worker } from 'worker_threads'
import { BrowserWindow, app } from 'electron'
import path from 'path'
import fs from 'fs'
import exifr from 'exifr'
import { IPC_CHANNELS } from '../renderer/src/types/ipc'
import * as db from './database'
import { getThumbnailPath } from './thumbnail'

const COCO_LABEL_MAP: Record<string, string> = {
  person: '人物',
  bicycle: '自転車',
  car: '車',
  motorcycle: 'バイク',
  airplane: '飛行機',
  bus: 'バス',
  train: '電車',
  truck: 'トラック',
  boat: '船',
  'traffic light': '信号機',
  'fire hydrant': '消火栓',
  'stop sign': '停止標識',
  bench: 'ベンチ',
  bird: '鳥',
  cat: '猫',
  dog: '犬',
  horse: '馬',
  sheep: '羊',
  cow: '牛',
  elephant: '象',
  bear: 'クマ',
  zebra: 'シマウマ',
  giraffe: 'キリン',
  backpack: 'リュック',
  umbrella: '傘',
  handbag: 'カバン',
  tie: 'ネクタイ',
  suitcase: 'スーツケース',
  bottle: 'ボトル',
  'wine glass': 'ワイングラス',
  cup: 'カップ',
  fork: 'フォーク',
  knife: 'ナイフ',
  spoon: 'スプーン',
  bowl: 'ボウル',
  banana: 'バナナ',
  apple: 'リンゴ',
  sandwich: 'サンドイッチ',
  pizza: 'ピザ',
  cake: 'ケーキ',
  chair: '椅子',
  couch: 'ソファ',
  'potted plant': '鉢植え',
  bed: 'ベッド',
  'dining table': 'テーブル',
  tv: 'テレビ',
  laptop: 'ノートPC',
  'cell phone': 'スマホ',
  book: '本',
  clock: '時計',
  vase: '花瓶',
  scissors: 'ハサミ',
  'teddy bear': 'ぬいぐるみ',
  'sports ball': 'ボール',
  'baseball bat': 'バット',
  'tennis racket': 'ラケット',
  skateboard: 'スケボー',
  surfboard: 'サーフボード',
  ski: 'スキー',
  snowboard: 'スノーボード',
  kite: '凧'
}

export async function startDetection(
  folderIds: number[],
  threshold: number,
  mainWindow: BrowserWindow,
  date?: string,
  signal?: AbortSignal
): Promise<{ tagged: number }> {
  await db.ensureDb()
  const photos = date
    ? db.getPhotosByDate(folderIds, date).map((p) => ({ id: p.id, filePath: p.filePath }))
    : db.getAllPhotosInFolders(folderIds)
  const total = photos.length

  if (total === 0) {
    return { tagged: 0 }
  }

  const cacheDir = path.join(app.getPath('userData'), 'detect-models')
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true })
  }

  const workerPath = path.join(__dirname, 'detect-worker.js')
  const worker = new Worker(workerPath)

  // Wait for model init
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      worker.terminate()
      reject(new Error('Object detection model initialization timed out (5 min)'))
    }, 300000)

    const handler = (msg: { type: string; message?: string }): void => {
      if (msg.type === 'ready') {
        clearTimeout(timeout)
        worker.off('message', handler)
        resolve()
      } else if (msg.type === 'error') {
        clearTimeout(timeout)
        worker.off('message', handler)
        reject(new Error(msg.message || 'Detection init failed'))
      }
    }
    worker.on('message', handler)
    worker.on('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })

    mainWindow.webContents.send(IPC_CHANNELS.AUTO_TAG_PROGRESS, {
      phase: 'loading_detect_model' as const,
      current: 0,
      total
    })

    worker.postMessage({ type: 'init', cacheDir })
  })

  // Process each photo
  let processed = 0
  let tagged = 0

  for (const photo of photos) {
    if (signal?.aborted) {
      db.saveDatabase()
      worker.terminate()
      return { tagged }
    }

    const thumbPath = getThumbnailPath(photo.filePath)
    const imagePath = fs.existsSync(thumbPath) ? thumbPath : photo.filePath

    let orientation = 1
    try {
      orientation = (await exifr.orientation(photo.filePath)) || 1
    } catch {
      // No EXIF data
    }

    try {
      const result = await new Promise<{ label: string; score: number }[]>(
        (resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error(`Detection timed out: ${photo.filePath}`))
          }, 30000)

          const handler = (msg: {
            type: string
            tags?: { label: string; score: number }[]
            message?: string
          }): void => {
            if (msg.type === 'result') {
              clearTimeout(timeout)
              worker.off('message', handler)
              resolve(msg.tags || [])
            } else if (msg.type === 'error') {
              clearTimeout(timeout)
              worker.off('message', handler)
              reject(new Error(msg.message || 'Detection failed'))
            }
          }
          worker.on('message', handler)
          worker.postMessage({ type: 'detect', imagePath, threshold, orientation })
        }
      )

      // Save detected tags with Japanese display names
      let photoTagged = false
      for (const det of result) {
        const displayName = COCO_LABEL_MAP[det.label] ?? det.label
        const tagId = db.upsertTag(displayName)
        db.insertPhotoTag(photo.id, tagId, det.score)
        photoTagged = true
      }
      if (photoTagged) tagged++
    } catch (err) {
      console.error(`Failed to detect objects in ${photo.filePath}:`, err)
    }

    processed++
    if (processed % 5 === 0 || processed === total) {
      db.saveDatabase()
    }

    mainWindow.webContents.send(IPC_CHANNELS.AUTO_TAG_PROGRESS, {
      phase: 'detecting' as const,
      current: processed,
      total
    })
  }

  db.saveDatabase()
  worker.terminate()

  return { tagged }
}
