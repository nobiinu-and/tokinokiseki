import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { PhotoThumbnail } from '../components/PhotoThumbnail'
import { Lightbox } from '../components/Lightbox'
import { TopBar } from '../components/TopBar'
import type { Photo, PhotoTag } from '../types/models'

interface DateGroup {
  date: string
  displayDate: string
  photos: Photo[]
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short'
  })
}

export function TagDetailScreen(): JSX.Element {
  const navigate = useNavigate()
  const { name } = useParams<{ name: string }>()
  const { timelineId } = useApp()
  const tagName = name ? decodeURIComponent(name) : ''
  const [photos, setPhotos] = useState<Photo[]>([])
  const [loading, setLoading] = useState(true)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [photoTags, setPhotoTags] = useState<Record<number, PhotoTag[]>>({})
  const [allTagNames, setAllTagNames] = useState<string[]>([])

  useEffect(() => {
    if (!timelineId || !tagName) return
    setLoading(true)
    Promise.all([
      window.api.getPhotosByTag(timelineId, tagName),
      window.api.getTagStats(timelineId)
    ]).then(([tagPhotos, tagStats]) => {
      setPhotos(tagPhotos)
      setAllTagNames(tagStats.map((s) => s.name))
      setLoading(false)
    })
  }, [timelineId, tagName])

  // Load tags for each photo
  useEffect(() => {
    if (photos.length === 0) return
    const loadTags = async (): Promise<void> => {
      const tagMap: Record<number, PhotoTag[]> = {}
      for (const photo of photos) {
        const tags = await window.api.getTagsForPhoto(photo.id)
        if (tags.length > 0) tagMap[photo.id] = tags
      }
      setPhotoTags(tagMap)
    }
    loadTags()
  }, [photos])

  const dateGroups = useMemo((): DateGroup[] => {
    const map: Record<string, Photo[]> = {}
    for (const photo of photos) {
      const dateStr = (photo.takenAt || photo.fileModifiedAt || '').slice(0, 10)
      if (!map[dateStr]) map[dateStr] = []
      map[dateStr].push(photo)
    }
    return Object.entries(map)
      .map(([date, datePhotos]) => ({
        date,
        displayDate: formatDate(date),
        photos: datePhotos
      }))
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [photos])

  const allPhotosFlat = useMemo(() => dateGroups.flatMap((g) => g.photos), [dateGroups])

  const toggleBest = useCallback(async (photoId: number) => {
    const newValue = await window.api.toggleBest(photoId)
    setPhotos((prev) =>
      prev.map((p) => (p.id === photoId ? { ...p, isBest: newValue } : p))
    )
  }, [])

  const handleAddTag = useCallback(async (photoId: number, addTagName: string): Promise<void> => {
    const updatedTags = await window.api.addTagToPhoto(photoId, addTagName)
    setPhotoTags((prev) => ({ ...prev, [photoId]: updatedTags }))
    if (timelineId) {
      window.api.getTagStats(timelineId).then((stats) =>
        setAllTagNames(stats.map((s) => s.name))
      )
    }
  }, [timelineId])

  const handleRemoveTag = useCallback(async (photoId: number, removeTagName: string): Promise<void> => {
    const updatedTags = await window.api.removeTagFromPhoto(photoId, removeTagName)
    setPhotoTags((prev) => {
      const next = { ...prev }
      if (updatedTags.length > 0) {
        next[photoId] = updatedTags
      } else {
        delete next[photoId]
      }
      return next
    })
    // If we removed the current tag, refresh photos
    if (removeTagName === tagName && timelineId) {
      window.api.getPhotosByTag(timelineId, tagName).then(setPhotos)
    }
    if (timelineId) {
      window.api.getTagStats(timelineId).then((stats) =>
        setAllTagNames(stats.map((s) => s.name))
      )
    }
  }, [timelineId, tagName])

  const openLightbox = useCallback(
    (photo: Photo) => {
      const idx = allPhotosFlat.findIndex((p) => p.id === photo.id)
      if (idx !== -1) setLightboxIndex(idx)
    },
    [allPhotosFlat]
  )

  if (!timelineId) {
    return (
      <div className="screen screen-center">
        <p>タイムラインが見つかりません</p>
      </div>
    )
  }

  return (
    <div className="screen gallery-detail-screen">
      <TopBar
        title={tagName}
        onBack={() => navigate('/gallery')}
      />

      <div className="gallery-detail-content">
        {loading ? (
          <div className="screen-center">
            <p>読み込み中...</p>
          </div>
        ) : photos.length === 0 ? (
          <div className="screen-center">
            <p>写真が見つかりませんでした</p>
          </div>
        ) : (
          dateGroups.map((group) => (
            <div key={group.date} className="tag-search-date-section">
              <div className="tag-search-date-header">
                {group.displayDate} ({group.photos.length}枚)
              </div>
              <div className="tag-search-photo-grid">
                {group.photos.map((photo) => (
                  <div key={photo.id} className="photo-grid-item">
                    <PhotoThumbnail
                      photoId={photo.id}
                      filePath={photo.filePath}
                      isBest={photo.isBest}
                      orientationCorrection={photo.orientationCorrection}
                      onToggleBest={toggleBest}
                      onClick={() => openLightbox(photo)}
                      tags={photoTags[photo.id]}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {lightboxIndex !== null && (
        <Lightbox
          photos={allPhotosFlat}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onToggleBest={toggleBest}
          tags={photoTags}
          allTags={allTagNames}
          onAddTag={handleAddTag}
          onRemoveTag={handleRemoveTag}
        />
      )}
    </div>
  )
}
