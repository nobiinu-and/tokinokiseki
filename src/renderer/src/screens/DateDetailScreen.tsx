import { useState, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { VirtuosoGrid } from 'react-virtuoso'
import { useApp } from '../context/AppContext'
import { usePhotos } from '../hooks/usePhotos'
import { usePhotoTags } from '../hooks/usePhotoTags'
import { PhotoThumbnail } from '../components/PhotoThumbnail'
import { Lightbox } from '../components/Lightbox'
import { TopBar } from '../components/TopBar'
import { AutoTagDialog } from '../components/AutoTagDialog'
import { DuplicateDialog } from '../components/DuplicateDialog'
import { formatDate } from '../utils/dateUtils'

export function DateDetailScreen(): JSX.Element {
  const navigate = useNavigate()
  const { date } = useParams<{ date: string }>()
  const { timelineId } = useApp()
  const { photos, loading, toggleBest, reload } = usePhotos(timelineId, date ?? null)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [showAutoTag, setShowAutoTag] = useState(false)
  const [showDuplicates, setShowDuplicates] = useState(false)

  const { photoTags, allTagNames, handleAddTag, handleRemoveTag, reloadTags } = usePhotoTags(timelineId, photos)

  const handleAutoTagComplete = useCallback(() => {
    reload()
    reloadTags()
  }, [reload, reloadTags])

  if (!timelineId || !date) {
    navigate('/')
    return <></>
  }

  const bestCount = photos.filter((p) => p.isBest).length

  return (
    <div className="screen date-detail-screen">
      <TopBar
        title={`${formatDate(date)} (${photos.length}枚)`}
        onBack={() => navigate('/timeline')}
        actions={
          <div className="topbar-actions-group">
            <button className="btn btn-secondary" onClick={() => setShowDuplicates(true)}>
              重複チェック
            </button>
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
                  orientationCorrection={photo.orientationCorrection}
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
          tags={photoTags}
          allTags={allTagNames}
          onAddTag={handleAddTag}
          onRemoveTag={handleRemoveTag}
        />
      )}

      {showAutoTag && timelineId && (
        <AutoTagDialog
          timelineId={timelineId}
          date={date}
          onClose={() => setShowAutoTag(false)}
          onComplete={handleAutoTagComplete}
        />
      )}

      {showDuplicates && timelineId && (
        <DuplicateDialog
          timelineId={timelineId}
          date={date}
          onClose={() => setShowDuplicates(false)}
          onComplete={() => reload()}
        />
      )}
    </div>
  )
}
