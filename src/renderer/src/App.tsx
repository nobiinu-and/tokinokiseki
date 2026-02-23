import { HashRouter, Routes, Route } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import { FolderSelectScreen } from './screens/FolderSelectScreen'
import { TimelineScreen } from './screens/TimelineScreen'
import { DateDetailScreen } from './screens/DateDetailScreen'
import { SlideshowScreen } from './screens/SlideshowScreen'
import { TagSearchScreen } from './screens/TagSearchScreen'

function App(): JSX.Element {
  return (
    <AppProvider>
      <HashRouter>
        <Routes>
          <Route path="/" element={<FolderSelectScreen />} />
          <Route path="/timeline" element={<TimelineScreen />} />
          <Route path="/timeline/:date" element={<DateDetailScreen />} />
          <Route path="/tags" element={<TagSearchScreen />} />
          <Route path="/slideshow" element={<SlideshowScreen />} />
          <Route path="/slideshow/:date" element={<SlideshowScreen />} />
        </Routes>
      </HashRouter>
    </AppProvider>
  )
}

export default App
