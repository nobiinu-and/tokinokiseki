import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { usePhotoTags } from '../hooks/usePhotoTags'
import { PhotoThumbnail } from '../components/PhotoThumbnail'
import { Lightbox } from '../components/Lightbox'
import { TopBar } from '../components/TopBar'
import { buildDateGroups } from '../utils/dateUtils'
import type { Photo } from '../types/models'

export function TagDetailScreen(): JSX.Element {
  const navigate = useNavigate()
  const { name } = useParams<{ name: string }>()
  const { timelineId } = useApp()
  const tagName = name ?? ''
  const [photos, setPhotos] = useState<Photo[]>([])
  const [loading, setLoading] = useState(true)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const { photoTags, allTagNames, handleAddTag, handleRemoveTag } = usePhotoTags(timelineId, photos)

  useEffect(() => {
    if (!timelineId || !tagName) return
    setLoading(true)
    window.api.getPhotosByTag(timelineId, tagName).then((tagPhotos) => {
      setPhotos(tagPhotos)
      setLoading(false)
    }).catch((err) => {
      console.error('Failed to load tag photos:', err)
      setLoading(false)
    })
  }, [timelineId, tagName])

  const dateGroups = useMemo(() => buildDateGroups(photos), [photos])

  const allPhotosFlat = useMemo(() => dateGroups.flatMap((g) => g.photos), [dateGroups])

  const toggleBest = useCallback(async (photoId: number) => {
    const newValue = await window.api.toggleBest(photoId)
    setPhotos((prev) =>
      prev.map((p) => (p.id === photoId ? { ...p, isBest: newValue } : p))
    )
  }, [])

  const wrappedRemoveTag = useCallback(async (photoId: number, removeTagName: string): Promise<void> => {
    await handleRemoveTag(photoId, removeTagName)
    // If we removed the current tag, refresh photos
    if (removeTagName === tagName && timelineId) {
      window.api.getPhotosByTag(timelineId, tagName).then(setPhotos)
    }
  }, [handleRemoveTag, timelineId, tagName])

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
          onRemoveTag={wrappedRemoveTag}
        />
      )}
    </div>
  )
}
