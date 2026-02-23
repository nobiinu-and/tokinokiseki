import { createContext, useContext, useState, ReactNode } from 'react'

interface AppState {
  timelineId: number | null
  setTimelineId: (id: number | null) => void
  isScanning: boolean
  setIsScanning: (scanning: boolean) => void
}

const AppContext = createContext<AppState | null>(null)

export function AppProvider({ children }: { children: ReactNode }): JSX.Element {
  const [timelineId, setTimelineId] = useState<number | null>(null)
  const [isScanning, setIsScanning] = useState(false)

  return (
    <AppContext.Provider value={{ timelineId, setTimelineId, isScanning, setIsScanning }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp(): AppState {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be inside AppProvider')
  return ctx
}
