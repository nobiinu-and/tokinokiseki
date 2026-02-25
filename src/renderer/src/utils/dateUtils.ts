import type { Photo } from '../types/models'

export interface DateGroup {
  date: string
  displayDate: string
  photos: Photo[]
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return '日付不明'
  const d = new Date(dateStr + 'T00:00:00')
  if (isNaN(d.getTime())) return '日付不明'
  return d.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short'
  })
}

export function getDateKey(photo: Photo): string {
  const raw = photo.takenAt || photo.fileModifiedAt
  return raw ? raw.slice(0, 10) : 'unknown'
}

export function buildDateGroups(photos: Photo[]): DateGroup[] {
  const map: Record<string, Photo[]> = {}
  for (const photo of photos) {
    const key = getDateKey(photo)
    if (!map[key]) map[key] = []
    map[key].push(photo)
  }
  return Object.entries(map)
    .map(([date, datePhotos]) => ({
      date,
      displayDate: date === 'unknown' ? '日付不明' : formatDate(date),
      photos: datePhotos
    }))
    .sort((a, b) => {
      if (a.date === 'unknown') return 1
      if (b.date === 'unknown') return -1
      return b.date.localeCompare(a.date)
    })
}
