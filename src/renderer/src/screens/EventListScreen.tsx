import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Virtuoso } from 'react-virtuoso'
import { useApp } from '../context/AppContext'
import { useEvents } from '../hooks/useEvents'
import { EventCard } from '../components/EventCard'
import { TopBar } from '../components/TopBar'
import { AutoTagDialog } from '../components/AutoTagDialog'

export function EventListScreen(): JSX.Element {
  const navigate = useNavigate()
  const { currentFolder } = useApp()
  const { events, loading } = useEvents(currentFolder?.id ?? null)
  const [showAutoTag, setShowAutoTag] = useState(false)

  if (!currentFolder) {
    navigate('/')
    return <></>
  }

  const handleSlideshow = (): void => {
    navigate('/slideshow')
  }

  const handleSettings = (): void => {
    navigate('/', { state: { fromBack: true } })
  }

  return (
    <div className="screen event-list-screen">
      <TopBar
        title="イベント一覧"
        onBack={handleSettings}
        actions={
          <div className="topbar-actions-group">
            <button className="btn btn-secondary" onClick={() => setShowAutoTag(true)}>
              タグ付け
            </button>
            <button className="btn btn-accent" onClick={handleSlideshow}>
              ▶ スライドショー
            </button>
          </div>
        }
      />

      {loading ? (
        <div className="screen-center">
          <p>読み込み中...</p>
        </div>
      ) : events.length === 0 ? (
        <div className="screen-center">
          <p>写真が見つかりませんでした</p>
          <button className="btn btn-primary" onClick={handleSettings}>
            フォルダを選択
          </button>
        </div>
      ) : (
        <div className="event-list-container">
          <Virtuoso
            data={events}
            itemContent={(index, event) => {
              const prevEvent = index > 0 ? events[index - 1] : null
              const nextEvent = index < events.length - 1 ? events[index + 1] : null

              const isGroupStart =
                event.consecutiveGroupId !== null &&
                (prevEvent === null ||
                  prevEvent.consecutiveGroupId !== event.consecutiveGroupId)
              const isGroupEnd =
                event.consecutiveGroupId !== null &&
                (nextEvent === null ||
                  nextEvent.consecutiveGroupId !== event.consecutiveGroupId)
              const isInGroup = event.consecutiveGroupId !== null

              return (
                <div
                  className={[
                    'event-list-item',
                    isInGroup ? 'event-group-member' : '',
                    isGroupStart ? 'event-group-start' : '',
                    isGroupEnd ? 'event-group-end' : ''
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <EventCard
                    date={event.date}
                    photoCount={event.photoCount}
                    thumbnailPath={event.thumbnailPath}
                    isEvent={event.isEvent}
                    hasBest={event.hasBest}
                    onClick={() => navigate(`/events/${event.date}`)}
                  />
                </div>
              )
            }}
          />
        </div>
      )}

      {showAutoTag && currentFolder && (
        <AutoTagDialog
          folderId={currentFolder.id}
          onClose={() => setShowAutoTag(false)}
          onComplete={() => {
            // Tags have been applied, no need to reload events
          }}
        />
      )}
    </div>
  )
}
