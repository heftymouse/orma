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
import { importImages, importFiles } from './lib/import'
import { Button } from './components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select'
import { FolderOpen, Files, X } from 'lucide-react'

type ViewType = 'timeline' | 'albums' | 'places' | 'people' | 'memories'

function AppContent() {
  const [currentView, setCurrentView] = useState<ViewType>('timeline')
  const [photos, setPhotos] = useState<ImageRecord[]>([])
  const [isImporting, setIsImporting] = useState(false)
  const [pendingImport, setPendingImport] = useState<{ handle: FileSystemDirectoryHandle, shouldImport: boolean } | null>(null)
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [importType, setImportType] = useState<'directory' | 'files'>('directory')
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

  // Handle pending import after repository is initialized
  useEffect(() => {
    const handlePendingImport = async () => {
      if (!pendingImport || !repository || !isInitialized) return;

      const { handle, shouldImport } = pendingImport;
      setPendingImport(null); // Clear pending import

      // Fast path: if database was found, skip importing and just load photos
      if (hasExistingDatabase) {
        console.log('Using existing database, skipping import');
        const images = await repository.getImages()
        if (images) {
          setPhotos(images)
        }
        return
      }

      // No database found - check if user wants to import
      if (!shouldImport) {
        console.log('No database found, user chose not to import');
        return
      }

      // Slow path: no database found, import all images
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
    };

    handlePendingImport();
  }, [pendingImport, repository, isInitialized, hasExistingDatabase]);

  const handleDirectorySelected = async (handle: FileSystemDirectoryHandle, shouldImport: boolean = true) => {
    setDirectoryHandle(handle)
    setPendingImport({ handle, shouldImport })
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

  const handleImport = async () => {
    if (!repository || !directoryHandle) {
      console.error('Cannot import: repository or directory not available')
      return
    }

    // Show import dialog
    setShowImportDialog(true)
  }

  const handleImportConfirm = async () => {
    if (!repository || !directoryHandle) {
      return
    }

    setShowImportDialog(false)

    try {
      if (importType === 'directory') {
        // Import from directory
        // @ts-ignore - showDirectoryPicker is not yet in TypeScript types
        const importDirHandle = await window.showDirectoryPicker({ mode: 'read' })
        
        setIsImporting(true)
        // Pass directoryHandle as target to copy the imported directory
        await importImages(importDirHandle, { repository }, directoryHandle)
        
        // Reload photos from repository
        const images = await repository.getImages()
        if (images) {
          setPhotos(images)
        }
      } else {
        // Import individual files
        const input = document.createElement('input')
        input.type = 'file'
        input.multiple = true
        input.accept = 'image/*'
        
        input.onchange = async () => {
          if (!input.files || input.files.length === 0) return
          
          setIsImporting(true)
          try {
            const files = Array.from(input.files)
            await importFiles(files, directoryHandle, repository)
            
            // Reload photos from repository
            const images = await repository.getImages()
            if (images) {
              setPhotos(images)
            }
          } catch (error) {
            console.error('Failed to import files:', error)
          } finally {
            setIsImporting(false)
          }
        }
        
        input.click()
      }
    } catch (error) {
      console.error('Failed to import:', error)
    } finally {
      setIsImporting(false)
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
        onImport={handleImport}
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

      {/* Import Dialog */}
      {showImportDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full m-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Import Photos</h3>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowImportDialog(false)}
              >
                <X size={16} />
              </Button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                  Choose import source:
                </label>
                <Select value={importType} onValueChange={(value: 'directory' | 'files') => setImportType(value)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="directory">
                      <div className="flex items-center gap-2">
                        <FolderOpen size={16} />
                        <span>Directory (with subfolders)</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="files">
                      <div className="flex items-center gap-2">
                        <Files size={16} />
                        <span>Individual Files</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <p className="text-sm text-gray-600">
                {importType === 'directory' 
                  ? 'Select a directory to import all photos and subdirectories. They will be copied to your library.'
                  : 'Select one or more individual files to import. They will be copied to your library.'}
              </p>

              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={() => setShowImportDialog(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleImportConfirm}
                >
                  Continue
                </Button>
              </div>
            </div>
          </div>
        </div>
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