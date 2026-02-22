import { useState, useEffect, useRef } from 'react'
import type { AutoTagProgress, TagLabelDef } from '../types/models'

const SCENE_LABELS: TagLabelDef[] = [
  { label: 'a person wearing a bird mask or pigeon mask', display: 'ハトマスク' },
  { label: 'outdoor scene', display: '屋外' },
  { label: 'indoor scene', display: '屋内' },
  { label: 'party or celebration', display: 'パーティー' },
  { label: 'night scene or illumination', display: '夜景' },
  { label: 'sunset or sunrise', display: '夕焼け' },
  { label: 'landscape or scenery', display: '風景' },
  { label: 'food or meal', display: '食事' },
  { label: 'travel or sightseeing', display: '旅行' },
  { label: 'plastic model or gundam figure', display: 'プラモデル' }
]

interface Props {
  folderId: number
  date?: string
  onClose: () => void
  onComplete: () => void
}

function getProgressLabel(p: AutoTagProgress): string {
  switch (p.phase) {
    case 'checking_rotation':
      return `回転補正チェック中... ${p.current} / ${p.total} 枚`
    case 'loading_detect_model':
      return '物体検出モデルを読み込み中...(初回は数分かかります)'
    case 'detecting':
      return `物体検出中... ${p.current} / ${p.total} 枚`
    case 'loading_model':
      return 'シーン分類モデルを読み込み中...(初回は数分かかります)'
    case 'classifying':
      return `シーン分類中... ${p.current} / ${p.total} 枚`
  }
}

export function AutoTagDialog({ folderId, date, onClose, onComplete }: Props): JSX.Element {
  const [rotationEnabled, setRotationEnabled] = useState(true)
  const [rotationThreshold, setRotationThreshold] = useState(0.6)
  const [detectEnabled, setDetectEnabled] = useState(true)
  const [detectThreshold, setDetectThreshold] = useState(0.5)
  const [sceneEnabled, setSceneEnabled] = useState(true)
  const [labels, setLabels] = useState<TagLabelDef[]>([...SCENE_LABELS])
  const [enabledLabels, setEnabledLabels] = useState<Set<string>>(
    new Set(SCENE_LABELS.map((l) => l.label))
  )
  const [newLabel, setNewLabel] = useState('')
  const [newDisplay, setNewDisplay] = useState('')
  const [sceneThreshold, setSceneThreshold] = useState(0.5)
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

  const canStart =
    rotationEnabled || detectEnabled || (sceneEnabled && labels.some((l) => enabledLabels.has(l.label)))

  const handleStart = async (): Promise<void> => {
    if (!canStart) return

    const selectedLabels = sceneEnabled
      ? labels.filter((l) => enabledLabels.has(l.label))
      : []

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

    await window.api.startAutoTag(
      folderId,
      selectedLabels,
      sceneThreshold,
      detectEnabled,
      detectThreshold,
      rotationEnabled,
      rotationThreshold,
      date
    )
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
            {/* Rotation Correction Section */}
            <div className="autotag-section">
              <div className="autotag-section-header">
                <h3>回転補正 (CLIP)</h3>
                <input
                  type="checkbox"
                  className="autotag-toggle"
                  checked={rotationEnabled}
                  onChange={(e) => setRotationEnabled(e.target.checked)}
                />
              </div>
              <div className={rotationEnabled ? '' : 'autotag-section-disabled'}>
                <div className="autotag-threshold-hint" style={{ marginBottom: 8 }}>
                  EXIF情報がない写真の向きを自動判定して補正します
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  閾値: {Math.round(rotationThreshold * 100)}%
                </div>
                <input
                  type="range"
                  min="0.4"
                  max="0.9"
                  step="0.01"
                  value={rotationThreshold}
                  onChange={(e) => setRotationThreshold(parseFloat(e.target.value))}
                  className="autotag-slider"
                />
              </div>
            </div>

            {/* Object Detection Section */}
            <div className="autotag-section">
              <div className="autotag-section-header">
                <h3>物体検出 (YOLO)</h3>
                <input
                  type="checkbox"
                  className="autotag-toggle"
                  checked={detectEnabled}
                  onChange={(e) => setDetectEnabled(e.target.checked)}
                />
              </div>
              <div className={detectEnabled ? '' : 'autotag-section-disabled'}>
                <div className="autotag-threshold-hint" style={{ marginBottom: 8 }}>
                  写真内の物体 (人物・動物・車 等) を自動検出してタグ付けします
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  閾値: {Math.round(detectThreshold * 100)}%
                </div>
                <input
                  type="range"
                  min="0.3"
                  max="0.9"
                  step="0.01"
                  value={detectThreshold}
                  onChange={(e) => setDetectThreshold(parseFloat(e.target.value))}
                  className="autotag-slider"
                />
              </div>
            </div>

            {/* Scene Classification Section */}
            <div className="autotag-section">
              <div className="autotag-section-header">
                <h3>シーン分類 (CLIP)</h3>
                <input
                  type="checkbox"
                  className="autotag-toggle"
                  checked={sceneEnabled}
                  onChange={(e) => setSceneEnabled(e.target.checked)}
                />
              </div>
              <div className={sceneEnabled ? '' : 'autotag-section-disabled'}>
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
                      {!SCENE_LABELS.some((d) => d.label === l.label) && (
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

                <div style={{ marginTop: 12 }}>
                  <div
                    style={{
                      fontSize: '0.85rem',
                      color: 'var(--text-secondary)',
                      marginBottom: 4
                    }}
                  >
                    カスタムラベル追加
                  </div>
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

                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    閾値: {Math.round(sceneThreshold * 100)}%
                  </div>
                  <input
                    type="range"
                    min="0.3"
                    max="0.8"
                    step="0.01"
                    value={sceneThreshold}
                    onChange={(e) => setSceneThreshold(parseFloat(e.target.value))}
                    className="autotag-slider"
                  />
                  <div className="autotag-threshold-hint">
                    50%が「該当/非該当」の境界。低いほど多くタグ付けされます
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {isRunning && progress && (
          <div className="dialog-body">
            <div className="autotag-progress">
              <p className="autotag-progress-label">{getProgressLabel(progress)}</p>
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
              <button className="btn btn-primary" onClick={handleStart} disabled={!canStart}>
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
