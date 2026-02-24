import { HashRouter, Routes, Route, useLocation } from 'react-router-dom'
import { AppProvider, useApp } from './context/AppContext'
import { HomeScreen } from './screens/HomeScreen'
import { TimelineScreen } from './screens/TimelineScreen'
import { DateDetailScreen } from './screens/DateDetailScreen'
import { GalleryScreen } from './screens/GalleryScreen'
import { EventDetailScreen } from './screens/EventDetailScreen'
import { TagDetailScreen } from './screens/TagDetailScreen'
import { BestCollectionScreen } from './screens/BestCollectionScreen'
import { SlideshowScreen } from './screens/SlideshowScreen'
import { TabBar } from './components/TabBar'

function AppLayout(): JSX.Element {
  const location = useLocation()
  const { loading } = useApp()
  const hideTabBar = location.pathname.startsWith('/slideshow')

  if (loading) {
    return (
      <div className="screen screen-center">
        <p>読み込み中...</p>
      </div>
    )
  }

  return (
    <div className="app-layout">
      <div className="app-content">
        <Routes>
          <Route path="/" element={<HomeScreen />} />
          <Route path="/timeline" element={<TimelineScreen />} />
          <Route path="/timeline/:date" element={<DateDetailScreen />} />
          <Route path="/gallery" element={<GalleryScreen />} />
          <Route path="/gallery/event/:id" element={<EventDetailScreen />} />
          <Route path="/gallery/tag/:name" element={<TagDetailScreen />} />
          <Route path="/gallery/best" element={<BestCollectionScreen />} />
          <Route path="/slideshow" element={<SlideshowScreen />} />
          <Route path="/slideshow/:date" element={<SlideshowScreen />} />
        </Routes>
      </div>
      {!hideTabBar && <TabBar />}
    </div>
  )
}

function App(): JSX.Element {
  return (
    <AppProvider>
      <HashRouter>
        <AppLayout />
      </HashRouter>
    </AppProvider>
  )
}

export default App
