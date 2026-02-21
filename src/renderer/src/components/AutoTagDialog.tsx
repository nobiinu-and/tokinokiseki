import { useState, useEffect, useRef } from 'react'
import type { AutoTagProgress, TagLabelDef } from '../types/models'

const DEFAULT_LABELS: TagLabelDef[] = [
  { label: 'a person wearing a bird mask or pigeon mask', display: 'ハトマスク' },
  { label: 'people or person', display: '人物' },
  { label: 'plastic model or gundam figure', display: 'プラモデル' },
  { label: 'landscape or scenery', display: '風景' },
  { label: 'food or meal', display: '食べ物' },
  { label: 'animal or pet', display: '動物' },
  { label: 'building or architecture', display: '建物' }
]

interface Props {
  folderId: number
  date?: string
  onClose: () => void
  onComplete: () => void
}

export function AutoTagDialog({ folderId, date, onClose, onComplete }: Props): JSX.Element {
  const [labels, setLabels] = useState<TagLabelDef[]>([...DEFAULT_LABELS])
  const [enabledLabels, setEnabledLabels] = useState<Set<string>>(
    new Set(DEFAULT_LABELS.map((l) => l.label))
  )
  const [newLabel, setNewLabel] = useState('')
  const [newDisplay, setNewDisplay] = useState('')
  const [threshold, setThreshold] = useState(0.5)
  const [isRunning, setIsRunning] = useState(false)
  const [progress, setProgress] = useState<AutoTagProgress | null>(null)
  const [result, setResult] = useState<{ tagged: number; error?: string } | null>(null)
  const cleanupRef = useRef<(() => void)[]>([])

  useEffect(() => {
    return () => {
      cleanupRef.current.forEach((fn) => fn())
    }
  }, [])

  const toggleLabel = (label: string): void => {
    setEnabledLabels((prev) => {
      const next = new Set(prev)
      if (next.has(label)) {
        next.delete(label)
      } else {
        next.add(label)
      }
      return next
    })
  }

  const addLabel = (): void => {
    const trimLabel = newLabel.trim()
    const trimDisplay = newDisplay.trim()
    if (!trimLabel || !trimDisplay) return
    if (labels.some((l) => l.label === trimLabel)) return

    const newDef: TagLabelDef = { label: trimLabel, display: trimDisplay }
    setLabels((prev) => [...prev, newDef])
    setEnabledLabels((prev) => new Set([...prev, trimLabel]))
    setNewLabel('')
    setNewDisplay('')
  }

  const removeLabel = (label: string): void => {
    setLabels((prev) => prev.filter((l) => l.label !== label))
    setEnabledLabels((prev) => {
      const next = new Set(prev)
      next.delete(label)
      return next
    })
  }

  const handleStart = async (): Promise<void> => {
    const selectedLabels = labels.filter((l) => enabledLabels.has(l.label))
    if (selectedLabels.length === 0) return

    setIsRunning(true)
    setResult(null)

    const unsubProgress = window.api.onAutoTagProgress((p) => {
      setProgress(p as AutoTagProgress)
    })
    const unsubComplete = window.api.onAutoTagComplete((r) => {
      const res = r as { folderId: number; tagged: number; error?: string }
      setResult({ tagged: res.tagged, error: res.error })
      setIsRunning(false)
    })
    cleanupRef.current.push(unsubProgress, unsubComplete)

    await window.api.startAutoTag(folderId, selectedLabels, threshold, date)
  }

  const handleClose = (): void => {
    if (isRunning) return
    if (result && !result.error) {
      onComplete()
    }
    onClose()
  }

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') {
      addLabel()
    }
  }

  const progressPercent =
    progress && progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0

  return (
    <div className="dialog-overlay" onClick={isRunning ? undefined : handleClose}>
      <div className="dialog autotag-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h2>自動タグ付け</h2>
          {!isRunning && (
            <button className="dialog-close" onClick={handleClose}>
              &times;
            </button>
          )}
        </div>

        {!isRunning && !result && (
          <div className="dialog-body">
            <div className="autotag-section">
              <h3>タグ候補</h3>
              <div className="autotag-labels">
                {labels.map((l) => (
                  <div key={l.label} className="autotag-label-row">
                    <label className="autotag-label-check">
                      <input
                        type="checkbox"
                        checked={enabledLabels.has(l.label)}
                        onChange={() => toggleLabel(l.label)}
                      />
                      <span className="autotag-label-display">{l.display}</span>
                      <span className="autotag-label-en">{l.label}</span>
                    </label>
                    {!DEFAULT_LABELS.some((d) => d.label === l.label) && (
                      <button
                        className="autotag-label-remove"
                        onClick={() => removeLabel(l.label)}
                      >
                        &times;
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="autotag-section">
              <h3>カスタムラベル追加</h3>
              <div className="autotag-add-row">
                <input
                  type="text"
                  placeholder="英語ラベル (e.g. car or vehicle)"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="autotag-input"
                />
                <input
                  type="text"
                  placeholder="表示名 (e.g. 車)"
                  value={newDisplay}
                  onChange={(e) => setNewDisplay(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="autotag-input autotag-input-short"
                />
                <button
                  className="btn btn-secondary"
                  onClick={addLabel}
                  disabled={!newLabel.trim() || !newDisplay.trim()}
                >
                  追加
                </button>
              </div>
            </div>

            <div className="autotag-section">
              <h3>閾値: {Math.round(threshold * 100)}%</h3>
              <input
                type="range"
                min="0.3"
                max="0.8"
                step="0.01"
                value={threshold}
                onChange={(e) => setThreshold(parseFloat(e.target.value))}
                className="autotag-slider"
              />
              <div className="autotag-threshold-hint">
                50%が「該当/非該当」の境界。低いほど多くタグ付けされます
              </div>
            </div>
          </div>
        )}

        {isRunning && progress && (
          <div className="dialog-body">
            <div className="autotag-progress">
              <p className="autotag-progress-label">
                {progress.phase === 'loading_model'
                  ? 'モデルを読み込み中...(初回は数分かかります)'
                  : `分類中... ${progress.current} / ${progress.total} 枚`}
              </p>
              <div className="scan-progress-bar">
                <div
                  className="scan-progress-bar-fill"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {result && (
          <div className="dialog-body">
            <div className="autotag-result">
              {result.error ? (
                <p className="autotag-result-error">エラー: {result.error}</p>
              ) : (
                <p className="autotag-result-success">
                  完了！ {result.tagged} 枚の写真にタグを付けました
                </p>
              )}
            </div>
          </div>
        )}

        <div className="dialog-footer">
          {!isRunning && !result && (
            <>
              <button className="btn btn-ghost" onClick={handleClose}>
                キャンセル
              </button>
              <button
                className="btn btn-primary"
                onClick={handleStart}
                disabled={enabledLabels.size === 0}
              >
                タグ付け開始
              </button>
            </>
          )}
          {result && (
            <button className="btn btn-primary" onClick={handleClose}>
              閉じる
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
