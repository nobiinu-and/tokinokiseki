import { useState, useEffect, useCallback } from 'react'
import type { Photo } from '../types/models'

interface UsePhotosResult {
  photos: Photo[]
  loading: boolean
  toggleBest: (photoId: number) => Promise<void>
  reload: () => void
}

export function usePhotos(folderId: number | null, date: string | null): UsePhotosResult {
  const [photos, setPhotos] = useState<Photo[]>([])
  const [loading, setLoading] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (folderId === null || date === null) return
    setLoading(true)
    window.api
      .getPhotosByDate(folderId, date)
      .then(setPhotos)
      .finally(() => setLoading(false))
  }, [folderId, date, reloadKey])

  const toggleBest = useCallback(async (photoId: number) => {
    const newValue = await window.api.toggleBest(photoId)
    setPhotos((prev) =>
      prev.map((p) => (p.id === photoId ? { ...p, isBest: newValue } : p))
    )
  }, [])

  const reload = useCallback(() => {
    setReloadKey((k) => k + 1)
  }, [])

  return { photos, loading, toggleBest, reload }
}
