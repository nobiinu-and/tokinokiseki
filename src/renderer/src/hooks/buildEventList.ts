import type { TravelGroup } from '../types/models'
import type { EventWithGroup, YearMonthGroup } from './useEvents'
import type { TravelSuggestion } from './useTravelGroups'

export interface TravelGroupDisplay {
  status: 'confirmed' | 'suggested'
  id?: number
  title?: string
  startDate: string
  endDate: string
  totalPhotos: number
  dayCount: number
}

export type EventListItem =
  | ({ type: 'event' } & EventWithGroup & { travelGroupId?: number })
  | { type: 'travel-header'; group: TravelGroupDisplay }
  | { type: 'travel-footer' }

interface BuildResult {
  items: EventListItem[]
  groups: YearMonthGroup[]
  groupCounts: number[]
}

function getYearMonth(dateStr: string): string {
  return dateStr.slice(0, 7) // "YYYY-MM"
}

function calcDayCount(startDate: string, endDate: string): number {
  const s = new Date(startDate + 'T00:00:00')
  const e = new Date(endDate + 'T00:00:00')
  return Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1
}

function calcTotalPhotos(
  events: EventWithGroup[],
  startDate: string,
  endDate: string
): number {
  return events
    .filter((e) => e.date >= startDate && e.date <= endDate)
    .reduce((sum, e) => sum + e.photoCount, 0)
}

/**
 * Merge confirmed groups and suggestions into a unified list sorted by startDate descending.
 */
function mergeGroups(
  confirmedGroups: TravelGroup[],
  suggestions: TravelSuggestion[],
  events: EventWithGroup[]
): TravelGroupDisplay[] {
  const all: TravelGroupDisplay[] = []

  for (const g of confirmedGroups) {
    all.push({
      status: 'confirmed',
      id: g.id,
      title: g.title,
      startDate: g.startDate,
      endDate: g.endDate,
      totalPhotos: calcTotalPhotos(events, g.startDate, g.endDate),
      dayCount: calcDayCount(g.startDate, g.endDate)
    })
  }

  for (const s of suggestions) {
    all.push({
      status: 'suggested',
      startDate: s.startDate,
      endDate: s.endDate,
      totalPhotos: s.totalPhotos,
      dayCount: calcDayCount(s.startDate, s.endDate)
    })
  }

  // Sort descending by startDate (newest first, like events)
  all.sort((a, b) => b.startDate.localeCompare(a.startDate))
  return all
}

/**
 * Build flat EventListItem[] with travel headers/footers inserted,
 * along with recalculated year-month groupCounts.
 *
 * Events are sorted descending by date (newest first).
 * Travel groups' events are consolidated into the group's start month section.
 */
export function buildEventList(
  events: EventWithGroup[],
  confirmedGroups: TravelGroup[],
  suggestions: TravelSuggestion[]
): BuildResult {
  const travelGroups = mergeGroups(confirmedGroups, suggestions, events)

  // Map: date -> which travel group it belongs to
  const dateToGroup = new Map<string, TravelGroupDisplay>()
  for (const g of travelGroups) {
    for (const e of events) {
      if (e.date >= g.startDate && e.date <= g.endDate) {
        // First match wins (groups shouldn't overlap)
        if (!dateToGroup.has(e.date)) {
          dateToGroup.set(e.date, g)
        }
      }
    }
  }

  // Group events into: travel-grouped and standalone
  const groupedEvents = new Map<TravelGroupDisplay, EventWithGroup[]>()
  const standaloneEvents: EventWithGroup[] = []

  for (const e of events) {
    const g = dateToGroup.get(e.date)
    if (g) {
      if (!groupedEvents.has(g)) {
        groupedEvents.set(g, [])
      }
      groupedEvents.get(g)!.push(e)
    } else {
      standaloneEvents.push(e)
    }
  }

  // Build items in descending date order, inserting travel blocks at the right position
  // We iterate through events in original (descending) order and insert travel groups
  // at their first event position

  const items: EventListItem[] = []
  const processedGroups = new Set<TravelGroupDisplay>()
  const eventsInGroups = new Set<string>() // dates consumed by travel groups

  // Collect all travel group event dates
  for (const [g, gEvents] of groupedEvents) {
    for (const e of gEvents) {
      eventsInGroups.add(e.date)
    }
  }

  for (const event of events) {
    const group = dateToGroup.get(event.date)

    if (group && !processedGroups.has(group)) {
      // Insert travel header + all events in this group + footer
      processedGroups.add(group)
      const gEvents = groupedEvents.get(group) || []

      items.push({
        type: 'travel-header',
        group
      })

      for (const ge of gEvents) {
        items.push({
          type: 'event',
          ...ge,
          travelGroupId: group.status === 'confirmed' ? group.id : undefined,
          // Override consecutiveGroupId for events inside travel groups
          consecutiveGroupId: null
        })
      }

      items.push({ type: 'travel-footer' })
    } else if (!eventsInGroups.has(event.date)) {
      // Standalone event
      items.push({ type: 'event', ...event })
    }
    // else: event is part of a group already processed, skip
  }

  // Now compute year-month groups from items
  // Travel groups are placed in their start date's month
  const ymGroups: YearMonthGroup[] = []
  let currentYM = ''
  let currentCount = 0

  for (const item of items) {
    let itemYM: string
    if (item.type === 'travel-header') {
      // Use start date's year-month
      itemYM = getYearMonth(item.group.startDate)
    } else if (item.type === 'travel-footer') {
      // Footer belongs to the same month as the header
      // Get the previous travel-header's month
      itemYM = currentYM // stays in current month
    } else {
      itemYM = getYearMonth(item.date)
    }

    if (itemYM !== currentYM) {
      if (currentCount > 0 && ymGroups.length > 0) {
        ymGroups[ymGroups.length - 1].count = currentCount
      }
      currentYM = itemYM
      currentCount = 1
      const d = new Date(currentYM + '-01T00:00:00')
      ymGroups.push({
        label: `${d.getFullYear()}年${d.getMonth() + 1}月`,
        year: d.getFullYear(),
        count: 0
      })
    } else {
      currentCount++
    }
  }

  if (ymGroups.length > 0 && currentCount > 0) {
    ymGroups[ymGroups.length - 1].count = currentCount
  }

  return {
    items,
    groups: ymGroups,
    groupCounts: ymGroups.map((g) => g.count)
  }
}
