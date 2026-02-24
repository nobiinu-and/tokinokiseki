import { useState, useEffect, useRef } from 'react'

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

export function useCountUp(target: number, duration = 600): number {
  const [current, setCurrent] = useState(0)
  const rafRef = useRef<number>(0)
  const startTimeRef = useRef<number>(0)
  const startValueRef = useRef(0)

  useEffect(() => {
    if (target === 0) {
      setCurrent(0)
      return
    }

    startValueRef.current = 0
    startTimeRef.current = 0

    const animate = (timestamp: number): void => {
      if (!startTimeRef.current) startTimeRef.current = timestamp
      const elapsed = timestamp - startTimeRef.current
      const progress = Math.min(elapsed / duration, 1)
      const eased = easeOutCubic(progress)
      const value = Math.round(startValueRef.current + (target - startValueRef.current) * eased)
      setCurrent(value)

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate)
      }
    }

    rafRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [target, duration])

  return current
}
