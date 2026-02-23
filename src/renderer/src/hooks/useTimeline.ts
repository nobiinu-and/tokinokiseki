import { useState, useEffect, useCallback } from 'react'
import type { DateCardSummary } from '../types/models'

export interface DateCardWithGroup extends DateCardSummary {
  isLargeCard: boolean
  consecutiveGroupId: number | null
}

interface YearMonthGroup {
  label: string // "2024年8月"
  year: number
  count: number
}

interface UseTimelineResult {
  dateCards: DateCardWithGroup[]
  groups: YearMonthGroup[]
  groupCounts: number[]
  loading: boolean
  refresh: () => void
}

function computeConsecutiveGroups(summaries: DateCardSummary[]): DateCardWithGroup[] {
  if (summaries.length === 0) return []

  const dateCards: DateCardWithGroup[] = summaries.map((s) => ({
    ...s,
    isLargeCard: s.photoCount >= 3,
    consecutiveGroupId: null
  }))

  // Sorted descending by date already from DB
  let groupId = 0

  for (let i = 0; i < dateCards.length; i++) {
    if (!dateCards[i].isLargeCard) continue

    if (dateCards[i].consecutiveGroupId === null) {
      dateCards[i].consecutiveGroupId = groupId

      // Look at subsequent items (next in list = earlier date)
      for (let j = i + 1; j < dateCards.length; j++) {
        if (!dateCards[j].isLargeCard) {
          // Check if this non-large-card is just a 1-day gap between large cards
          if (j + 1 < dateCards.length && dateCards[j + 1].isLargeCard) {
            const dateBefore = new Date(dateCards[i].date)
            const dateAfter = new Date(dateCards[j + 1].date)
            const daysDiff = Math.abs(
              (dateBefore.getTime() - dateAfter.getTime()) / (1000 * 60 * 60 * 24)
            )
            if (daysDiff <= 3) {
              // Include the gap day in the group
              dateCards[j].consecutiveGroupId = groupId
              continue
            }
          }
          break
        }

        const prevDate = new Date(dateCards[j - 1].date)
        const currDate = new Date(dateCards[j].date)
        const daysDiff = Math.abs(
          (prevDate.getTime() - currDate.getTime()) / (1000 * 60 * 60 * 24)
        )

        if (daysDiff <= 2) {
          dateCards[j].consecutiveGroupId = groupId
        } else {
          break
        }
      }
      groupId++
    }
  }

  return dateCards
}

function computeYearMonthGroups(dateCards: DateCardWithGroup[]): YearMonthGroup[] {
  if (dateCards.length === 0) return []

  const groups: YearMonthGroup[] = []
  let currentYear = -1
  let currentMonth = -1
  let currentCount = 0

  for (const card of dateCards) {
    const d = new Date(card.date)
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

export function useTimeline(folderId: number | null): UseTimelineResult {
  const [dateCards, setDateCards] = useState<DateCardWithGroup[]>([])
  const [groups, setGroups] = useState<YearMonthGroup[]>([])
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(() => {
    if (folderId === null) return
    setLoading(true)
    window.api
      .getDateSummary(folderId)
      .then((summaries) => {
        const computed = computeConsecutiveGroups(summaries)
        setDateCards(computed)
        setGroups(computeYearMonthGroups(computed))
      })
      .finally(() => setLoading(false))
  }, [folderId])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { dateCards, groups, groupCounts: groups.map((g) => g.count), loading, refresh }
}
