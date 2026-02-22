import { useState, useRef, useCallback, useMemo } from 'react'
import { TAG_COLORS, DEFAULT_COLOR } from './TagBadge'
import type { PhotoTag } from '../types/models'

interface Props {
  tags: PhotoTag[]
  allTags: string[]
  onAdd: (tagName: string) => void
  onRemove: (tagName: string) => void
}

export function LightboxTagEditor({ tags, allTags, onAdd, onRemove }: Props): JSX.Element {
  const [input, setInput] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)

  const currentTagNames = useMemo(() => tags.map((t) => t.name), [tags])

  const suggestions = useMemo(() => {
    if (!input.trim()) return []
    const lower = input.toLowerCase()
    return allTags.filter(
      (t) => t.toLowerCase().includes(lower) && !currentTagNames.includes(t)
    )
  }, [input, allTags, currentTagNames])

  const addTag = useCallback(
    (name: string) => {
      const trimmed = name.trim()
      if (!trimmed) return
      if (currentTagNames.includes(trimmed)) return
      onAdd(trimmed)
      setInput('')
      setSelectedIndex(-1)
    },
    [onAdd, currentTagNames]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      e.stopPropagation()

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((prev) => Math.min(prev + 1, suggestions.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((prev) => Math.max(prev - 1, -1))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
          addTag(suggestions[selectedIndex])
        } else {
          addTag(input)
        }
      } else if (e.key === 'Escape') {
        setInput('')
        setSelectedIndex(-1)
        inputRef.current?.blur()
      }
    },
    [suggestions, selectedIndex, input, addTag]
  )

  return (
    <div className="lightbox-tag-editor" onClick={(e) => e.stopPropagation()}>
      <div className="lightbox-tags">
        {tags.map((tag) => {
          const color = TAG_COLORS[tag.name] || DEFAULT_COLOR
          return (
            <span
              key={tag.name}
              className="lightbox-tag"
              style={{ backgroundColor: color }}
            >
              {tag.name}
              <button
                className="lightbox-tag-remove"
                onClick={() => onRemove(tag.name)}
              >
                ×
              </button>
            </span>
          )
        })}
      </div>
      <div className="lightbox-tag-input-wrapper">
        <input
          ref={inputRef}
          type="text"
          className="lightbox-tag-input"
          placeholder="タグを追加..."
          value={input}
          onChange={(e) => {
            setInput(e.target.value)
            setSelectedIndex(-1)
          }}
          onKeyDown={handleKeyDown}
        />
        {suggestions.length > 0 && (
          <div className="lightbox-tag-suggestions">
            {suggestions.map((s, i) => (
              <div
                key={s}
                className={`lightbox-tag-suggestion ${i === selectedIndex ? 'lightbox-tag-suggestion-active' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault()
                  addTag(s)
                }}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                {s}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
