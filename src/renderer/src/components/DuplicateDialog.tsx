import { useState, useEffect } from 'react'
import type { DuplicateGroup } from '../types/models'

type Phase = 'detecting' | 'review' | 'deleting' | 'done'

interface Props {
  folderId: number
  date: string
  onClose: () => void
  onComplete: () => void
}

export function DuplicateDialog({ folderId, date, onClose, onComplete }: Props): JSX.Element {
  const [phase, setPhase] = useState<Phase>('detecting')
  const [groups, setGroups] = useState<DuplicateGroup[]>([])
  const [thumbUrls, setThumbUrls] = useState<Record<number, string>>({})
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [deletedCount, setDeletedCount] = useState(0)
  const [error, setError] = useState<string | null>(null)

  // Start detection on mount
  useEffect(() => {
    let cancelled = false
    ;(async (): Promise<void> => {
      try {
        const result = await window.api.findDuplicates(folderId, date)
        if (cancelled) return

        if (result.length === 0) {
          setPhase('done')
          setDeletedCount(0)
          return
        }

        // Load thumbnail URLs for all photos in groups
        const urls: Record<number, string> = {}
        for (const group of result) {
          for (const photo of group.photos) {
            const url = await window.api.getThumbnailPath(photo.id)
            urls[photo.id] = url
          }
        }
        if (cancelled) return

        setGroups(result)
        setThumbUrls(urls)
        setPhase('review')
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
        setPhase('done')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [folderId, date])

  const toggleSelect = (photoId: number): void => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(photoId)) {
        next.delete(photoId)
      } else {
        next.add(photoId)
      }
      return next
    })
  }

  const handleDelete = async (): Promise<void> => {
    if (selected.size === 0) return
    setPhase('deleting')

    try {
      let count = 0
      for (const photoId of selected) {
        await window.api.deletePhoto(photoId)
        count++
      }
      setDeletedCount(count)
      setPhase('done')
      onComplete()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setPhase('done')
    }
  }

  const handleClose = (): void => {
    if (phase === 'detecting' || phase === 'deleting') return
    onClose()
  }

  const isWorking = phase === 'detecting' || phase === 'deleting'

  return (
    <div className="dialog-overlay" onClick={isWorking ? undefined : handleClose}>
      <div
        className="dialog duplicate-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog-header">
          <h2>重複チェック</h2>
          {!isWorking && (
            <button className="dialog-close" onClick={handleClose}>
              &times;
            </button>
          )}
        </div>

        {phase === 'detecting' && (
          <div className="dialog-body">
            <div className="autotag-progress">
              <p className="autotag-progress-label">類似写真を検出中...</p>
              <div className="scan-progress-bar">
                <div className="scan-progress-bar-fill" style={{ width: '100%' }} />
              </div>
            </div>
          </div>
        )}

        {phase === 'review' && (
          <div className="dialog-body">
            <p className="dup-summary">
              {groups.length} グループの類似写真が見つかりました。削除する写真を選択してください。
            </p>
            <div className="dup-groups">
              {groups.map((group, gi) => (
                <div key={gi} className="dup-group">
                  <div className="dup-group-header">
                    グループ {gi + 1} ({group.photos.length}枚)
                  </div>
                  <div className="dup-group-photos">
                    {group.photos.map((photo) => (
                      <label key={photo.id} className="dup-photo-item">
                        <div className="dup-photo-thumb-wrap">
                          <img
                            src={thumbUrls[photo.id] || ''}
                            alt={photo.fileName}
                            className="dup-photo-thumb"
                          />
                          {selected.has(photo.id) && (
                            <div className="dup-photo-delete-overlay">削除</div>
                          )}
                        </div>
                        <div className="dup-photo-info">
                          <input
                            type="checkbox"
                            checked={selected.has(photo.id)}
                            onChange={() => toggleSelect(photo.id)}
                          />
                          <span className="dup-photo-name" title={photo.fileName}>
                            {photo.fileName}
                          </span>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {phase === 'deleting' && (
          <div className="dialog-body">
            <div className="autotag-progress">
              <p className="autotag-progress-label">削除中...</p>
              <div className="scan-progress-bar">
                <div className="scan-progress-bar-fill" style={{ width: '100%' }} />
              </div>
            </div>
          </div>
        )}

        {phase === 'done' && (
          <div className="dialog-body">
            <div className="autotag-result">
              {error ? (
                <p className="autotag-result-error">エラー: {error}</p>
              ) : deletedCount > 0 ? (
                <p className="autotag-result-success">
                  {deletedCount} 枚の写真をゴミ箱に移動しました
                </p>
              ) : (
                <p className="autotag-result-success">重複写真は見つかりませんでした</p>
              )}
            </div>
          </div>
        )}

        <div className="dialog-footer">
          {phase === 'review' && (
            <>
              <button className="btn btn-ghost" onClick={handleClose}>
                キャンセル
              </button>
              <button
                className="btn btn-primary"
                onClick={handleDelete}
                disabled={selected.size === 0}
              >
                選択した {selected.size} 枚を削除
              </button>
            </>
          )}
          {phase === 'done' && (
            <button className="btn btn-primary" onClick={handleClose}>
              閉じる
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
