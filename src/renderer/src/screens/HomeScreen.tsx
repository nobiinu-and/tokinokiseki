import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { useScan } from '../hooks/useScan'
import { useCountUp } from '../hooks/useCountUp'
import { ScanProgress } from '../components/ScanProgress'
import type { Folder, DateCardSummary } from '../types/models'

interface Summary {
  bestCount: number
  eventCount: number
  tagCount: number
}

interface Suggestion {
  type: 'memory' | 'unorganized'
  title: string
  subtitle: string
  thumbnailPath?: string
  thumbnailAlt?: string
  navigateTo: string
}

function computeSuggestion(dateSummaries: DateCardSummary[]): Suggestion | null {
  if (dateSummaries.length === 0) return null

  const today = new Date()
  const todayMD = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const todayYear = today.getFullYear()

  // Memory suggestion: same month-day in a past year
  const memories = dateSummaries.filter((s) => {
    const md = s.date.slice(5) // "MM-DD"
    const year = parseInt(s.date.slice(0, 4), 10)
    return md === todayMD && year < todayYear
  })

  if (memories.length > 0) {
    // Pick the oldest memory
    const oldest = memories.reduce((a, b) => (a.date < b.date ? a : b))
    const yearsAgo = todayYear - parseInt(oldest.date.slice(0, 4), 10)
    return {
      type: 'memory',
      title: `${yearsAgo}年前の今日、こんな写真を撮っていました`,
      subtitle: `${oldest.photoCount}枚の写真`,
      thumbnailPath: oldest.thumbnailPath,
      thumbnailAlt: `${yearsAgo}年前の今日の写真`,
      navigateTo: `/timeline/${oldest.date}`
    }
  }

  // Fallback: unorganized suggestion (months with no best photos)
  const unorganizedByMonth: Record<string, { count: number; oldestDate: string }> = {}
  for (const s of dateSummaries) {
    if (s.hasBest) continue
    const month = s.date.slice(0, 7) // "YYYY-MM"
    if (!unorganizedByMonth[month]) {
      unorganizedByMonth[month] = { count: 0, oldestDate: s.date }
    }
    unorganizedByMonth[month].count += s.photoCount
    if (s.date < unorganizedByMonth[month].oldestDate) {
      unorganizedByMonth[month].oldestDate = s.date
    }
  }

  const months = Object.entries(unorganizedByMonth).sort(([a], [b]) => a.localeCompare(b))
  if (months.length === 0) return null

  const [monthKey] = months[0]
  const [yearStr, monthStr] = monthKey.split('-')
  return {
    type: 'unorganized',
    title: `${parseInt(yearStr, 10)}年${parseInt(monthStr, 10)}月の写真がまだ整理されていません`,
    subtitle: '眺めてみませんか？',
    navigateTo: '/timeline'
  }
}

export function HomeScreen(): JSX.Element {
  const navigate = useNavigate()
  const { timelineId, setIsScanning } = useApp()
  const { progress, isScanning, startScan } = useScan()
  const [folders, setFolders] = useState<Folder[]>([])
  const [summary, setSummary] = useState<Summary>({ bestCount: 0, eventCount: 0, tagCount: 0 })
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null)
  const [loadingData, setLoadingData] = useState(true)

  const animBest = useCountUp(summary.bestCount)
  const animEvent = useCountUp(summary.eventCount)
  const animTag = useCountUp(summary.tagCount)

  useEffect(() => {
    if (!timelineId) return
    setLoadingData(true)
    Promise.all([
      window.api.getTimelineFolders(timelineId),
      window.api.getBestPhotos(timelineId),
      window.api.getEvents(timelineId),
      window.api.getTagStats(timelineId),
      window.api.getDateSummary(timelineId)
    ]).then(([tlFolders, bestPhotos, events, tagStats, dateSummaries]) => {
      setFolders(tlFolders)
      setSummary({
        bestCount: bestPhotos.length,
        eventCount: events.length,
        tagCount: tagStats.length
      })
      setSuggestion(computeSuggestion(dateSummaries))
      setLoadingData(false)
    })
  }, [timelineId])

  useEffect(() => {
    setIsScanning(isScanning)
  }, [isScanning, setIsScanning])

  const refreshData = async (): Promise<void> => {
    if (!timelineId) return
    const [tlFolders, bestPhotos, events, tagStats, dateSummaries] = await Promise.all([
      window.api.getTimelineFolders(timelineId),
      window.api.getBestPhotos(timelineId),
      window.api.getEvents(timelineId),
      window.api.getTagStats(timelineId),
      window.api.getDateSummary(timelineId)
    ])
    setFolders(tlFolders)
    setSummary({
      bestCount: bestPhotos.length,
      eventCount: events.length,
      tagCount: tagStats.length
    })
    setSuggestion(computeSuggestion(dateSummaries))
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
              <span className="home-summary-value">{animBest}</span>
              <span className="home-summary-label">ベスト</span>
            </button>
            <button className="home-summary-card" onClick={() => navigate('/gallery')}>
              <span className="home-summary-value">{animEvent}</span>
              <span className="home-summary-label">できごと</span>
            </button>
            <button className="home-summary-card" onClick={() => navigate('/gallery')}>
              <span className="home-summary-value">{animTag}</span>
              <span className="home-summary-label">タグ</span>
            </button>
          </div>
        )}

        {folders.length > 0 && suggestion && (
          <button className="home-suggestion-card" onClick={() => navigate(suggestion.navigateTo)}>
            {suggestion.type === 'memory' && suggestion.thumbnailPath && (
              <img src={suggestion.thumbnailPath} className="home-suggestion-thumb" alt={suggestion.thumbnailAlt} />
            )}
            <div className="home-suggestion-text">
              <p className="home-suggestion-title">{suggestion.title}</p>
              <p className="home-suggestion-sub">{suggestion.subtitle}</p>
            </div>
          </button>
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
