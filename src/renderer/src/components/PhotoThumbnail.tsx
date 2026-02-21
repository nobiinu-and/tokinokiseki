import { useState, useEffect } from 'react'
import { TagBadge } from './TagBadge'
import type { PhotoTag } from '../types/models'

interface Props {
  photoId: number
  filePath: string
  isBest: boolean
  onToggleBest: (photoId: number) => void
  onClick: () => void
  tags?: PhotoTag[]
}

export function PhotoThumbnail({
  photoId,
  filePath,
  isBest,
  onToggleBest,
  onClick,
  tags
}: Props): JSX.Element {
  const [thumbUrl, setThumbUrl] = useState<string>('')

  useEffect(() => {
    window.api.getThumbnailPath(photoId).then((url) => {
      if (url) setThumbUrl(url)
    })
  }, [photoId])

  const handleBestClick = (e: React.MouseEvent): void => {
    e.stopPropagation()
    onToggleBest(photoId)
  }

  return (
    <div className="photo-thumbnail" onClick={onClick}>
      {thumbUrl && <img src={thumbUrl} alt="" loading="lazy" />}
      <button
        className={`photo-best-btn ${isBest ? 'photo-best-active' : ''}`}
        onClick={handleBestClick}
        title={isBest ? 'ベストを解除' : 'ベストに設定'}
      >
        {isBest ? '★' : '☆'}
      </button>
      {tags && tags.length > 0 && (
        <div className="photo-tags">
          {tags.map((tag) => (
            <TagBadge key={tag.name} name={tag.name} confidence={tag.confidence} />
          ))}
        </div>
      )}
    </div>
  )
}
