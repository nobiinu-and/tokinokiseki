import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { useScan } from '../hooks/useScan'
import { ScanProgress } from '../components/ScanProgress'
import type { Folder } from '../types/models'

export function FolderSelectScreen(): JSX.Element {
  const navigate = useNavigate()
  const location = useLocation()
  const { setTimelineId, setIsScanning } = useApp()
  const { progress, isScanning, startScan } = useScan()
  const [timelineIdLocal, setTimelineIdLocal] = useState<number | null>(null)
  const [folders, setFolders] = useState<Folder[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      const timeline = await window.api.getDefaultTimeline()
      setTimelineIdLocal(timeline.id)
      const tlFolders = await window.api.getTimelineFolders(timeline.id)
      setFolders(tlFolders)
      setLoading(false)

      // Auto-navigate only on initial app load, not when user explicitly navigated back
      const cameFromBack = (location.state as { fromBack?: boolean })?.fromBack
      if (tlFolders.length > 0 && !cameFromBack) {
        setTimelineId(timeline.id)
        navigate('/timeline')
      }
    })()
  }, [])

  useEffect(() => {
    setIsScanning(isScanning)
  }, [isScanning, setIsScanning])

  const refreshFolders = async (): Promise<void> => {
    if (timelineIdLocal === null) return
    const tlFolders = await window.api.getTimelineFolders(timelineIdLocal)
    setFolders(tlFolders)
  }

  const handleAddFolder = async (): Promise<void> => {
    if (timelineIdLocal === null) return
    const folderPath = await window.api.selectFolder()
    if (!folderPath) return

    await window.api.addFolderToTimeline(timelineIdLocal, folderPath)
    await startScan(folderPath)
    await refreshFolders()
    setTimelineId(timelineIdLocal)
    navigate('/timeline')
  }

  const handleRescan = async (folder: Folder): Promise<void> => {
    if (timelineIdLocal === null) return
    await startScan(folder.path)
    setTimelineId(timelineIdLocal)
    navigate('/timeline')
  }

  const handleRemoveFolder = async (folderId: number): Promise<void> => {
    if (timelineIdLocal === null) return
    await window.api.removeFolderFromTimeline(timelineIdLocal, folderId)
    await refreshFolders()
  }

  const handleViewTimeline = (): void => {
    if (timelineIdLocal === null) return
    setTimelineId(timelineIdLocal)
    navigate('/timeline')
  }

  if (loading) {
    return (
      <div className="screen folder-select-screen">
        <div className="folder-select-center">
          <p>読み込み中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="screen folder-select-screen">
      <div className="folder-select-center">
        <div className="app-logo">
          <h1>ときのきせき</h1>
          <p className="app-subtitle">あなたの癒しのギャラリーへ、ようこそ</p>
        </div>

        {isScanning && progress ? (
          <ScanProgress progress={progress} />
        ) : (
          <>
            <button className="btn btn-primary btn-large" onClick={handleAddFolder}>
              あなたの思い出はどこにありますか？
            </button>

            {folders.length > 0 && (
              <>
                <div className="existing-folders">
                  <h3>登録済みフォルダ</h3>
                  {folders.map((folder) => (
                    <div key={folder.id} className="folder-item">
                      <span className="folder-path">{folder.path}</span>
                      <div className="folder-actions">
                        <button
                          className="btn btn-ghost"
                          onClick={() => handleRescan(folder)}
                        >
                          再スキャン
                        </button>
                        <button
                          className="btn btn-ghost"
                          onClick={() => handleRemoveFolder(folder.id)}
                        >
                          削除
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <button className="btn btn-accent btn-large" onClick={handleViewTimeline}>
                  タイムラインを見る
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
