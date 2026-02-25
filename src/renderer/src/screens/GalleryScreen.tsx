import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import type { EventConfirmed } from '../types/models'

interface TagStat {
  name: string
  count: number
}

function formatEventRange(startDate: string, endDate: string): string {
  const s = new Date(startDate + 'T00:00:00')
  const e = new Date(endDate + 'T00:00:00')
  const sStr = `${s.getFullYear()}/${s.getMonth() + 1}/${s.getDate()}`
  if (startDate === endDate) return sStr
  const eStr =
    s.getFullYear() === e.getFullYear()
      ? `${e.getMonth() + 1}/${e.getDate()}`
      : `${e.getFullYear()}/${e.getMonth() + 1}/${e.getDate()}`
  return `${sStr} 〜 ${eStr}`
}

interface EventStats {
  photoCount: number
  bestCount: number
  thumbnailPath: string | null
}

export function GalleryScreen(): JSX.Element {
  const navigate = useNavigate()
  const { timelineId } = useApp()
  const [events, setEvents] = useState<EventConfirmed[]>([])
  const [eventStats, setEventStats] = useState<Record<number, EventStats>>({})
  const [tagStats, setTagStats] = useState<TagStat[]>([])
  const [bestCount, setBestCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!timelineId) return
    setLoading(true)
    Promise.all([
      window.api.getEvents(timelineId),
      window.api.getTagStats(timelineId),
      window.api.getBestPhotos(timelineId),
      window.api.getEventStats(timelineId)
    ]).then(([evts, tags, bestPhotos, stats]) => {
      setEvents(evts)
      setTagStats(tags)
      setBestCount(bestPhotos.length)
      setEventStats(stats)
      setLoading(false)
    }).catch((err) => {
      console.error('Failed to load gallery data:', err)
      setLoading(false)
    })
  }, [timelineId])

  if (!timelineId) {
    return (
      <div className="screen screen-center">
        <p>タイムラインが見つかりません</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="screen screen-center">
        <p>読み込み中...</p>
      </div>
    )
  }

  const isEmpty = events.length === 0 && tagStats.length === 0 && bestCount === 0

  return (
    <div className="screen gallery-screen">
      <div className="gallery-content">
        {isEmpty ? (
          <div className="screen-center">
            <p>まだギャラリーは空っぽです</p>
            <p className="text-hint">
              タイムラインを眺めて、気になった写真にベストをつけてみましょう
            </p>
            <button
              className="btn btn-secondary"
              onClick={() => navigate('/timeline')}
            >
              タイムラインへ
            </button>
          </div>
        ) : (
          <>
            {/* ベストコレクション */}
            {bestCount > 0 && (
              <div className="gallery-section">
                <h2 className="gallery-section-title">ベストコレクション</h2>
                <button
                  className="gallery-best-card"
                  onClick={() => navigate('/gallery/best')}
                >
                  <span className="gallery-best-star">★</span>
                  <span className="gallery-best-info">
                    <span className="gallery-best-count">{bestCount}枚</span>
                    <span className="gallery-best-label">のベスト写真</span>
                  </span>
                </button>
              </div>
            )}

            {/* できごと */}
            {events.length > 0 && (
              <div className="gallery-section">
                <h2 className="gallery-section-title">できごと</h2>
                <div className="gallery-event-list">
                  {events.map((event) => {
                    const stats = eventStats[event.id]
                    return (
                      <button
                        key={event.id}
                        className="gallery-event-card"
                        onClick={() => navigate(`/gallery/event/${event.id}`)}
                      >
                        {stats?.thumbnailPath ? (
                          <img
                            className="gallery-event-thumb"
                            src={stats.thumbnailPath}
                            alt=""
                          />
                        ) : (
                          <span className="gallery-event-thumb-placeholder">📷</span>
                        )}
                        <div className="gallery-event-card-main">
                          <span className="gallery-event-title">{event.title}</span>
                          <span className="gallery-event-range">
                            {formatEventRange(event.startDate, event.endDate)}
                            {' '}
                            <span className="event-type-badge">
                              {event.type === 'range' ? '期間' : '日付リスト'}
                            </span>
                          </span>
                          {stats && (
                            <span className="gallery-event-stats">
                              {stats.photoCount}枚{stats.bestCount > 0 && ` ・ベスト${stats.bestCount}枚`}
                            </span>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* タグ */}
            {tagStats.length > 0 && (
              <div className="gallery-section">
                <h2 className="gallery-section-title">タグ</h2>
                <div className="tag-chips">
                  {tagStats.map((tag) => (
                    <button
                      key={tag.name}
                      className="tag-chip"
                      onClick={() => navigate(`/gallery/tag/${encodeURIComponent(tag.name)}`)}
                    >
                      {tag.name} <span className="tag-chip-count">{tag.count}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
