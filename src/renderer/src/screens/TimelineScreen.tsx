import { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { GroupedVirtuoso, type GroupedVirtuosoHandle, type ListRange } from 'react-virtuoso'
import { useApp } from '../context/AppContext'
import { useTimeline, isDateInEvent, computeYearMonthGroups } from '../hooks/useTimeline'
import type { TimelineItem } from '../hooks/useTimeline'
import type { EventConfirmed, EventSuggestion } from '../types/models'
import { DateCard } from '../components/DateCard'
import { TopBar } from '../components/TopBar'
import { AutoTagDialog } from '../components/AutoTagDialog'
import { JumpBar } from '../components/JumpBar'
import { SuggestionBanner } from '../components/SuggestionBanner'
import { EventTitleDialog } from '../components/EventTitleDialog'
import { RangeSelectBar } from '../components/RangeSelectBar'
import { DatesSelectBar } from '../components/DatesSelectBar'
import { AddDatesBar } from '../components/AddDatesBar'
import { EventManager } from '../components/EventManager'

// Persist scroll position across navigations (module-level, survives remounts)
let savedScrollIndex = 0
let savedEventFilter: EventConfirmed | null = null

function formatFilterRange(startDate: string, endDate: string): string {
  const s = new Date(startDate + 'T00:00:00')
  const e = new Date(endDate + 'T00:00:00')
  return `${s.getMonth() + 1}/${s.getDate()}〜${e.getMonth() + 1}/${e.getDate()}`
}

type EventSelectState =
  | null
  | { mode: 'range'; step: 'selecting'; date1?: string }
  | { mode: 'range'; step: 'title'; startDate: string; endDate: string }
  | { mode: 'dates'; step: 'selecting'; selectedDates: string[] }
  | { mode: 'dates'; step: 'title'; dates: string[] }
  | { mode: 'add-dates'; eventId: number; eventTitle: string; selectedDates: string[] }

export function TimelineScreen(): JSX.Element {
  const navigate = useNavigate()
  const { timelineId } = useApp()
  const { items, groups, groupCounts, loading, refresh, events, dismissSuggestion } =
    useTimeline(timelineId)
  const [showAutoTag, setShowAutoTag] = useState(false)
  const [showEventManager, setShowEventManager] = useState(false)
  const [eventSelect, setEventSelect] = useState<EventSelectState>(null)
  const [showCreateMenu, setShowCreateMenu] = useState(false)
  const [eventFilter, setEventFilter] = useState<EventConfirmed | null>(savedEventFilter)
  const createMenuRef = useRef<HTMLDivElement>(null)
  const virtuosoRef = useRef<GroupedVirtuosoHandle>(null)

  const setFilter = useCallback((event: EventConfirmed | null) => {
    savedEventFilter = event
    setEventFilter(event)
  }, [])

  // Close dropdown on outside click
  useEffect(() => {
    if (!showCreateMenu) return
    const handleClick = (e: MouseEvent): void => {
      if (createMenuRef.current && !createMenuRef.current.contains(e.target as Node)) {
        setShowCreateMenu(false)
      }
    }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [showCreateMenu])

  const handleRangeChanged = useCallback((range: ListRange) => {
    savedScrollIndex = range.startIndex
  }, [])

  // Event filter: filter items to only show dates belonging to the selected event
  const filteredItems = useMemo(() => {
    if (!eventFilter) return items
    return items.filter((item) => {
      if (item.type === 'suggestion-banner') return false
      return isDateInEvent(item.card.date, eventFilter)
    })
  }, [items, eventFilter])

  const filteredGroups = useMemo(
    () => computeYearMonthGroups(filteredItems),
    [filteredItems]
  )

  const filteredGroupCounts = useMemo(
    () => filteredGroups.map((g) => g.count),
    [filteredGroups]
  )

  // Event filter bar info
  const filterInfo = useMemo(() => {
    if (!eventFilter) return null
    const dateCards = filteredItems.filter((i) => i.type === 'date-card')
    const totalPhotos = dateCards.reduce(
      (sum, i) => sum + (i.type === 'date-card' ? i.card.photoCount : 0),
      0
    )
    return { dayCount: dateCards.length, totalPhotos }
  }, [eventFilter, filteredItems])

  const jumpBarYears = useMemo(() => {
    const source = eventFilter ? filteredGroups : groups
    const seen = new Set<number>()
    const years: { year: number; groupIndex: number }[] = []
    source.forEach((g, i) => {
      if (!seen.has(g.year)) {
        seen.add(g.year)
        years.push({ year: g.year, groupIndex: i })
      }
    })
    return years
  }, [groups, eventFilter, filteredGroups])

  const handleJump = useCallback((groupIndex: number) => {
    virtuosoRef.current?.scrollToIndex({
      groupIndex,
      align: 'start'
    })
  }, [])

  // Selection helpers
  const isDateSelected = useCallback(
    (date: string): boolean => {
      if (!eventSelect) return false
      if (eventSelect.mode === 'range' && eventSelect.step === 'selecting') {
        return eventSelect.date1 === date
      }
      if (eventSelect.mode === 'dates' && eventSelect.step === 'selecting') {
        return eventSelect.selectedDates.includes(date)
      }
      if (eventSelect.mode === 'add-dates') {
        return eventSelect.selectedDates.includes(date)
      }
      return false
    },
    [eventSelect]
  )

  const isDateInSelectedRange = useCallback(
    (date: string): boolean => {
      if (!eventSelect) return false
      if (eventSelect.mode === 'range' && eventSelect.step === 'title') {
        return date >= eventSelect.startDate && date <= eventSelect.endDate
      }
      return false
    },
    [eventSelect]
  )

  const handleDateCardClick = useCallback(
    (date: string): void => {
      if (!eventSelect) {
        navigate(`/timeline/${date}`)
        return
      }

      if (eventSelect.mode === 'range' && eventSelect.step === 'selecting') {
        if (!eventSelect.date1) {
          setEventSelect({ mode: 'range', step: 'selecting', date1: date })
        } else {
          const dates = [eventSelect.date1, date].sort()
          setEventSelect({ mode: 'range', step: 'title', startDate: dates[0], endDate: dates[1] })
        }
        return
      }

      if (eventSelect.mode === 'dates' && eventSelect.step === 'selecting') {
        setEventSelect((prev) => {
          if (!prev || prev.mode !== 'dates' || prev.step !== 'selecting') return prev
          const existing = prev.selectedDates
          const newDates = existing.includes(date)
            ? existing.filter((d) => d !== date)
            : [...existing, date]
          return { mode: 'dates', step: 'selecting', selectedDates: newDates }
        })
        return
      }

      if (eventSelect.mode === 'add-dates') {
        setEventSelect((prev) => {
          if (!prev || prev.mode !== 'add-dates') return prev
          const existing = prev.selectedDates
          const newDates = existing.includes(date)
            ? existing.filter((d) => d !== date)
            : [...existing, date]
          return { ...prev, selectedDates: newDates }
        })
        return
      }
    },
    [eventSelect, navigate]
  )

  // Suggestion handlers
  const handleSuggestionAccept = useCallback(
    (suggestion: EventSuggestion): void => {
      if (!timelineId) return
      setEventSelect({
        mode: 'range',
        step: 'title',
        startDate: suggestion.startDate,
        endDate: suggestion.endDate
      })
    },
    [timelineId]
  )

  const handleSuggestionDismiss = useCallback(
    (suggestion: EventSuggestion): void => {
      dismissSuggestion(suggestion.startDate, suggestion.endDate)
    },
    [dismissSuggestion]
  )

  const handleSuggestionAdjust = useCallback(
    (suggestion: EventSuggestion): void => {
      setEventSelect({ mode: 'range', step: 'selecting', date1: suggestion.startDate })
    },
    []
  )

  // Dates select done → go to title
  const handleDatesSelectDone = useCallback(() => {
    if (!eventSelect || eventSelect.mode !== 'dates' || eventSelect.step !== 'selecting') return
    const sorted = [...eventSelect.selectedDates].sort()
    setEventSelect({ mode: 'dates', step: 'title', dates: sorted })
  }, [eventSelect])

  // Event creation
  const handleCreateEvent = useCallback(
    (title: string): void => {
      if (!timelineId || !eventSelect) return

      const cleanup = (): void => {
        setEventSelect(null)
        refresh()
      }
      const onError = (err: unknown): void => {
        console.error('Failed to create event:', err)
        setEventSelect(null)
      }

      if (eventSelect.mode === 'range' && eventSelect.step === 'title') {
        window.api
          .createEvent(timelineId, title, eventSelect.startDate, eventSelect.endDate, 'range')
          .then(cleanup)
          .catch(onError)
        return
      }

      if (eventSelect.mode === 'dates' && eventSelect.step === 'title') {
        const sorted = eventSelect.dates
        window.api
          .createEvent(timelineId, title, sorted[0], sorted[sorted.length - 1], 'dates', sorted)
          .then(cleanup)
          .catch(onError)
        return
      }
    },
    [timelineId, eventSelect, refresh]
  )

  // Add dates confirm
  const handleAddDatesConfirm = useCallback(() => {
    if (!eventSelect || eventSelect.mode !== 'add-dates') return
    const { eventId, selectedDates } = eventSelect
    window.api.addDatesToEvent(eventId, selectedDates)
      .then(() => {
        setEventSelect(null)
        refresh()
      })
      .catch((err) => {
        console.error('Failed to add dates:', err)
        setEventSelect(null)
      })
  }, [eventSelect, refresh])

  // Event management
  const handleDeleteEvent = useCallback(
    (eventId: number): void => {
      window.api.deleteEvent(eventId).then(() => refresh()).catch(console.error)
    },
    [refresh]
  )

  const handleUpdateEvent = useCallback(
    (eventId: number, title: string): void => {
      window.api.updateEvent(eventId, title).then(() => refresh()).catch(console.error)
    },
    [refresh]
  )

  const handleRemoveDate = useCallback(
    (eventId: number, date: string): void => {
      window.api.removeDateFromEvent(eventId, date).then(() => refresh()).catch(console.error)
    },
    [refresh]
  )

  const handleStartAddDates = useCallback(
    (eventId: number, eventTitle: string): void => {
      setShowEventManager(false)
      setEventSelect({ mode: 'add-dates', eventId, eventTitle, selectedDates: [] })
    },
    []
  )

  // Event filter: click event label to filter timeline
  const handleEventClick = useCallback(
    (event: EventConfirmed) => {
      setFilter(event)
      setShowEventManager(false)
    },
    [setFilter]
  )

  if (!timelineId) {
    return (
      <div className="screen screen-center">
        <p>タイムラインが見つかりません</p>
      </div>
    )
  }

  const handleSlideshow = (): void => {
    navigate('/slideshow')
  }

  const activeItems = eventFilter ? filteredItems : items
  const activeGroups = eventFilter ? filteredGroups : groups
  const activeGroupCounts = eventFilter ? filteredGroupCounts : groupCounts

  const renderItem = (index: number): JSX.Element | null => {
    const item: TimelineItem | undefined = activeItems[index]
    if (!item) return null

    if (item.type === 'suggestion-banner') {
      return (
        <div className="timeline-item">
          <SuggestionBanner
            suggestion={item.suggestion}
            onAccept={handleSuggestionAccept}
            onDismiss={handleSuggestionDismiss}
            onAdjust={handleSuggestionAdjust}
          />
        </div>
      )
    }

    const card = item.card
    return (
      <div className="timeline-item">
        <DateCard
          date={card.date}
          photoCount={card.photoCount}
          thumbnailPath={card.thumbnailPath}
          isLargeCard={card.isLargeCard}
          hasBest={card.hasBest}
          events={card.events}
          isSelected={isDateSelected(card.date)}
          isInRange={isDateInSelectedRange(card.date)}
          onClick={() => handleDateCardClick(card.date)}
          onEventClick={!eventFilter ? handleEventClick : undefined}
        />
      </div>
    )
  }

  return (
    <div className="screen timeline-screen">
      <TopBar
        title={eventFilter ? eventFilter.title : 'タイムライン'}
        onBack={eventFilter ? () => setFilter(null) : undefined}
        actions={
          eventFilter ? (
            <div className="topbar-actions-group">
              <button className="btn btn-secondary" onClick={() => setFilter(null)}>
                ✕ フィルタ解除
              </button>
            </div>
          ) : (
            <div className="topbar-actions-group">
              {events.length > 0 && (
                <button
                  className="btn btn-secondary"
                  onClick={() => setShowEventManager(true)}
                >
                  できごと
                </button>
              )}
              <div className="event-create-dropdown" ref={createMenuRef}>
                <button
                  className="btn btn-secondary"
                  onClick={() => setShowCreateMenu((v) => !v)}
                  disabled={eventSelect !== null}
                >
                  + できごと ▾
                </button>
                {showCreateMenu && (
                  <div className="event-create-menu">
                    <button
                      onClick={() => {
                        setShowCreateMenu(false)
                        setEventSelect({ mode: 'range', step: 'selecting' })
                      }}
                    >
                      期間（旅行、帰省）
                    </button>
                    <button
                      onClick={() => {
                        setShowCreateMenu(false)
                        setEventSelect({ mode: 'dates', step: 'selecting', selectedDates: [] })
                      }}
                    >
                      日付リスト（制作、DIY）
                    </button>
                  </div>
                )}
              </div>
              <button className="btn btn-secondary" onClick={() => setShowAutoTag(true)}>
                タグ付け
              </button>
              <button className="btn btn-accent" onClick={handleSlideshow}>
                ▶ スライドショー
              </button>
            </div>
          )
        }
      />

      {eventSelect && eventSelect.mode === 'range' && eventSelect.step === 'selecting' && (
        <RangeSelectBar
          date1={eventSelect.date1}
          onCancel={() => setEventSelect(null)}
        />
      )}

      {eventSelect && eventSelect.mode === 'dates' && eventSelect.step === 'selecting' && (
        <DatesSelectBar
          selectedCount={eventSelect.selectedDates.length}
          onDone={handleDatesSelectDone}
          onCancel={() => setEventSelect(null)}
        />
      )}

      {eventSelect && eventSelect.mode === 'add-dates' && (
        <AddDatesBar
          eventTitle={eventSelect.eventTitle}
          selectedCount={eventSelect.selectedDates.length}
          onConfirm={handleAddDatesConfirm}
          onCancel={() => setEventSelect(null)}
        />
      )}

      {eventFilter && filterInfo && (
        <div className="event-filter-bar">
          {formatFilterRange(eventFilter.startDate, eventFilter.endDate)}
          {' ・ '}
          {filterInfo.dayCount}日間
          {' ・ '}
          {filterInfo.totalPhotos}枚
        </div>
      )}

      {loading ? (
        <div className="screen-center">
          <p>読み込み中...</p>
        </div>
      ) : activeItems.length === 0 ? (
        <div className="screen-center">
          <p>まだ写真がありません</p>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            ホーム画面からフォルダを追加して、思い出を読み込みましょう
          </p>
        </div>
      ) : (
        <div className="timeline-container">
          <GroupedVirtuoso
            ref={virtuosoRef}
            groupCounts={activeGroupCounts}
            initialTopMostItemIndex={eventFilter ? 0 : savedScrollIndex}
            rangeChanged={handleRangeChanged}
            groupContent={(index) => (
              <div className="timeline-section-header">{activeGroups[index]?.label}</div>
            )}
            itemContent={renderItem}
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
          onComplete={() => {}}
        />
      )}

      {eventSelect && eventSelect.mode === 'range' && eventSelect.step === 'title' && timelineId && (
        <EventTitleDialog
          timelineId={timelineId}
          mode="range"
          startDate={eventSelect.startDate}
          endDate={eventSelect.endDate}
          onConfirm={handleCreateEvent}
          onCancel={() => setEventSelect(null)}
        />
      )}

      {eventSelect && eventSelect.mode === 'dates' && eventSelect.step === 'title' && timelineId && (
        <EventTitleDialog
          timelineId={timelineId}
          mode="dates"
          dates={eventSelect.dates}
          onConfirm={handleCreateEvent}
          onCancel={() => setEventSelect(null)}
        />
      )}

      {showEventManager && (
        <EventManager
          events={events}
          onClose={() => setShowEventManager(false)}
          onDelete={handleDeleteEvent}
          onUpdate={handleUpdateEvent}
          onRemoveDate={handleRemoveDate}
          onStartAddDates={handleStartAddDates}
          onEventClick={handleEventClick}
        />
      )}
    </div>
  )
}
