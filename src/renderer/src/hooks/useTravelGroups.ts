import { useState, useEffect, useCallback, useRef } from 'react'
import type { TravelGroup } from '../types/models'
import type { EventWithGroup } from './useEvents'

export interface TravelSuggestion {
  startDate: string
  endDate: string
  totalPhotos: number
}

interface UseTravelGroupsResult {
  confirmedGroups: TravelGroup[]
  suggestions: TravelSuggestion[]
  dismissSuggestion: (startDate: string, endDate: string) => void
  confirmGroup: (
    folderId: number,
    title: string,
    startDate: string,
    endDate: string
  ) => Promise<void>
  createGroup: (
    folderId: number,
    title: string,
    startDate: string,
    endDate: string
  ) => Promise<void>
  updateGroup: (
    id: number,
    title: string,
    startDate: string,
    endDate: string
  ) => Promise<void>
  deleteGroup: (id: number) => Promise<void>
  refresh: () => void
}

const MIN_DAYS = 2
const MAX_GAP = 1
const MIN_PHOTOS_PER_DAY = 3
const MAX_SUGGESTIONS = 5

function computeSuggestions(
  events: EventWithGroup[],
  confirmedGroups: TravelGroup[]
): TravelSuggestion[] {
  // Filter to days with enough photos
  const qualifiedDays = events
    .filter((e) => e.photoCount >= MIN_PHOTOS_PER_DAY)
    .map((e) => ({ date: e.date, photoCount: e.photoCount }))
    .sort((a, b) => a.date.localeCompare(b.date))

  if (qualifiedDays.length === 0) return []

  // Cluster consecutive days (allowing maxGap)
  const clusters: { startDate: string; endDate: string; totalPhotos: number }[] = []
  let clusterStart = qualifiedDays[0]
  let clusterEnd = qualifiedDays[0]
  let clusterPhotos = qualifiedDays[0].photoCount

  for (let i = 1; i < qualifiedDays.length; i++) {
    const prev = new Date(clusterEnd.date + 'T00:00:00')
    const curr = new Date(qualifiedDays[i].date + 'T00:00:00')
    const daysDiff = Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24))

    if (daysDiff <= MAX_GAP + 1) {
      // +1 because gap=1 means 2 days apart (e.g., 8/10 and 8/12 = gap of 1 day)
      clusterEnd = qualifiedDays[i]
      clusterPhotos += qualifiedDays[i].photoCount
    } else {
      clusters.push({
        startDate: clusterStart.date,
        endDate: clusterEnd.date,
        totalPhotos: clusterPhotos
      })
      clusterStart = qualifiedDays[i]
      clusterEnd = qualifiedDays[i]
      clusterPhotos = qualifiedDays[i].photoCount
    }
  }
  clusters.push({
    startDate: clusterStart.date,
    endDate: clusterEnd.date,
    totalPhotos: clusterPhotos
  })

  // Filter by minimum calendar days
  const filtered = clusters.filter((c) => {
    const start = new Date(c.startDate + 'T00:00:00')
    const end = new Date(c.endDate + 'T00:00:00')
    const calDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
    return calDays >= MIN_DAYS
  })

  // Exclude suggestions that overlap with confirmed groups
  const suggestions = filtered.filter((s) => {
    return !confirmedGroups.some(
      (g) => g.startDate <= s.endDate && g.endDate >= s.startDate
    )
  })

  // Most recent first, limited to MAX_SUGGESTIONS
  return suggestions.reverse().slice(0, MAX_SUGGESTIONS)
}

export function useTravelGroups(
  folderId: number | null,
  events: EventWithGroup[]
): UseTravelGroupsResult {
  const [confirmedGroups, setConfirmedGroups] = useState<TravelGroup[]>([])
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const prevFolderIdRef = useRef<number | null>(null)

  const refresh = useCallback(() => {
    if (folderId === null) return
    window.api.getTravelGroups(folderId).then(setConfirmedGroups)
  }, [folderId])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Clear dismissed when folder changes
  useEffect(() => {
    if (prevFolderIdRef.current !== null && prevFolderIdRef.current !== folderId) {
      setDismissed(new Set())
    }
    prevFolderIdRef.current = folderId
  }, [folderId])

  const rawSuggestions = computeSuggestions(events, confirmedGroups)
  const suggestions = rawSuggestions.filter(
    (s) => !dismissed.has(`${s.startDate}~${s.endDate}`)
  )

  const dismissSuggestion = useCallback((startDate: string, endDate: string) => {
    setDismissed((prev) => {
      const next = new Set(prev)
      next.add(`${startDate}~${endDate}`)
      return next
    })
  }, [])

  const confirmGroup = useCallback(
    async (fId: number, title: string, startDate: string, endDate: string) => {
      await window.api.createTravelGroup(fId, title, startDate, endDate)
      refresh()
    },
    [refresh]
  )

  const createGroup = useCallback(
    async (fId: number, title: string, startDate: string, endDate: string) => {
      await window.api.createTravelGroup(fId, title, startDate, endDate)
      refresh()
    },
    [refresh]
  )

  const updateGroup = useCallback(
    async (id: number, title: string, startDate: string, endDate: string) => {
      await window.api.updateTravelGroup(id, title, startDate, endDate)
      refresh()
    },
    [refresh]
  )

  const deleteGroup = useCallback(
    async (id: number) => {
      await window.api.deleteTravelGroup(id)
      refresh()
    },
    [refresh]
  )

  return {
    confirmedGroups,
    suggestions,
    dismissSuggestion,
    confirmGroup,
    createGroup,
    updateGroup,
    deleteGroup,
    refresh
  }
}
