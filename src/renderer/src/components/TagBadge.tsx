interface Props {
  name: string
  confidence?: number
}

const TAG_COLORS: Record<string, string> = {
  'ハトマスク': '#e94560',
  '人物': '#4a9eff',
  'プラモデル': '#ff9f43',
  '風景': '#2ed573',
  '食べ物': '#ff6b81',
  '動物': '#a29bfe',
  '建物': '#6c8a9e'
}

const DEFAULT_COLOR = '#6c6c8a'

export function TagBadge({ name, confidence }: Props): JSX.Element {
  const color = TAG_COLORS[name] || DEFAULT_COLOR

  return (
    <span
      className="tag-badge"
      style={{ backgroundColor: color }}
      title={confidence !== undefined ? `${name} (${Math.round(confidence * 100)}%)` : name}
    >
      {name}
    </span>
  )
}
