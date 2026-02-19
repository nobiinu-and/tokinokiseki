interface Props {
  title: string
  onBack?: () => void
  actions?: React.ReactNode
}

export function TopBar({ title, onBack, actions }: Props): JSX.Element {
  return (
    <div className="topbar">
      <div className="topbar-left">
        {onBack && (
          <button className="topbar-back" onClick={onBack}>
            ← 戻る
          </button>
        )}
        <h1 className="topbar-title">{title}</h1>
      </div>
      {actions && <div className="topbar-actions">{actions}</div>}
    </div>
  )
}
