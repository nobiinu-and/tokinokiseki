import type { EventConfirmed } from '../types/models'

interface Props {
  date: string
  photoCount: number
  thumbnailPath: string
  isLargeCard: boolean
  hasBest: boolean
  events?: EventConfirmed[]
  isSelected?: boolean
  isInRange?: boolean
  onClick: () => void
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short'
  })
}

function EventLabels({ events }: { events: EventConfirmed[] }): JSX.Element | null {
  if (events.length === 0) return null
  return (
    <div className="date-card-event-labels">
      {events.map((e) => (
        <span key={e.id} className="date-card-event-label">
          {e.title}
        </span>
      ))}
    </div>
  )
}

export function DateCard({
  date,
  photoCount,
  thumbnailPath,
  isLargeCard,
  hasBest,
  events,
  isSelected,
  isInRange,
  onClick
}: Props): JSX.Element {
  const extraClass = [
    isSelected ? 'date-card-selected' : '',
    isInRange ? 'date-card-in-range' : ''
  ]
    .filter(Boolean)
    .join(' ')

  if (!isLargeCard) {
    return (
      <div className={`date-card date-card-compact ${extraClass}`} onClick={onClick}>
        <img className="date-card-thumb-small" src={thumbnailPath} alt="" loading="lazy" />
        <div className="date-card-info-compact">
          <span className="date-card-date-compact">{formatDate(date)}</span>
          <span className="date-card-count-compact">{photoCount}枚</span>
        </div>
        {hasBest && <span className="date-card-best-badge">★</span>}
        {events && events.length > 0 && <EventLabels events={events} />}
      </div>
    )
  }

  return (
    <div className={`date-card date-card-large ${extraClass}`} onClick={onClick}>
      <img className="date-card-thumb" src={thumbnailPath} alt="" loading="lazy" />
      <div className="date-card-info">
        <span className="date-card-date">{formatDate(date)}</span>
        <span className="date-card-count">{photoCount}枚</span>
        {hasBest && <span className="date-card-best-badge">★ ベストあり</span>}
        {events && events.length > 0 && <EventLabels events={events} />}
      </div>
    </div>
  )
}
