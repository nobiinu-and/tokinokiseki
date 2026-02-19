import { HashRouter, Routes, Route } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import { FolderSelectScreen } from './screens/FolderSelectScreen'
import { EventListScreen } from './screens/EventListScreen'
import { EventDetailScreen } from './screens/EventDetailScreen'
import { SlideshowScreen } from './screens/SlideshowScreen'

function App(): JSX.Element {
  return (
    <AppProvider>
      <HashRouter>
        <Routes>
          <Route path="/" element={<FolderSelectScreen />} />
          <Route path="/events" element={<EventListScreen />} />
          <Route path="/events/:date" element={<EventDetailScreen />} />
          <Route path="/slideshow" element={<SlideshowScreen />} />
          <Route path="/slideshow/:date" element={<SlideshowScreen />} />
        </Routes>
      </HashRouter>
    </AppProvider>
  )
}

export default App
