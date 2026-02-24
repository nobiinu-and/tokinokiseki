import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { PhotoThumbnail } from '../components/PhotoThumbnail'
import { Lightbox } from '../components/Lightbox'
import { TopBar } from '../components/TopBar'
import type { Photo, EventConfirmed, PhotoTag } from '../types/models'

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

function getEventDates(event: EventConfirmed): string[] {
  if (event.type === 'dates' && event.dates) {
    return [...event.dates].sort()
  }
  // range: generate all dates between start and end
  const dates: string[] = []
  const current = new Date(event.startDate + 'T00:00:00')
  const end = new Date(event.endDate + 'T00:00:00')
  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10))
    current.setDate(current.getDate() + 1)
  }
  return dates
}

export function EventDetailScreen(): JSX.Element {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const { timelineId } = useApp()
  const [event, setEvent] = useState<EventConfirmed | null>(null)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [loading, setLoading] = useState(true)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [photoTags, setPhotoTags] = useState<Record<number, PhotoTag[]>>({})

  useEffect(() => {
    if (!timelineId || !id) return
    setLoading(true)
    window.api.getEvents(timelineId).then(async (events) => {
      const found = events.find((e) => e.id === Number(id))
      if (!found) {
        setLoading(false)
        return
      }
      setEvent(found)

      const dates = getEventDates(found)
      const allPhotos: Photo[] = []
      for (const date of dates) {
        const datePhotos = await window.api.getPhotosByDate(timelineId, date)
        allPhotos.push(...datePhotos)
      }
      setPhotos(allPhotos)
      setLoading(false)
    })
  }, [timelineId, id])

  // Load tags for photos
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

  const allTagNames = useMemo(() => {
    const names = new Set<string>()
    Object.values(photoTags).forEach((tags) => tags.forEach((t) => names.add(t.name)))
    return Array.from(names)
  }, [photoTags])

  const handleAddTag = useCallback(async (photoId: number, tagName: string): Promise<void> => {
    const updatedTags = await window.api.addTagToPhoto(photoId, tagName)
    setPhotoTags((prev) => ({ ...prev, [photoId]: updatedTags }))
  }, [])

  const handleRemoveTag = useCallback(async (photoId: number, tagName: string): Promise<void> => {
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
  }, [])

  const openLightbox = useCallback(
    (photo: Photo) => {
      const idx = allPhotosFlat.findIndex((p) => p.id === photo.id)
      if (idx !== -1) setLightboxIndex(idx)
    },
    [allPhotosFlat]
  )

  const handleSlideshow = (): void => {
    navigate('/slideshow')
  }

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
        title={event?.title || 'できごと'}
        onBack={() => navigate('/gallery')}
        actions={
          <div className="topbar-actions-group">
            <button className="btn btn-accent" onClick={handleSlideshow}>
              ▶ スライドショー
            </button>
          </div>
        }
      />

      <div className="gallery-detail-content">
        {loading ? (
          <div className="screen-center">
            <p>読み込み中...</p>
          </div>
        ) : !event ? (
          <div className="screen-center">
            <p>できごとが見つかりませんでした</p>
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
