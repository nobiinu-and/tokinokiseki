import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { usePhotoTags } from '../hooks/usePhotoTags'
import { PhotoThumbnail } from '../components/PhotoThumbnail'
import { Lightbox } from '../components/Lightbox'
import { TopBar } from '../components/TopBar'
import { buildDateGroups } from '../utils/dateUtils'
import type { Photo } from '../types/models'

export function BestCollectionScreen(): JSX.Element {
  const navigate = useNavigate()
  const { timelineId } = useApp()
  const [photos, setPhotos] = useState<Photo[]>([])
  const [loading, setLoading] = useState(true)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const { photoTags, allTagNames, handleAddTag, handleRemoveTag } = usePhotoTags(timelineId, photos)

  useEffect(() => {
    if (!timelineId) return
    setLoading(true)
    window.api.getBestPhotos(timelineId).then((bestPhotos) => {
      setPhotos(bestPhotos)
      setLoading(false)
    }).catch((err) => {
      console.error('Failed to load best photos:', err)
      setLoading(false)
    })
  }, [timelineId])

  const dateGroups = useMemo(() => buildDateGroups(photos), [photos])

  const allPhotosFlat = useMemo(() => dateGroups.flatMap((g) => g.photos), [dateGroups])

  const toggleBest = useCallback(async (photoId: number) => {
    const newValue = await window.api.toggleBest(photoId)
    setPhotos((prev) => {
      if (!newValue) {
        return prev.filter((p) => p.id !== photoId)
      }
      return prev.map((p) => (p.id === photoId ? { ...p, isBest: newValue } : p))
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
        title={`ベストコレクション (${photos.length}枚)`}
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
        ) : photos.length === 0 ? (
          <div className="screen-center">
            <p>まだベストはありません</p>
            <p className="text-hint">
              タイムラインで気に入った写真に★をつけると、ここに集まります
            </p>
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
