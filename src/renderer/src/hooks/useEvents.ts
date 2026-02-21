import { useState, useEffect, useCallback } from 'react'
import type { EventSummary } from '../types/models'

interface EventWithGroup extends EventSummary {
  isEvent: boolean
  consecutiveGroupId: number | null
}

interface YearMonthGroup {
  label: string // "2024年8月"
  year: number
  count: number
}

interface UseEventsResult {
  events: EventWithGroup[]
  groups: YearMonthGroup[]
  groupCounts: number[]
  loading: boolean
  refresh: () => void
}

function computeConsecutiveGroups(summaries: EventSummary[]): EventWithGroup[] {
  if (summaries.length === 0) return []

  const events: EventWithGroup[] = summaries.map((s) => ({
    ...s,
    isEvent: s.photoCount >= 3,
    consecutiveGroupId: null
  }))

  // Sorted descending by date already from DB
  let groupId = 0

  for (let i = 0; i < events.length; i++) {
    if (!events[i].isEvent) continue

    if (events[i].consecutiveGroupId === null) {
      events[i].consecutiveGroupId = groupId

      // Look at subsequent items (next in list = earlier date)
      for (let j = i + 1; j < events.length; j++) {
        if (!events[j].isEvent) {
          // Check if this non-event is just a 1-day gap between events
          if (j + 1 < events.length && events[j + 1].isEvent) {
            const dateBefore = new Date(events[i].date)
            const dateAfter = new Date(events[j + 1].date)
            const daysDiff = Math.abs(
              (dateBefore.getTime() - dateAfter.getTime()) / (1000 * 60 * 60 * 24)
            )
            if (daysDiff <= 3) {
              // Include the gap day in the group
              events[j].consecutiveGroupId = groupId
              continue
            }
          }
          break
        }

        const prevDate = new Date(events[j - 1].date)
        const currDate = new Date(events[j].date)
        const daysDiff = Math.abs(
          (prevDate.getTime() - currDate.getTime()) / (1000 * 60 * 60 * 24)
        )

        if (daysDiff <= 2) {
          events[j].consecutiveGroupId = groupId
        } else {
          break
        }
      }
      groupId++
    }
  }

  return events
}

function computeYearMonthGroups(events: EventWithGroup[]): YearMonthGroup[] {
  if (events.length === 0) return []

  const groups: YearMonthGroup[] = []
  let currentYear = -1
  let currentMonth = -1
  let currentCount = 0

  for (const event of events) {
    const d = new Date(event.date)
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

export function useEvents(folderId: number | null): UseEventsResult {
  const [events, setEvents] = useState<EventWithGroup[]>([])
  const [groups, setGroups] = useState<YearMonthGroup[]>([])
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(() => {
    if (folderId === null) return
    setLoading(true)
    window.api
      .getEventSummary(folderId)
      .then((summaries) => {
        const computed = computeConsecutiveGroups(summaries)
        setEvents(computed)
        setGroups(computeYearMonthGroups(computed))
      })
      .finally(() => setLoading(false))
  }, [folderId])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { events, groups, groupCounts: groups.map((g) => g.count), loading, refresh }
}
