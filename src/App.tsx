import { useState, useEffect } from 'react'
import Navbar from './components/Navbar'
import Timeline from './pages/Timeline'
import Albums from './pages/Albums'
import Places from './pages/Places'
import People from './pages/People'
import Memories from './pages/Memories'
import ImageLightbox from './components/ImageLightbox'
import { DirectoryPicker } from './components/DirectoryPicker'
import type { ImageRecord } from './lib/image-repository'
import { ImageRepositoryProvider, useImageRepository } from './contexts/ImageRepositoryContext'
import { DirectoryProvider, useDirectory } from './contexts/DirectoryContext'
import { importImages } from './lib/import'

type ViewType = 'timeline' | 'albums' | 'places' | 'people' | 'memories'

function AppContent() {
  const [currentView, setCurrentView] = useState<ViewType>('timeline')
  const [photos, setPhotos] = useState<ImageRecord[]>([])
  const [isImporting, setIsImporting] = useState(false)
  // selected photo for lightbox
  const [selectedPhoto, setSelectedPhoto] = useState<ImageRecord | null>(null)
  const [selectedPhotoUrl, setSelectedPhotoUrl] = useState<string | null>(null)

  const { repository, isInitialized, hasExistingDatabase } = useImageRepository()
  const { directoryHandle, setDirectoryHandle } = useDirectory()

  // Load photos when repository is initialized and directory is set
  useEffect(() => {
    if (isInitialized && repository && directoryHandle) {
      repository.getImages().then((images) => {
        if (images) {
          setPhotos(images)
        }
      })
    }
  }, [isInitialized, repository, directoryHandle])

  const handleDirectorySelected = async (handle: FileSystemDirectoryHandle) => {
    setDirectoryHandle(handle)
    
    if (!repository) return
    
    // Fast path: if database was found, skip importing and just load photos
    if (hasExistingDatabase) {
      console.log('Using existing database, skipping import');
      const images = await repository.getImages()
      if (images) {
        setPhotos(images)
      }
      return
    }
    
    // Slow path: no database found, need to import all images
    console.log('No database found, importing images...');
    setIsImporting(true)
    try {
      // Import all images from the directory
      await importImages(handle, { repository })
      
      // Reload photos from repository
      const images = await repository.getImages()
      if (images) {
        setPhotos(images)
      }
    } catch (error) {
      console.error('Failed to import images:', error)
    } finally {
      setIsImporting(false)
    }
  }

  const handleChangeDirectory = async () => {
    try {
      // @ts-ignore - showDirectoryPicker is not yet in TypeScript types
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' })
      await handleDirectorySelected(handle)
    } catch (error) {
      console.error('Failed to pick directory:', error)
    }
  }

  const handleEject = async () => {
    if (!repository || !directoryHandle) {
      console.error('Cannot eject: repository or directory not available')
      return
    }

    try {
      // Export the database to Uint8Array
      const dbData = await repository.exportDatabase()
      
      // Request permission to save to the directory
      const fileHandle = await directoryHandle.getFileHandle('orma.sqlite3', { create: true })
      
      // Request write permission
      // @ts-ignore - requestPermission is not yet in standard TypeScript types
      const permission = await fileHandle.requestPermission?.({ mode: 'readwrite' })
      if (permission && permission !== 'granted') {
        console.error('Write permission denied')
        return
      }
      
      // Write the database to the file
      const writable = await fileHandle.createWritable()
      await writable.write(new Uint8Array(dbData))
      await writable.close()
      
      console.log('Database exported to orma.sqlite3')
    } catch (error) {
      console.error('Failed to eject database:', error)
    }
  }

  const handleOpenPhoto = async (photo: ImageRecord, src: string) => {
    setSelectedPhoto(photo)
    setSelectedPhotoUrl(src)
  }

  const handleClose = () => {
    setSelectedPhoto(null)
    if (selectedPhotoUrl) {
      setSelectedPhotoUrl(null)
    }
  }

  // Show directory picker if no directory is selected
  if (!directoryHandle) {
    return <DirectoryPicker onDirectorySelected={handleDirectorySelected} />
  }

  // Show loading state during import
  if (isImporting) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Importing photos...</p>
        </div>
      </div>
    )
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
        onChangeDirectory={handleChangeDirectory}
        onEject={handleEject}
        repository={repository}
      />
      <main className="max-w-7xl mx-auto p-4">
        {isInitialized ? renderView() : (
          <div className="flex items-center justify-center h-64">
            <p className="text-gray-500">Initializing image repository...</p>
          </div>
        )}
      </main>

      {/* Lightbox rendered at top level so it overlays entire app */}
      {selectedPhoto && selectedPhotoUrl && (
        <ImageLightbox
          src={selectedPhotoUrl}
          photo={selectedPhoto}
          onClose={handleClose}
        />
      )}
    </div>
  )
}

function App() {
  return (
    <DirectoryProvider>
      <ImageRepositoryProvider>
        <AppContent />
      </ImageRepositoryProvider>
    </DirectoryProvider>
  )
}

export default App