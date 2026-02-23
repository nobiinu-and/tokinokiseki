import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { useSlideshow } from '../hooks/useSlideshow'

interface SlideshowPhoto {
  id: number
  filePath: string
  fileName: string
}

export function SlideshowScreen(): JSX.Element {
  const navigate = useNavigate()
  const { date } = useParams<{ date: string }>()
  const { currentFolder } = useApp()
  const [photos, setPhotos] = useState<SlideshowPhoto[]>([])
  const [photoUrl, setPhotoUrl] = useState<string>('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!currentFolder) return
    setLoading(true)
    const fetchPhotos = date
      ? window.api.getBestPhotosForDate(currentFolder.id, date)
      : window.api.getBestPhotos(currentFolder.id)

    fetchPhotos.then((result) => {
      setPhotos(result)
      setLoading(false)
    })
  }, [currentFolder, date])

  const onExit = (): void => {
    if (date) {
      navigate(`/timeline/${date}`)
    } else {
      navigate('/timeline')
    }
  }

  const { currentPhoto, currentIndex, total, isPaused, togglePause } = useSlideshow({
    photos,
    intervalMs: 5000,
    onExit
  })

  useEffect(() => {
    if (currentPhoto) {
      window.api.getPhotoFileUrl(currentPhoto.filePath).then(setPhotoUrl)
    }
  }, [currentPhoto])

  if (!currentFolder) {
    navigate('/')
    return <></>
  }

  if (loading) {
    return (
      <div className="slideshow-screen" onClick={onExit}>
        <div className="slideshow-message">読み込み中...</div>
      </div>
    )
  }

  if (photos.length === 0) {
    return (
      <div className="slideshow-screen" onClick={onExit}>
        <div className="slideshow-message">
          <p>ベストマーク付きの写真がありません</p>
          <p className="slideshow-hint">写真に★をつけてからお楽しみください</p>
        </div>
      </div>
    )
  }

  return (
    <div className="slideshow-screen" onClick={onExit}>
      <div className="slideshow-image-container" onClick={(e) => e.stopPropagation()}>
        {photoUrl && (
          <img src={photoUrl} alt="" className="slideshow-image" />
        )}
      </div>

      <div className="slideshow-controls" onClick={(e) => e.stopPropagation()}>
        <span className="slideshow-counter">
          {currentIndex + 1} / {total}
        </span>
        <button className="slideshow-pause-btn" onClick={togglePause}>
          {isPaused ? '▶' : '⏸'}
        </button>
        <button className="slideshow-exit-btn" onClick={onExit}>
          ✕
        </button>
      </div>
    </div>
  )
}
