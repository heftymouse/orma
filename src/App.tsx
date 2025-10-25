import { useState } from 'react'
import Navbar from './components/Navbar'
import Timeline from './pages/Timeline'
import Albums from './pages/Albums'
import Places from './pages/Places'
import People from './pages/People'
import Memories from './pages/Memories'
import ImageLightbox from './components/ImageLightbox'
import type { ImageFileMetadata } from './lib/utils'

type ViewType = 'timeline' | 'albums' | 'places' | 'people' | 'memories'

function App() {
  const [currentView, setCurrentView] = useState<ViewType>('timeline')
  const [photos, setPhotos] = useState<ImageFileMetadata[]>([])
  // selected photo for lightbox
  const [selected, setSelected] = useState<{ src: string; photo: ImageFileMetadata } | null>(null)

  const handleImport = (files: ImageFileMetadata[]) => {
    console.log('Importing files:', files)
    setPhotos(prev => [...prev, ...files])
  }

  const handleOpenPhoto = (photo: ImageFileMetadata, src: string) => {
    setSelected({ photo, src })
  }

  const handleClose = () => {
    setSelected(null)
  }

  const renderView = () => {
    switch(currentView) {
      case 'timeline':
        return <Timeline photos={photos} onImageClick={handleOpenPhoto} />
      case 'albums':
        return <Albums photos={photos} />
      case 'places':
        return <Places photos={photos} />
      case 'people':
        return <People photos={photos} />
      case 'memories':
        return <Memories photos={photos} />
      default:
        return <Timeline photos={photos} onImageClick={handleOpenPhoto} />
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar 
        activeView={currentView}
        onNavigate={setCurrentView}
        onImport={handleImport} 
      />
      <main className="max-w-7xl mx-auto p-4">
        {renderView()}
      </main>

      {/* Lightbox rendered at top level so it overlays entire app */}
      {selected && (
        <ImageLightbox
          src={selected.src}
          file={selected.photo.file}
          metadata={selected.photo.metadata}
          onClose={handleClose}
        />
      )}
    </div>
  )
}

export default App