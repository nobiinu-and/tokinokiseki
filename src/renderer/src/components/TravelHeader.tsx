import { useState, useRef, useCallback } from 'react'
import type { TravelGroupDisplay } from '../hooks/buildEventList'

interface Props {
  group: TravelGroupDisplay
  onConfirmSuggestion?: (title: string) => void
  onDismissSuggestion?: () => void
  onAdjustSuggestion?: () => void
  onTitleChange?: (id: number, title: string) => void
  onMenuAction?: (id: number, action: 'edit-range' | 'delete') => void
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return `${d.getMonth() + 1}/${d.getDate()}`
}

export function TravelHeader({
  group,
  onConfirmSuggestion,
  onDismissSuggestion,
  onAdjustSuggestion,
  onTitleChange,
  onMenuAction
}: Props): JSX.Element {
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [showMenu, setShowMenu] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const dateRange = `${formatShortDate(group.startDate)}〜${formatShortDate(group.endDate)}`
  const stats = `${group.dayCount}日間・${group.totalPhotos}枚`

  const handleTitleClick = useCallback(() => {
    if (group.status !== 'confirmed' || !group.id || !onTitleChange) return
    setEditTitle(group.title || '')
    setEditing(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }, [group, onTitleChange])

  const handleTitleSave = useCallback(() => {
    if (editing && group.id && onTitleChange && editTitle.trim()) {
      onTitleChange(group.id, editTitle.trim())
    }
    setEditing(false)
  }, [editing, group.id, editTitle, onTitleChange])

  const handleTitleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleTitleSave()
      if (e.key === 'Escape') setEditing(false)
    },
    [handleTitleSave]
  )

  if (group.status === 'suggested') {
    return (
      <div className="travel-header travel-header-suggested">
        <div className="travel-header-content">
          <span className="travel-header-icon">💡</span>
          <span className="travel-header-label">旅行ですか？</span>
          <span className="travel-header-dates">{dateRange}</span>
          <span className="travel-header-stats">（{stats}）</span>
        </div>
        <div className="travel-header-actions">
          <button
            className="btn btn-primary travel-header-btn"
            onClick={() => onConfirmSuggestion?.('')}
          >
            はい
          </button>
          <button
            className="btn btn-ghost travel-header-btn"
            onClick={onDismissSuggestion}
          >
            いいえ
          </button>
          <button
            className="btn btn-ghost travel-header-btn"
            onClick={onAdjustSuggestion}
          >
            調整
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="travel-header travel-header-confirmed">
      <div className="travel-header-content">
        <span className="travel-header-icon">✈</span>
        {editing ? (
          <input
            ref={inputRef}
            className="travel-header-title-input"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onBlur={handleTitleSave}
            onKeyDown={handleTitleKeyDown}
          />
        ) : (
          <span
            className="travel-header-title"
            onClick={handleTitleClick}
            title="クリックで編集"
          >
            {group.title}
          </span>
        )}
        <span className="travel-header-dates">{dateRange}</span>
        <span className="travel-header-stats">（{stats}）</span>
      </div>
      <div className="travel-header-actions">
        <div className="travel-header-menu-wrap" ref={menuRef}>
          <button
            className="travel-header-menu-btn"
            onClick={() => setShowMenu(!showMenu)}
          >
            ⋯
          </button>
          {showMenu && (
            <div
              className="travel-header-menu"
              onMouseLeave={() => setShowMenu(false)}
            >
              <button
                className="travel-header-menu-item"
                onClick={() => {
                  setShowMenu(false)
                  onMenuAction?.(group.id!, 'edit-range')
                }}
              >
                範囲を変更
              </button>
              <button
                className="travel-header-menu-item travel-header-menu-danger"
                onClick={() => {
                  setShowMenu(false)
                  onMenuAction?.(group.id!, 'delete')
                }}
              >
                旅行を解除
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
