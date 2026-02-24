interface Props {
  date1: string | undefined
  onCancel: () => void
}

export function RangeSelectBar({ date1, onCancel }: Props): JSX.Element {
  return (
    <div className="range-select-bar">
      <span>
        {date1
          ? '2つ目の日付を選んでください'
          : 'できごとの範囲を選んでください（2つの日付をクリック）'}
      </span>
      <button className="btn btn-ghost btn-small" onClick={onCancel}>
        キャンセル
      </button>
    </div>
  )
}
