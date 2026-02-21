import { nativeImage } from 'electron'
import { getThumbnailPath } from './thumbnail'
import { getPhotosByDate } from './database'
import fs from 'fs'

/**
 * Compute a dHash (difference hash) for an image.
 * Resizes to 9x8, converts to grayscale, compares adjacent horizontal pixels.
 * Returns a 64-bit hash as a 16-char hex string.
 */
export function computeDhash(imagePath: string): string | null {
  if (!fs.existsSync(imagePath)) return null

  const img = nativeImage.createFromPath(imagePath)
  if (img.isEmpty()) return null

  // Resize to 9x8 (9 wide so we get 8 horizontal diffs per row)
  const resized = img.resize({ width: 9, height: 8, quality: 'good' })
  const bitmap = resized.toBitmap() // BGRA format
  const W = 9
  const bpp = 4

  // Build 64-bit hash: for each row (8 rows), compare 8 adjacent pixel pairs
  let hash = ''
  for (let y = 0; y < 8; y++) {
    let byte = 0
    for (let x = 0; x < 8; x++) {
      const off1 = (y * W + x) * bpp
      const off2 = (y * W + x + 1) * bpp
      // Grayscale luminance: 0.114*B + 0.587*G + 0.299*R
      const gray1 = bitmap[off1] * 0.114 + bitmap[off1 + 1] * 0.587 + bitmap[off1 + 2] * 0.299
      const gray2 = bitmap[off2] * 0.114 + bitmap[off2 + 1] * 0.587 + bitmap[off2 + 2] * 0.299
      if (gray1 > gray2) {
        byte |= 1 << (7 - x)
      }
    }
    hash += byte.toString(16).padStart(2, '0')
  }

  return hash
}

/**
 * Hamming distance between two hex hash strings.
 */
function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) return 64
  let dist = 0
  for (let i = 0; i < a.length; i += 2) {
    const byteA = parseInt(a.substring(i, i + 2), 16)
    const byteB = parseInt(b.substring(i, i + 2), 16)
    let xor = byteA ^ byteB
    while (xor) {
      dist += xor & 1
      xor >>= 1
    }
  }
  return dist
}

// Union-Find
class UnionFind {
  parent: number[]
  rank: number[]

  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i)
    this.rank = new Array(n).fill(0)
  }

  find(x: number): number {
    if (this.parent[x] !== x) {
      this.parent[x] = this.find(this.parent[x])
    }
    return this.parent[x]
  }

  union(x: number, y: number): void {
    const rx = this.find(x)
    const ry = this.find(y)
    if (rx === ry) return
    if (this.rank[rx] < this.rank[ry]) {
      this.parent[rx] = ry
    } else if (this.rank[rx] > this.rank[ry]) {
      this.parent[ry] = rx
    } else {
      this.parent[ry] = rx
      this.rank[rx]++
    }
  }
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

/**
 * Find groups of duplicate/similar photos within a single date event.
 */
export function findDuplicateGroups(
  folderId: number,
  date: string,
  threshold: number = 10
): DuplicateGroup[] {
  const photos = getPhotosByDate(folderId, date)
  if (photos.length < 2) return []

  // Compute dHash for each photo using its thumbnail
  const hashed: { idx: number; id: number; filePath: string; fileName: string; hash: string }[] =
    []

  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i]
    const thumbPath = getThumbnailPath(photo.filePath)
    const hash = computeDhash(thumbPath)
    if (hash) {
      hashed.push({
        idx: hashed.length,
        id: photo.id,
        filePath: photo.filePath,
        fileName: photo.fileName,
        hash
      })
    }
  }

  if (hashed.length < 2) return []

  // Compare all pairs, union those within threshold
  const uf = new UnionFind(hashed.length)

  for (let i = 0; i < hashed.length; i++) {
    for (let j = i + 1; j < hashed.length; j++) {
      const dist = hammingDistance(hashed[i].hash, hashed[j].hash)
      if (dist <= threshold) {
        uf.union(i, j)
      }
    }
  }

  // Collect groups
  const groupMap = new Map<number, DuplicatePhotoInfo[]>()
  for (const item of hashed) {
    const root = uf.find(item.idx)
    if (!groupMap.has(root)) {
      groupMap.set(root, [])
    }
    groupMap.get(root)!.push({
      id: item.id,
      filePath: item.filePath,
      fileName: item.fileName,
      hash: item.hash
    })
  }

  // Only return groups with 2+ photos
  return Array.from(groupMap.values())
    .filter((g) => g.length >= 2)
    .sort((a, b) => b.length - a.length)
    .map((photos) => ({ photos }))
}
