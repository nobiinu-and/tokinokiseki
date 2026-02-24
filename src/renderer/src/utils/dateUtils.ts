import type { Photo } from '../types/models'

export interface DateGroup {
  date: string
  displayDate: string
  photos: Photo[]
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short'
  })
}
