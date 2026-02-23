interface Props {
  date: string
  photoCount: number
  thumbnailPath: string
  isLargeCard: boolean
  hasBest: boolean
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

export function DateCard({
  date,
  photoCount,
  thumbnailPath,
  isLargeCard,
  hasBest,
  onClick
}: Props): JSX.Element {
  if (!isLargeCard) {
    return (
      <div className="date-card date-card-compact" onClick={onClick}>
        <img className="date-card-thumb-small" src={thumbnailPath} alt="" loading="lazy" />
        <div className="date-card-info-compact">
          <span className="date-card-date-compact">{formatDate(date)}</span>
          <span className="date-card-count-compact">{photoCount}枚</span>
        </div>
        {hasBest && <span className="date-card-best-badge">★</span>}
      </div>
    )
  }

  return (
    <div className="date-card date-card-large" onClick={onClick}>
      <img className="date-card-thumb" src={thumbnailPath} alt="" loading="lazy" />
      <div className="date-card-info">
        <span className="date-card-date">{formatDate(date)}</span>
        <span className="date-card-count">{photoCount}枚</span>
        {hasBest && <span className="date-card-best-badge">★ ベストあり</span>}
      </div>
    </div>
  )
}
