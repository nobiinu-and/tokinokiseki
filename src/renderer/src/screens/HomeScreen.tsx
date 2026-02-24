import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { useScan } from '../hooks/useScan'
import { ScanProgress } from '../components/ScanProgress'
import type { Folder } from '../types/models'

interface Summary {
  bestCount: number
  eventCount: number
  tagCount: number
}

export function HomeScreen(): JSX.Element {
  const navigate = useNavigate()
  const { timelineId, setIsScanning } = useApp()
  const { progress, isScanning, startScan } = useScan()
  const [folders, setFolders] = useState<Folder[]>([])
  const [summary, setSummary] = useState<Summary>({ bestCount: 0, eventCount: 0, tagCount: 0 })
  const [loadingData, setLoadingData] = useState(true)

  useEffect(() => {
    if (!timelineId) return
    setLoadingData(true)
    Promise.all([
      window.api.getTimelineFolders(timelineId),
      window.api.getBestPhotos(timelineId),
      window.api.getEvents(timelineId),
      window.api.getTagStats(timelineId)
    ]).then(([tlFolders, bestPhotos, events, tagStats]) => {
      setFolders(tlFolders)
      setSummary({
        bestCount: bestPhotos.length,
        eventCount: events.length,
        tagCount: tagStats.length
      })
      setLoadingData(false)
    })
  }, [timelineId])

  useEffect(() => {
    setIsScanning(isScanning)
  }, [isScanning, setIsScanning])

  const refreshData = async (): Promise<void> => {
    if (!timelineId) return
    const [tlFolders, bestPhotos, events, tagStats] = await Promise.all([
      window.api.getTimelineFolders(timelineId),
      window.api.getBestPhotos(timelineId),
      window.api.getEvents(timelineId),
      window.api.getTagStats(timelineId)
    ])
    setFolders(tlFolders)
    setSummary({
      bestCount: bestPhotos.length,
      eventCount: events.length,
      tagCount: tagStats.length
    })
  }

  const handleAddFolder = async (): Promise<void> => {
    if (!timelineId) return
    const folderPath = await window.api.selectFolder()
    if (!folderPath) return

    await window.api.addFolderToTimeline(timelineId, folderPath)
    await startScan(folderPath)
    await refreshData()
  }

  const handleRescan = async (folder: Folder): Promise<void> => {
    await startScan(folder.path)
    await refreshData()
  }

  const handleRemoveFolder = async (folderId: number): Promise<void> => {
    if (!timelineId) return
    await window.api.removeFolderFromTimeline(timelineId, folderId)
    await refreshData()
  }

  if (loadingData) {
    return (
      <div className="screen screen-center">
        <p>読み込み中...</p>
      </div>
    )
  }

  return (
    <div className="screen home-screen">
      <div className="home-content">
        <div className="app-logo">
          <h1>ときのきせき</h1>
          <p className="app-subtitle">あなたの癒しのギャラリーへ、ようこそ</p>
        </div>

        {folders.length > 0 && (
          <div className="home-summary-cards">
            <button className="home-summary-card" onClick={() => navigate('/gallery/best')}>
              <span className="home-summary-value">{summary.bestCount}</span>
              <span className="home-summary-label">ベスト</span>
            </button>
            <button className="home-summary-card" onClick={() => navigate('/gallery')}>
              <span className="home-summary-value">{summary.eventCount}</span>
              <span className="home-summary-label">できごと</span>
            </button>
            <button className="home-summary-card" onClick={() => navigate('/gallery')}>
              <span className="home-summary-value">{summary.tagCount}</span>
              <span className="home-summary-label">タグ</span>
            </button>
          </div>
        )}

        {isScanning && progress && <ScanProgress progress={progress} />}

        {!isScanning && (
          <>
            <button className="btn btn-primary btn-large" onClick={handleAddFolder}>
              {folders.length === 0
                ? 'あなたの思い出はどこにありますか？'
                : 'フォルダを追加'}
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
                <button
                  className="btn btn-accent btn-large"
                  onClick={() => navigate('/timeline')}
                >
                  タイムラインを開く
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
