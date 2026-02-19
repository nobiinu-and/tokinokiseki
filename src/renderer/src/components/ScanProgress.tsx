import type { ScanProgress as ScanProgressType } from '../types/models'

interface Props {
  progress: ScanProgressType
}

export function ScanProgress({ progress }: Props): JSX.Element {
  const percentage =
    progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0

  return (
    <div className="scan-progress">
      <div className="scan-progress-header">
        {progress.phase === 'discovering' ? (
          <span>写真を検索中...</span>
        ) : (
          <span>
            処理中 {progress.current.toLocaleString()} / {progress.total.toLocaleString()}
          </span>
        )}
      </div>
      {progress.phase === 'processing' && (
        <>
          <div className="scan-progress-bar">
            <div
              className="scan-progress-bar-fill"
              style={{ width: `${percentage}%` }}
            />
          </div>
          <div className="scan-progress-file">{progress.currentFile}</div>
        </>
      )}
    </div>
  )
}
