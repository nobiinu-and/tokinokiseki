import { useState, useEffect, useCallback } from 'react'
import type { Photo, PhotoTag } from '../types/models'

interface UsePhotoTagsResult {
  photoTags: Record<number, PhotoTag[]>
  allTagNames: string[]
  handleAddTag: (photoId: number, tagName: string) => Promise<void>
  handleRemoveTag: (photoId: number, tagName: string) => Promise<void>
  reloadTags: () => void
}

export function usePhotoTags(timelineId: number | null, photos: Photo[]): UsePhotoTagsResult {
  const [photoTags, setPhotoTags] = useState<Record<number, PhotoTag[]>>({})
  const [allTagNames, setAllTagNames] = useState<string[]>([])

  const loadAllTagNames = useCallback(() => {
    if (!timelineId) return
    window.api.getTagStats(timelineId).then((stats) => {
      setAllTagNames(stats.map((s) => s.name))
    })
  }, [timelineId])

  const loadTags = useCallback(() => {
    if (photos.length === 0) {
      setPhotoTags({})
      return
    }
    Promise.all(
      photos.map((photo) =>
        window.api.getTagsForPhoto(photo.id).then((tags) => ({ id: photo.id, tags }))
      )
    ).then((results) => {
      const tagMap: Record<number, PhotoTag[]> = {}
      for (const { id, tags } of results) {
        if (tags.length > 0) tagMap[id] = tags
      }
      setPhotoTags(tagMap)
    })
  }, [photos])

  useEffect(() => {
    loadTags()
  }, [loadTags])

  useEffect(() => {
    loadAllTagNames()
  }, [loadAllTagNames])

  const handleAddTag = useCallback(
    async (photoId: number, tagName: string): Promise<void> => {
      const updatedTags = await window.api.addTagToPhoto(photoId, tagName)
      setPhotoTags((prev) => ({ ...prev, [photoId]: updatedTags }))
      loadAllTagNames()
    },
    [loadAllTagNames]
  )

  const handleRemoveTag = useCallback(
    async (photoId: number, tagName: string): Promise<void> => {
      const updatedTags = await window.api.removeTagFromPhoto(photoId, tagName)
      setPhotoTags((prev) => {
        const next = { ...prev }
        if (updatedTags.length > 0) {
          next[photoId] = updatedTags
        } else {
          delete next[photoId]
        }
        return next
      })
      loadAllTagNames()
    },
    [loadAllTagNames]
  )

  return { photoTags, allTagNames, handleAddTag, handleRemoveTag, reloadTags: loadTags }
}
