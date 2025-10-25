import { useState } from 'react'
import './styles/App.css'
import Navbar from './components/Navbar'
import Timeline from './pages/Timeline'
import Albums from './pages/Albums'
import Places from './pages/Places'
import People from './pages/People'
import Memories from './pages/Memories'

type ViewType = 'timeline' | 'albums' | 'places' | 'people' | 'memories'

function App() {
  const [currentView, setCurrentView] = useState<ViewType>('timeline')
  const [photos, setPhotos] = useState<File[]>([])

  const handleImport = (files: File[]) => {
    console.log('Importing files:', files)
    setPhotos(prev => [...prev, ...files])
  }

  const renderView = () => {
    switch(currentView) {
      case 'timeline':
        return <Timeline photos={photos} />
      case 'albums':
        return <Albums photos={photos} />
      case 'places':
        return <Places photos={photos} />
      case 'people':
        return <People photos={photos} />
      case 'memories':
        return <Memories photos={photos} />
      default:
        return <Timeline photos={photos} />
    }
  }

  return (
    <div className="app-container">
      <Navbar 
        activeView={currentView}
        onNavigate={setCurrentView}
        onImport={handleImport} 
      />
      <main>
        {renderView()}
      </main>
    </div>
  )
}

export default App