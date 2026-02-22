import { useState, useEffect } from 'react'

interface Props {
  folderId: number
  startDate: string
  endDate: string
  existingTitle?: string
  onConfirm: (title: string) => void
  onCancel: () => void
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function calcDayCount(startDate: string, endDate: string): number {
  const s = new Date(startDate + 'T00:00:00')
  const e = new Date(endDate + 'T00:00:00')
  return Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1
}

export function TravelConfirmBar({
  folderId,
  startDate,
  endDate,
  existingTitle,
  onConfirm,
  onCancel
}: Props): JSX.Element {
  const [title, setTitle] = useState(existingTitle || '')

  useEffect(() => {
    if (!existingTitle) {
      window.api
        .getTravelTitleSuggestion(folderId, startDate, endDate)
        .then(setTitle)
    }
  }, [folderId, startDate, endDate, existingTitle])

  const dateRange = `${formatShortDate(startDate)}〜${formatShortDate(endDate)}`
  const dayCount = calcDayCount(startDate, endDate)

  return (
    <div className="travel-confirm-bar">
      <span>✈</span>
      <span className="travel-confirm-bar-info">
        {dateRange}（{dayCount}日間）
      </span>
      <span>タイトル:</span>
      <input
        className="travel-confirm-bar-input"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="旅行のタイトル"
        onKeyDown={(e) => {
          if (e.key === 'Enter') onConfirm(title)
          if (e.key === 'Escape') onCancel()
        }}
      />
      <button className="btn btn-primary" onClick={() => onConfirm(title)}>
        {existingTitle ? '更新' : '作成'}
      </button>
      <button className="btn btn-ghost" onClick={onCancel}>
        キャンセル
      </button>
    </div>
  )
}
