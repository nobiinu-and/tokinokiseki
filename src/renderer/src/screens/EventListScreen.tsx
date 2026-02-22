import { useState, useCallback, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { GroupedVirtuoso, type GroupedVirtuosoHandle, type ListRange } from 'react-virtuoso'
import { useApp } from '../context/AppContext'
import { useEvents } from '../hooks/useEvents'
import { useTravelGroups } from '../hooks/useTravelGroups'
import { buildEventList, type EventListItem } from '../hooks/buildEventList'
import { EventCard } from '../components/EventCard'
import { TravelHeader } from '../components/TravelHeader'
import { TravelFooter } from '../components/TravelFooter'
import { TravelConfirmBar } from '../components/TravelConfirmBar'
import { TopBar } from '../components/TopBar'
import { AutoTagDialog } from '../components/AutoTagDialog'
import { JumpBar } from '../components/JumpBar'

// Persist scroll position across navigations (module-level, survives remounts)
let savedScrollIndex = 0

type RangeSelectState =
  | { mode: 'idle' }
  | { mode: 'select-start' }
  | { mode: 'select-end'; startDate: string }
  | { mode: 'confirm'; startDate: string; endDate: string }
  | { mode: 'edit'; groupId: number; startDate: string; endDate: string }

export function EventListScreen(): JSX.Element {
  const navigate = useNavigate()
  const { currentFolder } = useApp()
  const { events, groups: _rawGroups, groupCounts: _rawGroupCounts, loading, refresh: refreshEvents } = useEvents(
    currentFolder?.id ?? null
  )
  const {
    confirmedGroups,
    suggestions,
    dismissSuggestion,
    confirmGroup,
    createGroup,
    updateGroup,
    deleteGroup,
    refresh: refreshTravel
  } = useTravelGroups(currentFolder?.id ?? null, events)

  const [showAutoTag, setShowAutoTag] = useState(false)
  const [rangeSelect, setRangeSelect] = useState<RangeSelectState>({ mode: 'idle' })
  const [hoveredDate, setHoveredDate] = useState<string | null>(null)
  const virtuosoRef = useRef<GroupedVirtuosoHandle>(null)

  const { items, groups, groupCounts } = useMemo(
    () => buildEventList(events, confirmedGroups, suggestions),
    [events, confirmedGroups, suggestions]
  )

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

  // Confirmed dates set (for disabling during range select)
  const confirmedDates = useMemo(() => {
    const set = new Set<string>()
    for (const g of confirmedGroups) {
      for (const e of events) {
        if (e.date >= g.startDate && e.date <= g.endDate) {
          set.add(e.date)
        }
      }
    }
    return set
  }, [confirmedGroups, events])

  // Range select helpers
  const isInSelectRange = useCallback(
    (date: string): boolean => {
      if (rangeSelect.mode === 'select-end' && hoveredDate) {
        const start = rangeSelect.startDate
        const end = hoveredDate >= start ? hoveredDate : start
        return date >= start && date <= end
      }
      if (rangeSelect.mode === 'confirm' || rangeSelect.mode === 'edit') {
        return date >= rangeSelect.startDate && date <= rangeSelect.endDate
      }
      return false
    },
    [rangeSelect, hoveredDate]
  )

  const handleEventClick = useCallback(
    (date: string) => {
      if (rangeSelect.mode === 'select-start') {
        if (confirmedDates.has(date)) return
        setRangeSelect({ mode: 'select-end', startDate: date })
      } else if (rangeSelect.mode === 'select-end') {
        if (confirmedDates.has(date)) return
        const startDate = rangeSelect.startDate
        // Ensure correct order (events are sorted desc but user picks dates)
        const [s, e] = startDate <= date ? [startDate, date] : [date, startDate]
        setRangeSelect({ mode: 'confirm', startDate: s, endDate: e })
      } else {
        navigate(`/events/${date}`)
      }
    },
    [rangeSelect, confirmedDates, navigate]
  )

  const handleConfirmCreate = useCallback(
    async (title: string) => {
      if (!currentFolder) return
      if (rangeSelect.mode === 'confirm') {
        await createGroup(currentFolder.id, title, rangeSelect.startDate, rangeSelect.endDate)
      } else if (rangeSelect.mode === 'edit') {
        await updateGroup(rangeSelect.groupId, title, rangeSelect.startDate, rangeSelect.endDate)
      }
      setRangeSelect({ mode: 'idle' })
    },
    [currentFolder, rangeSelect, createGroup, updateGroup]
  )

  const handleSuggestionConfirm = useCallback(
    async (startDate: string, endDate: string, _autoTitle: string) => {
      if (!currentFolder) return
      const title = await window.api.getTravelTitleSuggestion(
        currentFolder.id,
        startDate,
        endDate
      )
      await confirmGroup(currentFolder.id, title, startDate, endDate)
    },
    [currentFolder, confirmGroup]
  )

  const handleTitleChange = useCallback(
    async (id: number, title: string) => {
      const group = confirmedGroups.find((g) => g.id === id)
      if (!group) return
      await updateGroup(id, title, group.startDate, group.endDate)
    },
    [confirmedGroups, updateGroup]
  )

  const handleMenuAction = useCallback(
    async (id: number, action: 'edit-range' | 'delete') => {
      if (action === 'delete') {
        await deleteGroup(id)
      } else if (action === 'edit-range') {
        const group = confirmedGroups.find((g) => g.id === id)
        if (group) {
          setRangeSelect({
            mode: 'edit',
            groupId: id,
            startDate: group.startDate,
            endDate: group.endDate
          })
        }
      }
    },
    [confirmedGroups, deleteGroup]
  )

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

  const isRangeSelecting =
    rangeSelect.mode === 'select-start' || rangeSelect.mode === 'select-end'

  return (
    <div className="screen event-list-screen">
      <TopBar
        title="イベント一覧"
        onBack={handleSettings}
        actions={
          <div className="topbar-actions-group">
            {rangeSelect.mode === 'idle' && (
              <button
                className="btn btn-secondary"
                onClick={() => setRangeSelect({ mode: 'select-start' })}
              >
                ＋ 旅行を作成
              </button>
            )}
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

      {rangeSelect.mode === 'select-start' && (
        <div className="travel-range-bar">
          <span className="travel-range-bar-icon">📌</span>
          <span className="travel-range-bar-text">旅行の最初の日を選んでください</span>
          <button
            className="btn btn-ghost"
            onClick={() => setRangeSelect({ mode: 'idle' })}
          >
            キャンセル
          </button>
        </div>
      )}

      {rangeSelect.mode === 'select-end' && (
        <div className="travel-range-bar">
          <span className="travel-range-bar-icon">📌</span>
          <span className="travel-range-bar-text">旅行の最後の日を選んでください</span>
          <button
            className="btn btn-ghost"
            onClick={() => setRangeSelect({ mode: 'idle' })}
          >
            キャンセル
          </button>
        </div>
      )}

      {(rangeSelect.mode === 'confirm' || rangeSelect.mode === 'edit') && currentFolder && (
        <TravelConfirmBar
          folderId={currentFolder.id}
          startDate={rangeSelect.startDate}
          endDate={rangeSelect.endDate}
          existingTitle={
            rangeSelect.mode === 'edit'
              ? confirmedGroups.find((g) => g.id === rangeSelect.groupId)?.title
              : undefined
          }
          onConfirm={handleConfirmCreate}
          onCancel={() => setRangeSelect({ mode: 'idle' })}
        />
      )}

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
          <GroupedVirtuoso
            ref={virtuosoRef}
            groupCounts={groupCounts}
            initialTopMostItemIndex={savedScrollIndex}
            rangeChanged={handleRangeChanged}
            groupContent={(index) => (
              <div className="event-list-section-header">{groups[index]?.label}</div>
            )}
            itemContent={(index) => {
              const item = items[index]
              if (!item) return null

              if (item.type === 'travel-header') {
                return (
                  <TravelHeader
                    group={item.group}
                    onConfirmSuggestion={() =>
                      handleSuggestionConfirm(
                        item.group.startDate,
                        item.group.endDate,
                        ''
                      )
                    }
                    onDismissSuggestion={() =>
                      dismissSuggestion(item.group.startDate, item.group.endDate)
                    }
                    onAdjustSuggestion={() =>
                      setRangeSelect({
                        mode: 'select-end',
                        startDate: item.group.startDate
                      })
                    }
                    onTitleChange={handleTitleChange}
                    onMenuAction={handleMenuAction}
                  />
                )
              }

              if (item.type === 'travel-footer') {
                return <TravelFooter />
              }

              // type === 'event'
              const prevItem = index > 0 ? items[index - 1] : null
              const nextItem = index < items.length - 1 ? items[index + 1] : null

              const isInTravel = item.travelGroupId !== undefined

              // consecutive group logic only for non-travel events
              const prevEvent =
                prevItem && prevItem.type === 'event' ? prevItem : null
              const nextEvent =
                nextItem && nextItem.type === 'event' ? nextItem : null

              const isGroupStart =
                !isInTravel &&
                item.consecutiveGroupId !== null &&
                (prevEvent === null ||
                  prevEvent.consecutiveGroupId !== item.consecutiveGroupId)
              const isGroupEnd =
                !isInTravel &&
                item.consecutiveGroupId !== null &&
                (nextEvent === null ||
                  nextEvent.consecutiveGroupId !== item.consecutiveGroupId)
              const isInGroup = !isInTravel && item.consecutiveGroupId !== null

              // Check travel group type for styling
              const travelGroup =
                isInTravel
                  ? confirmedGroups.find((g) => g.id === item.travelGroupId)
                  : null
              const isConfirmedTravel = !!travelGroup
              const isSuggestedTravel =
                !isConfirmedTravel &&
                (prevItem?.type === 'travel-header' ||
                  (prevItem?.type === 'event' && prevItem.travelGroupId === undefined &&
                    items.slice(0, index).reverse().find((i) => i.type === 'travel-header' || i.type === 'travel-footer')?.type === 'travel-header'))

              // Determine if this event's date is in a suggested group
              const inSuggestedGroup =
                !isConfirmedTravel &&
                suggestions.some(
                  (s) => item.date >= s.startDate && item.date <= s.endDate
                )

              const rangeSelected = isRangeSelecting && isInSelectRange(item.date)
              const rangeDisabled = isRangeSelecting && confirmedDates.has(item.date)

              const classNames = [
                'event-list-item',
                isInGroup ? 'event-group-member' : '',
                isGroupStart ? 'event-group-start' : '',
                isGroupEnd ? 'event-group-end' : '',
                isConfirmedTravel ? 'travel-group-confirmed' : '',
                inSuggestedGroup && !isConfirmedTravel ? 'travel-group-suggested' : '',
                rangeSelected ? 'travel-range-selected' : '',
                rangeDisabled ? 'travel-range-disabled' : ''
              ]
                .filter(Boolean)
                .join(' ')

              return (
                <div
                  className={classNames}
                  onMouseEnter={
                    rangeSelect.mode === 'select-end'
                      ? () => setHoveredDate(item.date)
                      : undefined
                  }
                >
                  <EventCard
                    date={item.date}
                    photoCount={item.photoCount}
                    thumbnailPath={item.thumbnailPath}
                    isEvent={item.isEvent}
                    hasBest={item.hasBest}
                    onClick={() => handleEventClick(item.date)}
                    onContextMenu={
                      rangeSelect.mode === 'idle' && !isInTravel
                        ? (e) => {
                            e.preventDefault()
                            setRangeSelect({
                              mode: 'select-end',
                              startDate: item.date
                            })
                          }
                        : undefined
                    }
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

      {showAutoTag && currentFolder && (
        <AutoTagDialog
          folderId={currentFolder.id}
          onClose={() => setShowAutoTag(false)}
          onComplete={() => {
            refreshEvents()
            refreshTravel()
          }}
        />
      )}
    </div>
  )
}
