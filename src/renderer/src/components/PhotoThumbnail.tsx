import { useState, useEffect } from 'react'

interface Props {
  photoId: number
  filePath: string
  isBest: boolean
  onToggleBest: (photoId: number) => void
  onClick: () => void
}

export function PhotoThumbnail({
  photoId,
  filePath,
  isBest,
  onToggleBest,
  onClick
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
    </div>
  )
}
