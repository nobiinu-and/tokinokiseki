import { useState, useEffect, useCallback, useRef } from 'react'

interface UseSlideshowOptions {
  photos: { id: number; filePath: string; fileName: string }[]
  intervalMs?: number
  onExit: () => void
}

interface UseSlideshowResult {
  currentPhoto: { id: number; filePath: string; fileName: string } | null
  currentIndex: number
  total: number
  isPaused: boolean
  next: () => void
  prev: () => void
  togglePause: () => void
}

function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

export function useSlideshow({
  photos,
  intervalMs = 5000,
  onExit
}: UseSlideshowOptions): UseSlideshowResult {
  const [shuffledPhotos, setShuffledPhotos] = useState<typeof photos>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const onExitRef = useRef(onExit)
  onExitRef.current = onExit

  useEffect(() => {
    if (photos.length > 0) {
      setShuffledPhotos(shuffleArray(photos))
      setCurrentIndex(0)
    }
  }, [photos])

  const next = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % shuffledPhotos.length)
  }, [shuffledPhotos.length])

  const prev = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + shuffledPhotos.length) % shuffledPhotos.length)
  }, [shuffledPhotos.length])

  const togglePause = useCallback(() => {
    setIsPaused((prev) => !prev)
  }, [])

  // Auto-advance timer
  useEffect(() => {
    if (isPaused || shuffledPhotos.length === 0) return
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % shuffledPhotos.length)
    }, intervalMs)
    return () => clearInterval(timer)
  }, [isPaused, shuffledPhotos.length, intervalMs])

  // Keyboard controls
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      switch (e.key) {
        case 'ArrowRight':
        case ' ':
          next()
          break
        case 'ArrowLeft':
          prev()
          break
        case 'Escape':
          onExitRef.current()
          break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [next, prev])

  return {
    currentPhoto: shuffledPhotos[currentIndex] ?? null,
    currentIndex,
    total: shuffledPhotos.length,
    isPaused,
    next,
    prev,
    togglePause
  }
}
