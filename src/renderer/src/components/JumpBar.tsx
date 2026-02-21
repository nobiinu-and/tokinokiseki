interface JumpBarProps {
  years: { year: number; groupIndex: number }[]
  onJump: (groupIndex: number) => void
}

export function JumpBar({ years, onJump }: JumpBarProps): JSX.Element {
  return (
    <div className="jump-bar">
      {years.map(({ year, groupIndex }) => (
        <button
          key={year}
          className="jump-bar-item"
          onClick={() => onJump(groupIndex)}
        >
          {year}
        </button>
      ))}
    </div>
  )
}
