import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { VirtuosoGrid } from 'react-virtuoso'
import { useApp } from '../context/AppContext'
import { usePhotos } from '../hooks/usePhotos'
import { PhotoThumbnail } from '../components/PhotoThumbnail'
import { Lightbox } from '../components/Lightbox'
import { TopBar } from '../components/TopBar'
import { AutoTagDialog } from '../components/AutoTagDialog'
import type { PhotoTag } from '../types/models'

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short'
  })
}

export function EventDetailScreen(): JSX.Element {
  const navigate = useNavigate()
  const { date } = useParams<{ date: string }>()
  const { currentFolder } = useApp()
  const { photos, loading, toggleBest } = usePhotos(currentFolder?.id ?? null, date ?? null)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [photoTags, setPhotoTags] = useState<Record<number, PhotoTag[]>>({})
  const [showAutoTag, setShowAutoTag] = useState(false)

  const loadTags = useCallback(async (): Promise<void> => {
    if (photos.length === 0) return
    const tagMap: Record<number, PhotoTag[]> = {}
    for (const photo of photos) {
      const tags = await window.api.getTagsForPhoto(photo.id)
      if (tags.length > 0) {
        tagMap[photo.id] = tags
      }
    }
    setPhotoTags(tagMap)
  }, [photos])

  useEffect(() => {
    loadTags()
  }, [loadTags])

  if (!currentFolder || !date) {
    navigate('/')
    return <></>
  }

  const bestCount = photos.filter((p) => p.isBest).length

  return (
    <div className="screen event-detail-screen">
      <TopBar
        title={`${formatDate(date)} (${photos.length}枚)`}
        onBack={() => navigate('/events')}
        actions={
          <div className="topbar-actions-group">
            <button className="btn btn-secondary" onClick={() => setShowAutoTag(true)}>
              タグ付け
            </button>
            <button
              className="btn btn-accent"
              onClick={() => navigate(`/slideshow/${date}`)}
              disabled={bestCount === 0}
            >
              ▶ スライドショー ({bestCount})
            </button>
          </div>
        }
      />

      {loading ? (
        <div className="screen-center">
          <p>読み込み中...</p>
        </div>
      ) : (
        <div className="photo-grid-container">
          <VirtuosoGrid
            totalCount={photos.length}
            listClassName="photo-grid"
            itemClassName="photo-grid-item"
            itemContent={(index) => {
              const photo = photos[index]
              return (
                <PhotoThumbnail
                  photoId={photo.id}
                  filePath={photo.filePath}
                  isBest={photo.isBest}
                  onToggleBest={toggleBest}
                  onClick={() => setLightboxIndex(index)}
                  tags={photoTags[photo.id]}
                />
              )
            }}
          />
        </div>
      )}

      {lightboxIndex !== null && (
        <Lightbox
          photos={photos}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onToggleBest={toggleBest}
        />
      )}

      {showAutoTag && currentFolder && (
        <AutoTagDialog
          folderId={currentFolder.id}
          date={date}
          onClose={() => setShowAutoTag(false)}
          onComplete={() => loadTags()}
        />
      )}
    </div>
  )
}
