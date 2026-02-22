import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { PhotoThumbnail } from '../components/PhotoThumbnail'
import { Lightbox } from '../components/Lightbox'
import { TopBar } from '../components/TopBar'
import type { Photo, PhotoTag } from '../types/models'

interface TagStat {
  name: string
  count: number
}

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

export function TagSearchScreen(): JSX.Element {
  const navigate = useNavigate()
  const { currentFolder } = useApp()
  const [tagStats, setTagStats] = useState<TagStat[]>([])
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [loading, setLoading] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [photoTags, setPhotoTags] = useState<Record<number, PhotoTag[]>>({})

  // Load tag stats
  useEffect(() => {
    if (!currentFolder) return
    window.api.getTagStats(currentFolder.id).then(setTagStats)
  }, [currentFolder])

  // Load photos when tag is selected
  useEffect(() => {
    if (!currentFolder || !selectedTag) {
      setPhotos([])
      return
    }
    setLoading(true)
    window.api
      .getPhotosByTag(currentFolder.id, selectedTag)
      .then(setPhotos)
      .finally(() => setLoading(false))
  }, [currentFolder, selectedTag])

  // Load tags for each photo
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
    // Already sorted DESC from SQL, but group order should also be DESC
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

  // Calculate flat index for Lightbox from date group + local index
  const openLightbox = useCallback(
    (photo: Photo) => {
      const idx = allPhotosFlat.findIndex((p) => p.id === photo.id)
      if (idx !== -1) setLightboxIndex(idx)
    },
    [allPhotosFlat]
  )

  if (!currentFolder) {
    navigate('/')
    return <></>
  }

  return (
    <div className="screen tag-search-screen">
      <TopBar
        title="タグ検索"
        onBack={() => navigate('/events')}
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
        />
      )}
    </div>
  )
}
