import { useState, useEffect } from 'react'

interface Props {
  timelineId: number
  mode: 'range' | 'dates'
  startDate?: string // range 用
  endDate?: string // range 用
  dates?: string[] // dates 用
  onConfirm: (title: string) => void
  onCancel: () => void
}

function formatRange(startDate: string, endDate: string): string {
  const s = new Date(startDate + 'T00:00:00')
  const e = new Date(endDate + 'T00:00:00')
  const days = Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1
  return `${s.getMonth() + 1}/${s.getDate()}〜${e.getMonth() + 1}/${e.getDate()}（${days}日間）`
}

function formatDatesList(dates: string[]): string {
  const formatted = dates.map((d) => {
    const dt = new Date(d + 'T00:00:00')
    return `${dt.getMonth() + 1}/${dt.getDate()}`
  })
  return `${formatted.join(', ')}（${dates.length}日）`
}

export function EventTitleDialog({
  timelineId,
  mode,
  startDate,
  endDate,
  dates,
  onConfirm,
  onCancel
}: Props): JSX.Element {
  const [title, setTitle] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const promise =
      mode === 'dates' && dates
        ? window.api.generateEventTitleForDates(timelineId, dates)
        : window.api.generateEventTitle(timelineId, startDate!, endDate!)

    promise
      .then((generated) => {
        setTitle(generated)
      })
      .catch((err) => {
        console.error('Failed to generate event title:', err)
        setTitle('新しいできごと')
      })
      .finally(() => setLoading(false))
  }, [timelineId, mode, startDate, endDate, dates])

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault()
    if (title.trim()) {
      onConfirm(title.trim())
    }
  }

  const infoText =
    mode === 'dates' && dates
      ? `日付: ${formatDatesList(dates)}`
      : `期間: ${formatRange(startDate!, endDate!)}`

  return (
    <div className="dialog-overlay">
      <div className="dialog">
        <div className="dialog-header">
          <h2>できごとを作成</h2>
          <button className="dialog-close" onClick={onCancel}>
            &times;
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="dialog-body">
            <div className="event-dialog-range">{infoText}</div>
            <div className="event-dialog-field">
              <label htmlFor="event-title">タイトル</label>
              <input
                id="event-title"
                type="text"
                className="autotag-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={loading ? '生成中...' : 'タイトルを入力'}
                disabled={loading}
                autoFocus
              />
            </div>
          </div>
          <div className="dialog-footer">
            <button type="button" className="btn btn-ghost" onClick={onCancel}>
              キャンセル
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading || !title.trim()}
            >
              作成
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
