import { useState, useEffect, useCallback } from 'react'
import type { ScanProgress } from '../types/models'

interface UseScanResult {
  progress: ScanProgress | null
  isScanning: boolean
  startScan: (folderPath: string) => Promise<void>
}

export function useScan(): UseScanResult {
  const [progress, setProgress] = useState<ScanProgress | null>(null)
  const [isScanning, setIsScanning] = useState(false)

  useEffect(() => {
    const unsubProgress = window.api.onScanProgress((p) => {
      setProgress(p as ScanProgress)
    })
    const unsubComplete = window.api.onScanComplete(() => {
      setIsScanning(false)
      setProgress(null)
    })

    return () => {
      unsubProgress()
      unsubComplete()
    }
  }, [])

  const startScan = useCallback(async (folderPath: string) => {
    setIsScanning(true)
    setProgress({ phase: 'discovering', current: 0, total: 0, currentFile: '' })
    await window.api.startScan(folderPath)
  }, [])

  return { progress, isScanning, startScan }
}
