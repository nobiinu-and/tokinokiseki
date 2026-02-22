interface Props {
  name: string
  confidence?: number
}

export const TAG_COLORS: Record<string, string> = {
  // Legacy + shared
  'ハトマスク': '#e94560',
  '人物': '#4a9eff',
  'プラモデル': '#ff9f43',
  '風景': '#2ed573',
  '食べ物': '#ff6b81',
  '動物': '#a29bfe',
  '建物': '#6c8a9e',
  // Scene tags
  '屋外': '#27ae60',
  '屋内': '#8e44ad',
  'パーティー': '#e74c3c',
  '夜景': '#3f51b5',
  '夕焼け': '#ff5722',
  '食事': '#e91e63',
  '旅行': '#009688',
  'スポーツ': '#ff9800',
  // YOLO object tags
  '犬': '#8d6e63',
  '猫': '#ab47bc',
  '車': '#5c6bc0',
  '自転車': '#66bb6a',
  '電車': '#42a5f5',
  '鳥': '#78909c'
}

export const DEFAULT_COLOR = '#6c6c8a'

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
