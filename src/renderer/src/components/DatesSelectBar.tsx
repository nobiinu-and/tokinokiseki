interface Props {
  selectedCount: number
  onDone: () => void
  onCancel: () => void
}

export function DatesSelectBar({ selectedCount, onDone, onCancel }: Props): JSX.Element {
  return (
    <div className="range-select-bar">
      <span>
        日付を選んでください（クリックで追加/解除）
        {selectedCount > 0 && <strong>　{selectedCount}日選択中</strong>}
      </span>
      <div className="range-select-bar-actions">
        <button
          className="btn btn-primary btn-small"
          onClick={onDone}
          disabled={selectedCount < 1}
        >
          完了
        </button>
        <button className="btn btn-ghost btn-small" onClick={onCancel}>
          キャンセル
        </button>
      </div>
    </div>
  )
}
