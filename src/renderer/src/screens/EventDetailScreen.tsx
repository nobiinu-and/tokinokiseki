import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { VirtuosoGrid } from 'react-virtuoso'
import { useApp } from '../context/AppContext'
import { usePhotos } from '../hooks/usePhotos'
import { PhotoThumbnail } from '../components/PhotoThumbnail'
import { Lightbox } from '../components/Lightbox'
import { TopBar } from '../components/TopBar'

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
          <button
            className="btn btn-accent"
            onClick={() => navigate(`/slideshow/${date}`)}
            disabled={bestCount === 0}
          >
            ▶ スライドショー ({bestCount})
          </button>
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
    </div>
  )
}
