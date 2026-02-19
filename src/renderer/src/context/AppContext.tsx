import { createContext, useContext, useState, ReactNode } from 'react'
import type { Folder } from '../types/models'

interface AppState {
  currentFolder: Folder | null
  setCurrentFolder: (folder: Folder | null) => void
  isScanning: boolean
  setIsScanning: (scanning: boolean) => void
}

const AppContext = createContext<AppState | null>(null)

export function AppProvider({ children }: { children: ReactNode }): JSX.Element {
  const [currentFolder, setCurrentFolder] = useState<Folder | null>(null)
  const [isScanning, setIsScanning] = useState(false)

  return (
    <AppContext.Provider value={{ currentFolder, setCurrentFolder, isScanning, setIsScanning }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp(): AppState {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be inside AppProvider')
  return ctx
}
