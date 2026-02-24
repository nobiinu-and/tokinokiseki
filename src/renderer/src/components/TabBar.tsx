import { useLocation, useNavigate } from 'react-router-dom'

const tabs = [
  { label: 'ホーム', path: '/' },
  { label: 'タイムライン', path: '/timeline' },
  { label: 'ギャラリー', path: '/gallery' }
]

export function TabBar(): JSX.Element {
  const location = useLocation()
  const navigate = useNavigate()

  const isActive = (path: string): boolean => {
    if (path === '/') return location.pathname === '/'
    return location.pathname.startsWith(path)
  }

  return (
    <div className="tab-bar">
      {tabs.map((tab) => (
        <button
          key={tab.path}
          className={`tab-bar-item ${isActive(tab.path) ? 'tab-bar-item-active' : ''}`}
          onClick={() => navigate(tab.path)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
