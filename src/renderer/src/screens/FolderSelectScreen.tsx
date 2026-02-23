import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { useScan } from '../hooks/useScan'
import { ScanProgress } from '../components/ScanProgress'
import type { Folder } from '../types/models'

export function FolderSelectScreen(): JSX.Element {
  const navigate = useNavigate()
  const location = useLocation()
  const { setCurrentFolder, setIsScanning } = useApp()
  const { progress, isScanning, startScan } = useScan()
  const [existingFolders, setExistingFolders] = useState<Folder[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.api.getFolders().then((folders) => {
      setExistingFolders(folders)
      setLoading(false)
      // Auto-navigate only on initial app load, not when user explicitly navigated back
      const cameFromBack = (location.state as { fromBack?: boolean })?.fromBack
      if (folders.length > 0 && !cameFromBack) {
        setCurrentFolder(folders[0])
        navigate('/timeline')
      }
    })
  }, [])

  useEffect(() => {
    setIsScanning(isScanning)
  }, [isScanning, setIsScanning])

  const handleSelectFolder = async (): Promise<void> => {
    const folderPath = await window.api.selectFolder()
    if (!folderPath) return

    const folder: Folder = { id: 0, path: folderPath, lastScannedAt: null }
    setCurrentFolder(folder)
    await startScan(folderPath)

    // After scan, get the actual folder from DB
    const folders = await window.api.getFolders()
    if (folders.length > 0) {
      setCurrentFolder(folders[0])
    }
    navigate('/timeline')
  }

  const handleRescan = async (folder: Folder): Promise<void> => {
    setCurrentFolder(folder)
    await startScan(folder.path)
    navigate('/timeline')
  }

  const handleViewEvents = (folder: Folder): void => {
    setCurrentFolder(folder)
    navigate('/timeline')
  }

  if (loading) {
    return (
      <div className="screen folder-select-screen">
        <div className="folder-select-center">
          <p>読み込み中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="screen folder-select-screen">
      <div className="folder-select-center">
        <div className="app-logo">
          <h1>ときのきせき</h1>
          <p className="app-subtitle">あなたの癒しのギャラリーへ、ようこそ</p>
        </div>

        {isScanning && progress ? (
          <ScanProgress progress={progress} />
        ) : (
          <>
            <button className="btn btn-primary btn-large" onClick={handleSelectFolder}>
              あなたの思い出はどこにありますか？
            </button>

            {existingFolders.length > 0 && (
              <div className="existing-folders">
                <h3>スキャン済みフォルダ</h3>
                {existingFolders.map((folder) => (
                  <div key={folder.id} className="folder-item">
                    <span className="folder-path">{folder.path}</span>
                    <div className="folder-actions">
                      <button
                        className="btn btn-secondary"
                        onClick={() => handleViewEvents(folder)}
                      >
                        表示
                      </button>
                      <button
                        className="btn btn-ghost"
                        onClick={() => handleRescan(folder)}
                      >
                        再スキャン
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
