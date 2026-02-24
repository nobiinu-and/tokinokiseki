import { useState, useEffect, useCallback } from 'react'
import type { DateCardSummary, EventConfirmed, EventSuggestion } from '../types/models'

export interface DateCardWithEvents extends DateCardSummary {
  isLargeCard: boolean
  events: EventConfirmed[]
  suggestions: EventSuggestion[]
}

export type TimelineItem =
  | { type: 'date-card'; card: DateCardWithEvents }
  | { type: 'suggestion-banner'; suggestion: EventSuggestion }

interface YearMonthGroup {
  label: string // "2024年8月"
  year: number
  count: number
}

interface UseTimelineResult {
  items: TimelineItem[]
  groups: YearMonthGroup[]
  groupCounts: number[]
  loading: boolean
  refresh: () => void
  events: EventConfirmed[]
  dismissedSuggestions: Set<string>
  dismissSuggestion: (startDate: string, endDate: string) => void
}

function isDateInEvent(date: string, event: EventConfirmed): boolean {
  if (event.type === 'dates') {
    return event.dates?.includes(date) ?? false
  }
  return date >= event.startDate && date <= event.endDate
}

function suggestionKey(s: EventSuggestion): string {
  return `${s.startDate}:${s.endDate}`
}

function computeYearMonthGroups(items: TimelineItem[]): YearMonthGroup[] {
  if (items.length === 0) return []

  const groups: YearMonthGroup[] = []
  let currentYear = -1
  let currentMonth = -1
  let currentCount = 0

  for (const item of items) {
    const date =
      item.type === 'date-card' ? item.card.date : item.suggestion.endDate

    const d = new Date(date + 'T00:00:00')
    const y = d.getFullYear()
    const m = d.getMonth() + 1

    if (y !== currentYear || m !== currentMonth) {
      if (currentCount > 0) {
        groups[groups.length - 1].count = currentCount
      }
      currentYear = y
      currentMonth = m
      currentCount = 1
      groups.push({ label: `${y}年${m}月`, year: y, count: 0 })
    } else {
      currentCount++
    }
  }

  if (groups.length > 0 && currentCount > 0) {
    groups[groups.length - 1].count = currentCount
  }

  return groups
}

export function useTimeline(timelineId: number | null): UseTimelineResult {
  const [items, setItems] = useState<TimelineItem[]>([])
  const [groups, setGroups] = useState<YearMonthGroup[]>([])
  const [events, setEvents] = useState<EventConfirmed[]>([])
  const [loading, setLoading] = useState(false)
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(new Set())

  const dismissSuggestion = useCallback((startDate: string, endDate: string) => {
    setDismissedSuggestions((prev) => {
      const next = new Set(prev)
      next.add(`${startDate}:${endDate}`)
      return next
    })
  }, [])

  const refresh = useCallback(() => {
    if (timelineId === null) return
    setLoading(true)

    Promise.all([
      window.api.getDateSummary(timelineId),
      window.api.getEvents(timelineId),
      window.api.getEventSuggestions(timelineId)
    ])
      .then(([summaries, confirmedEvents, suggestions]) => {
        setEvents(confirmedEvents)

        // Build DateCardWithEvents
        const dateCards: DateCardWithEvents[] = summaries.map((s) => ({
          ...s,
          isLargeCard: s.photoCount >= 3,
          events: confirmedEvents.filter((e) => isDateInEvent(s.date, e)),
          suggestions: suggestions.filter(
            (sg) =>
              s.date >= sg.startDate &&
              s.date <= sg.endDate &&
              !dismissedSuggestions.has(suggestionKey(sg))
          )
        }))

        // Filter non-dismissed suggestions
        const activeSuggestions = suggestions.filter(
          (sg) => !dismissedSuggestions.has(suggestionKey(sg))
        )

        // Build timeline items: date cards in descending order, with suggestion banners inserted
        // For each suggestion, insert banner before the first date card in its range
        const suggestionInsertDates = new Map<string, EventSuggestion>()
        for (const sg of activeSuggestions) {
          // Find the first date card (descending order = most recent first) that falls in this suggestion's range
          for (const card of dateCards) {
            if (card.date >= sg.startDate && card.date <= sg.endDate) {
              // Insert banner before this date (the most recent date in the range)
              const key = card.date
              // Only store if not already set (first suggestion for this date wins)
              if (!suggestionInsertDates.has(key)) {
                suggestionInsertDates.set(key, sg)
              }
              break
            }
          }
        }

        const timelineItems: TimelineItem[] = []
        for (const card of dateCards) {
          const sg = suggestionInsertDates.get(card.date)
          if (sg) {
            timelineItems.push({ type: 'suggestion-banner', suggestion: sg })
            suggestionInsertDates.delete(card.date)
          }
          timelineItems.push({ type: 'date-card', card })
        }

        setItems(timelineItems)
        setGroups(computeYearMonthGroups(timelineItems))
      })
      .catch((err) => {
        console.error('Failed to load timeline:', err)
      })
      .finally(() => setLoading(false))
  }, [timelineId, dismissedSuggestions])

  useEffect(() => {
    refresh()
  }, [refresh])

  return {
    items,
    groups,
    groupCounts: groups.map((g) => g.count),
    loading,
    refresh,
    events,
    dismissedSuggestions,
    dismissSuggestion
  }
}
