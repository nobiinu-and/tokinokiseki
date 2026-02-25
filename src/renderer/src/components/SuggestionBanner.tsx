import type { EventSuggestion } from '../types/models'

interface Props {
  suggestion: EventSuggestion
  onAccept: (suggestion: EventSuggestion) => void
  onDismiss: (suggestion: EventSuggestion) => void
  onAdjust: (suggestion: EventSuggestion) => void
}

function formatRange(startDate: string, endDate: string): string {
  const s = new Date(startDate + 'T00:00:00')
  const e = new Date(endDate + 'T00:00:00')
  return `${s.getMonth() + 1}/${s.getDate()}〜${e.getMonth() + 1}/${e.getDate()}`
}

export function SuggestionBanner({
  suggestion,
  onAccept,
  onDismiss,
  onAdjust
}: Props): JSX.Element {
  return (
    <div className="suggestion-banner">
      <span className="suggestion-banner-text">
        できごとですか？ {formatRange(suggestion.startDate, suggestion.endDate)}（{suggestion.totalPhotos}枚）
      </span>
      <div className="suggestion-banner-actions">
        <button className="btn btn-secondary btn-small" onClick={() => onAccept(suggestion)}>
          はい
        </button>
        <button className="btn btn-ghost btn-small" onClick={() => onDismiss(suggestion)}>
          あとで
        </button>
        <button className="btn btn-ghost btn-small" onClick={() => onAdjust(suggestion)}>
          調整
        </button>
      </div>
    </div>
  )
}
