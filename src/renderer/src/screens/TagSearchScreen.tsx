import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { usePhotoTags } from '../hooks/usePhotoTags'
import { PhotoThumbnail } from '../components/PhotoThumbnail'
import { Lightbox } from '../components/Lightbox'
import { TopBar } from '../components/TopBar'
import { formatDate } from '../utils/dateUtils'
import type { Photo } from '../types/models'
import type { DateGroup } from '../utils/dateUtils'

interface TagStat {
  name: string
  count: number
}

export function TagSearchScreen(): JSX.Element {
  const navigate = useNavigate()
  const { timelineId } = useApp()
  const [tagStats, setTagStats] = useState<TagStat[]>([])
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [loading, setLoading] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const { photoTags, allTagNames, handleAddTag, handleRemoveTag: baseRemoveTag } = usePhotoTags(timelineId, photos)

  // Load tag stats
  useEffect(() => {
    if (!timelineId) return
    window.api.getTagStats(timelineId).then(setTagStats)
  }, [timelineId])

  // Load photos when tag is selected
  useEffect(() => {
    if (!timelineId || !selectedTag) {
      setPhotos([])
      return
    }
    setLoading(true)
    window.api
      .getPhotosByTag(timelineId, selectedTag)
      .then(setPhotos)
      .finally(() => setLoading(false))
  }, [timelineId, selectedTag])

  // Group photos by date
  const dateGroups = useMemo((): DateGroup[] => {
    const map: Record<string, Photo[]> = {}
    for (const photo of photos) {
      const dateStr = (photo.takenAt || photo.fileModifiedAt || '').slice(0, 10)
      if (!map[dateStr]) {
        map[dateStr] = []
      }
      map[dateStr].push(photo)
    }
    const groups: DateGroup[] = Object.entries(map).map(([date, datePhotos]) => ({
      date,
      displayDate: formatDate(date),
      photos: datePhotos
    }))
    groups.sort((a, b) => b.date.localeCompare(a.date))
    return groups
  }, [photos])

  // Flat list of all photos for Lightbox navigation
  const allPhotosFlat = useMemo(() => {
    return dateGroups.flatMap((g) => g.photos)
  }, [dateGroups])

  const toggleBest = useCallback(async (photoId: number) => {
    const newValue = await window.api.toggleBest(photoId)
    setPhotos((prev) =>
      prev.map((p) => (p.id === photoId ? { ...p, isBest: newValue } : p))
    )
  }, [])

  const handleAddTagWrapped = useCallback(async (photoId: number, tagName: string): Promise<void> => {
    await handleAddTag(photoId, tagName)
    // Refresh tag stats to update the chip list
    if (timelineId) {
      window.api.getTagStats(timelineId).then(setTagStats)
    }
  }, [handleAddTag, timelineId])

  const handleRemoveTag = useCallback(async (photoId: number, tagName: string): Promise<void> => {
    await baseRemoveTag(photoId, tagName)
    // Refresh tag stats to update the chip list
    if (timelineId) {
      window.api.getTagStats(timelineId).then(setTagStats)
    }
    // If we removed the currently selected tag from a photo, refresh the photo list
    if (tagName === selectedTag && timelineId) {
      window.api.getPhotosByTag(timelineId, tagName).then(setPhotos)
    }
  }, [baseRemoveTag, timelineId, selectedTag])

  // Calculate flat index for Lightbox from date group + local index
  const openLightbox = useCallback(
    (photo: Photo) => {
      const idx = allPhotosFlat.findIndex((p) => p.id === photo.id)
      if (idx !== -1) setLightboxIndex(idx)
    },
    [allPhotosFlat]
  )

  if (!timelineId) {
    navigate('/')
    return <></>
  }

  return (
    <div className="screen tag-search-screen">
      <TopBar
        title="タグ検索"
        onBack={() => navigate('/timeline')}
      />

      {/* Tag chips */}
      <div className="tag-chips">
        {tagStats.length === 0 ? (
          <div className="tag-chips-empty">タグが見つかりません</div>
        ) : (
          tagStats.map((tag) => (
            <button
              key={tag.name}
              className={`tag-chip ${selectedTag === tag.name ? 'tag-chip-active' : ''}`}
              onClick={() => setSelectedTag(selectedTag === tag.name ? null : tag.name)}
            >
              {tag.name} <span className="tag-chip-count">{tag.count}</span>
            </button>
          ))
        )}
      </div>

      {/* Content */}
      <div className="tag-search-content">
        {!selectedTag ? (
          <div className="screen-center">
            <p>タグを選択してください</p>
          </div>
        ) : loading ? (
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
          onAddTag={handleAddTagWrapped}
          onRemoveTag={handleRemoveTag}
        />
      )}
    </div>
  )
}
