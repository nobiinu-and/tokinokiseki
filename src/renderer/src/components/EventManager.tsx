import { useState } from 'react'
import type { EventConfirmed } from '../types/models'

interface Props {
  events: EventConfirmed[]
  onClose: () => void
  onDelete: (eventId: number) => void
  onUpdate: (eventId: number, title: string) => void
  onRemoveDate: (eventId: number, date: string) => void
  onStartAddDates: (eventId: number, eventTitle: string) => void
  onEventClick?: (event: EventConfirmed) => void
}

function formatRange(startDate: string, endDate: string): string {
  const s = new Date(startDate + 'T00:00:00')
  const e = new Date(endDate + 'T00:00:00')
  return `${s.getMonth() + 1}/${s.getDate()}〜${e.getMonth() + 1}/${e.getDate()}`
}

function formatDate(date: string): string {
  const d = new Date(date + 'T00:00:00')
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function EventItem({
  event,
  onDelete,
  onUpdate,
  onRemoveDate,
  onStartAddDates,
  onEventClick
}: {
  event: EventConfirmed
  onDelete: (id: number) => void
  onUpdate: (id: number, title: string) => void
  onRemoveDate: (eventId: number, date: string) => void
  onStartAddDates: (eventId: number, eventTitle: string) => void
  onEventClick?: (event: EventConfirmed) => void
}): JSX.Element {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(event.title)

  const handleSave = (): void => {
    if (title.trim() && title.trim() !== event.title) {
      onUpdate(event.id, title.trim())
    }
    setEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') handleSave()
    if (e.key === 'Escape') {
      setTitle(event.title)
      setEditing(false)
    }
  }

  return (
    <div className="event-manager-item">
      <div className="event-manager-item-main">
        <div className="event-manager-title-row">
          {editing ? (
            <input
              className="autotag-input event-manager-title-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleSave}
              onKeyDown={handleKeyDown}
              autoFocus
            />
          ) : (
            <span
              className="event-manager-title"
              onClick={() => setEditing(true)}
              title="クリックして編集"
            >
              {event.title}
            </span>
          )}
          <span className="event-type-badge">
            {event.type === 'dates' ? '日付リスト' : '期間'}
          </span>
        </div>

        {event.type === 'dates' && event.dates ? (
          <>
            <div className="event-manager-dates">
              {event.dates.map((date) => (
                <span key={date} className="event-date-chip">
                  {formatDate(date)}
                  <button
                    className="event-date-chip-remove"
                    onClick={() => onRemoveDate(event.id, date)}
                    title="この日付を削除"
                  >
                    &times;
                  </button>
                </span>
              ))}
            </div>
            <button
              className="btn btn-ghost btn-small"
              style={{ alignSelf: 'flex-start', marginTop: '4px' }}
              onClick={() => onStartAddDates(event.id, event.title)}
            >
              + 日付を追加
            </button>
          </>
        ) : (
          <span className="event-manager-range">
            {formatRange(event.startDate, event.endDate)}
          </span>
        )}
      </div>
      <div className="event-manager-actions">
        {onEventClick && (
          <button
            className="btn btn-ghost btn-small"
            onClick={() => onEventClick(event)}
          >
            表示
          </button>
        )}
        <button
          className="btn btn-ghost btn-small event-manager-delete"
          onClick={() => onDelete(event.id)}
        >
          削除
        </button>
      </div>
    </div>
  )
}

export function EventManager({
  events,
  onClose,
  onDelete,
  onUpdate,
  onRemoveDate,
  onStartAddDates,
  onEventClick
}: Props): JSX.Element {
  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h2>できごと管理</h2>
          <button className="dialog-close" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="dialog-body">
          {events.length === 0 ? (
            <p className="event-manager-empty">できごとはまだありません</p>
          ) : (
            <div className="event-manager-list">
              {events.map((event) => (
                <EventItem
                  key={event.id}
                  event={event}
                  onDelete={onDelete}
                  onUpdate={onUpdate}
                  onRemoveDate={onRemoveDate}
                  onStartAddDates={onStartAddDates}
                  onEventClick={onEventClick}
                />
              ))}
            </div>
          )}
        </div>
        <div className="dialog-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            閉じる
          </button>
        </div>
      </div>
    </div>
  )
}
