import { useState, useCallback, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { GroupedVirtuoso, type GroupedVirtuosoHandle, type ListRange } from 'react-virtuoso'
import { useApp } from '../context/AppContext'
import { useTimeline } from '../hooks/useTimeline'
import { DateCard } from '../components/DateCard'
import { TopBar } from '../components/TopBar'
import { AutoTagDialog } from '../components/AutoTagDialog'
import { JumpBar } from '../components/JumpBar'

// Persist scroll position across navigations (module-level, survives remounts)
let savedScrollIndex = 0

export function TimelineScreen(): JSX.Element {
  const navigate = useNavigate()
  const { timelineId } = useApp()
  const { dateCards, groups, groupCounts, loading } = useTimeline(timelineId)
  const [showAutoTag, setShowAutoTag] = useState(false)
  const virtuosoRef = useRef<GroupedVirtuosoHandle>(null)

  const handleRangeChanged = useCallback((range: ListRange) => {
    savedScrollIndex = range.startIndex
  }, [])

  const jumpBarYears = useMemo(() => {
    const seen = new Set<number>()
    const years: { year: number; groupIndex: number }[] = []
    groups.forEach((g, i) => {
      if (!seen.has(g.year)) {
        seen.add(g.year)
        years.push({ year: g.year, groupIndex: i })
      }
    })
    return years
  }, [groups])

  const handleJump = useCallback((groupIndex: number) => {
    virtuosoRef.current?.scrollToIndex({
      groupIndex,
      align: 'start'
    })
  }, [])

  if (!timelineId) {
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
    <div className="screen timeline-screen">
      <TopBar
        title="タイムライン"
        onBack={handleSettings}
        actions={
          <div className="topbar-actions-group">
            <button className="btn btn-secondary" onClick={() => navigate('/tags')}>
              タグ検索
            </button>
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
      ) : dateCards.length === 0 ? (
        <div className="screen-center">
          <p>写真が見つかりませんでした</p>
          <button className="btn btn-primary" onClick={handleSettings}>
            フォルダを選択
          </button>
        </div>
      ) : (
        <div className="timeline-container">
          <GroupedVirtuoso
            ref={virtuosoRef}
            groupCounts={groupCounts}
            initialTopMostItemIndex={savedScrollIndex}
            rangeChanged={handleRangeChanged}
            groupContent={(index) => (
              <div className="timeline-section-header">
                {groups[index]?.label}
              </div>
            )}
            itemContent={(index) => {
              const card = dateCards[index]
              if (!card) return null

              const prevCard = index > 0 ? dateCards[index - 1] : null
              const nextCard = index < dateCards.length - 1 ? dateCards[index + 1] : null

              const isGroupStart =
                card.consecutiveGroupId !== null &&
                (prevCard === null ||
                  prevCard.consecutiveGroupId !== card.consecutiveGroupId)
              const isGroupEnd =
                card.consecutiveGroupId !== null &&
                (nextCard === null ||
                  nextCard.consecutiveGroupId !== card.consecutiveGroupId)
              const isInGroup = card.consecutiveGroupId !== null

              return (
                <div
                  className={[
                    'timeline-item',
                    isInGroup ? 'date-group-member' : '',
                    isGroupStart ? 'date-group-start' : '',
                    isGroupEnd ? 'date-group-end' : ''
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <DateCard
                    date={card.date}
                    photoCount={card.photoCount}
                    thumbnailPath={card.thumbnailPath}
                    isLargeCard={card.isLargeCard}
                    hasBest={card.hasBest}
                    onClick={() => navigate(`/timeline/${card.date}`)}
                  />
                </div>
              )
            }}
          />
          {jumpBarYears.length > 1 && (
            <JumpBar years={jumpBarYears} onJump={handleJump} />
          )}
        </div>
      )}

      {showAutoTag && timelineId && (
        <AutoTagDialog
          timelineId={timelineId}
          onClose={() => setShowAutoTag(false)}
          onComplete={() => {
            // Tags have been applied, no need to reload
          }}
        />
      )}
    </div>
  )
}
