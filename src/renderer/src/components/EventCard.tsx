interface Props {
  date: string
  photoCount: number
  thumbnailPath: string
  isEvent: boolean
  hasBest: boolean
  onClick: () => void
  onContextMenu?: (e: React.MouseEvent) => void
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

export function EventCard({
  date,
  photoCount,
  thumbnailPath,
  isEvent,
  hasBest,
  onClick,
  onContextMenu
}: Props): JSX.Element {
  if (!isEvent) {
    return (
      <div className="event-card event-card-compact" onClick={onClick} onContextMenu={onContextMenu}>
        <img className="event-card-thumb-small" src={thumbnailPath} alt="" loading="lazy" />
        <div className="event-card-info-compact">
          <span className="event-card-date-compact">{formatDate(date)}</span>
          <span className="event-card-count-compact">{photoCount}枚</span>
        </div>
        {hasBest && <span className="event-card-best-badge">★</span>}
      </div>
    )
  }

  return (
    <div className="event-card event-card-large" onClick={onClick} onContextMenu={onContextMenu}>
      <img className="event-card-thumb" src={thumbnailPath} alt="" loading="lazy" />
      <div className="event-card-info">
        <span className="event-card-date">{formatDate(date)}</span>
        <span className="event-card-count">{photoCount}枚</span>
        {hasBest && <span className="event-card-best-badge">★ ベストあり</span>}
      </div>
    </div>
  )
}
