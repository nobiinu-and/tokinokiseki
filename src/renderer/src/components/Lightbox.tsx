import { useState, useEffect, useCallback } from 'react'
import { LightboxTagEditor } from './LightboxTagEditor'
import type { Photo, PhotoTag } from '../types/models'

interface Props {
  photos: Photo[]
  initialIndex: number
  onClose: () => void
  onToggleBest: (photoId: number) => void
  tags?: Record<number, PhotoTag[]>
  allTags?: string[]
  onAddTag?: (photoId: number, tagName: string) => Promise<void>
  onRemoveTag?: (photoId: number, tagName: string) => Promise<void>
}

export function Lightbox({ photos, initialIndex, onClose, onToggleBest, tags, allTags, onAddTag, onRemoveTag }: Props): JSX.Element {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [photoUrl, setPhotoUrl] = useState<string>('')

  const currentPhoto = photos[currentIndex]

  useEffect(() => {
    if (currentPhoto) {
      window.api.getPhotoFileUrl(currentPhoto.filePath).then(setPhotoUrl)
    }
  }, [currentPhoto])

  const next = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % photos.length)
  }, [photos.length])

  const prev = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + photos.length) % photos.length)
  }, [photos.length])

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.target instanceof HTMLInputElement) return
      switch (e.key) {
        case 'Escape':
          onClose()
          break
        case 'ArrowRight':
          next()
          break
        case 'ArrowLeft':
          prev()
          break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, next, prev])

  if (!currentPhoto) return <></>

  return (
    <div className="lightbox" onClick={onClose}>
      <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
        <button className="lightbox-close" onClick={onClose}>
          ✕
        </button>

        <button className="lightbox-nav lightbox-nav-left" onClick={prev}>
          ‹
        </button>

        <div className="lightbox-image-container">
          {photoUrl && (
            <img
              src={photoUrl}
              alt={currentPhoto.fileName}
              className="lightbox-image"
              style={
                currentPhoto.orientationCorrection && currentPhoto.orientationCorrection !== 0
                  ? {
                      transform: `rotate(${currentPhoto.orientationCorrection}deg)`,
                      maxWidth:
                        currentPhoto.orientationCorrection === 90 ||
                        currentPhoto.orientationCorrection === 270
                          ? '100vh'
                          : undefined,
                      maxHeight:
                        currentPhoto.orientationCorrection === 90 ||
                        currentPhoto.orientationCorrection === 270
                          ? '100vw'
                          : undefined
                    }
                  : undefined
              }
            />
          )}
        </div>

        <button className="lightbox-nav lightbox-nav-right" onClick={next}>
          ›
        </button>

        <div className="lightbox-footer">
          {tags && allTags && onAddTag && onRemoveTag && (
            <LightboxTagEditor
              tags={tags[currentPhoto.id] || []}
              allTags={allTags}
              onAdd={(tagName) => onAddTag(currentPhoto.id, tagName)}
              onRemove={(tagName) => onRemoveTag(currentPhoto.id, tagName)}
            />
          )}
          <div className="lightbox-footer-info">
            <span className="lightbox-filename">{currentPhoto.fileName}</span>
            <span className="lightbox-counter">
              {currentIndex + 1} / {photos.length}
            </span>
            <button
              className={`lightbox-best-btn ${currentPhoto.isBest ? 'photo-best-active' : ''}`}
              onClick={() => onToggleBest(currentPhoto.id)}
            >
              {currentPhoto.isBest ? '★ ベスト' : '☆ ベストに設定'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
