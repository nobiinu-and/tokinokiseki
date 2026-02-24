interface Props {
  eventTitle: string
  selectedCount: number
  onConfirm: () => void
  onCancel: () => void
}

export function AddDatesBar({
  eventTitle,
  selectedCount,
  onConfirm,
  onCancel
}: Props): JSX.Element {
  return (
    <div className="range-select-bar">
      <span>
        「{eventTitle}」に日付を追加（クリックで選択）
        {selectedCount > 0 && <strong>　{selectedCount}日選択中</strong>}
      </span>
      <div className="range-select-bar-actions">
        <button
          className="btn btn-primary btn-small"
          onClick={onConfirm}
          disabled={selectedCount === 0}
        >
          追加
        </button>
        <button className="btn btn-ghost btn-small" onClick={onCancel}>
          キャンセル
        </button>
      </div>
    </div>
  )
}
