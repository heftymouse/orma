import { useState, useEffect } from 'react'
import Navbar from './components/Navbar'
import Timeline from './pages/Timeline'
import Albums from './pages/Albums'
import Places from './pages/Places'
import People from './pages/People'
import Memories from './pages/Memories'
import { DirectoryPicker } from './components/DirectoryPicker'
import type { ImageRecord } from './lib/image-repository'
import { ImageRepositoryProvider, useImageRepository } from './contexts/ImageRepositoryContext'
import { DirectoryProvider, useDirectory } from './contexts/DirectoryContext'
import { importImages, importFiles } from './lib/import'
import { Button } from './components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select'
import { FolderOpen, Files, X } from 'lucide-react'
import { Toaster } from './components/ui/sonner'
import { toast } from 'sonner'

type ViewType = 'timeline' | 'albums' | 'places' | 'people' | 'memories'

function AppContent() {
  const [currentView, setCurrentView] = useState<ViewType>('timeline')
  const [photos, setPhotos] = useState<ImageRecord[]>([])
  const [isImporting, setIsImporting] = useState(false)
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 })
  const [pendingImport, setPendingImport] = useState<{ handle: FileSystemDirectoryHandle, shouldImport: boolean } | null>(null)
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [importType, setImportType] = useState<'directory' | 'files'>('directory')

  const { repository, isInitialized, hasExistingDatabase } = useImageRepository()
  const { directoryHandle, setDirectoryHandle } = useDirectory()

  // Load photos when repository is initialized and directory is set
  useEffect(() => {
    if (isInitialized && repository && directoryHandle && !isImporting) {
      repository.getImages().then((images) => {
        if (images) {
          setPhotos(images)
        }
      })
    }
  }, [isInitialized, repository, directoryHandle, isImporting])

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
      setImportProgress({ current: 0, total: 0 })
      
      try {
        let finalCount = 0;
        
        // Import all images from the directory with progress updates
        await importImages(handle, { 
          repository,
          onProgress: async (current, total) => {
            setImportProgress({ current, total })
            finalCount = current;
            // Refresh photos every 15 images or at completion
            if (current === total || current % 15 === 0) {
              const images = await repository.getImages()
              if (images) {
                setPhotos(images)
              }
            }
          }
        })
        
        // Final reload of photos from repository
        const images = await repository.getImages()
        if (images) {
          setPhotos(images)
        }
        
        toast.success('Import complete!', {
          description: `Successfully imported ${finalCount} photo${finalCount !== 1 ? 's' : ''}`
        })
      } catch (error) {
        console.error('Failed to import images:', error)
        toast.error('Import failed', {
          description: error instanceof Error ? error.message : 'An unknown error occurred'
        })
      } finally {
        // Small delay before hiding progress bar so user sees completion
        setTimeout(() => {
          setIsImporting(false)
          setImportProgress({ current: 0, total: 0 })
        }, 500)
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
      toast.error('Cannot eject library', {
        description: 'Repository or directory not available'
      })
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
        toast.error('Permission denied', {
          description: 'Write permission was denied for the directory'
        })
        return
      }
      
      // Write the database to the file
      const writable = await fileHandle.createWritable()
      await writable.write(new Uint8Array(dbData))
      await writable.close()
      
      console.log('Database exported to orma.sqlite3')
      toast.success('Library ejected successfully', {
        description: 'Your changes have been saved.'
      })
    } catch (error) {
      console.error('Failed to eject library:', error)
      toast.error('Failed to eject library', {
        description: error instanceof Error ? error.message : 'An unknown error occurred'
      })
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
        setImportProgress({ current: 0, total: 0 })
        
        let finalCount = 0;
        
        // Pass directoryHandle as target to copy the imported directory
        await importImages(importDirHandle, { 
          repository,
          onProgress: async (current, total) => {
            setImportProgress({ current, total })
            finalCount = current;
            // Refresh photos every 15 images or at completion
            if (current === total || current % 15 === 0) {
              const images = await repository.getImages()
              if (images) {
                setPhotos(images)
              }
            }
          }
        }, directoryHandle)
        
        // Final reload photos from repository
        const images = await repository.getImages()
        if (images) {
          setPhotos(images)
        }
        
        toast.success('Import complete!', {
          description: `Successfully imported ${finalCount} photo${finalCount !== 1 ? 's' : ''}`
        })
      } else {
        // Import individual files
        const input = document.createElement('input')
        input.type = 'file'
        input.multiple = true
        input.accept = 'image/*'
        
        input.onchange = async () => {
          if (!input.files || input.files.length === 0) return
          
          const fileCount = input.files.length;
          setIsImporting(true)
          setImportProgress({ current: 0, total: fileCount })
          
          try {
            const files = Array.from(input.files)
            await importFiles(files, directoryHandle, repository)
            
            // Reload photos from repository
            const images = await repository.getImages()
            if (images) {
              setPhotos(images)
            }
            
            toast.success('Import complete!', {
              description: `Successfully imported ${fileCount} file${fileCount !== 1 ? 's' : ''}`
            })
          } catch (error) {
            console.error('Failed to import files:', error)
            toast.error('Import failed', {
              description: error instanceof Error ? error.message : 'An unknown error occurred'
            })
          } finally {
            // Small delay before hiding progress bar so user sees completion
            setTimeout(() => {
              setIsImporting(false)
              setImportProgress({ current: 0, total: 0 })
            }, 500)
          }
        }
        
        input.click()
      }
    } catch (error) {
      console.error('Failed to import:', error)
      toast.error('Import failed', {
        description: error instanceof Error ? error.message : 'An unknown error occurred'
      })
    } finally {
      // Small delay before hiding progress bar so user sees completion
      setTimeout(() => {
        setIsImporting(false)
        setImportProgress({ current: 0, total: 0 })
      }, 500)
    }
  }

  // Show directory picker if no directory is selected
  if (!directoryHandle) {
    return <DirectoryPicker onDirectorySelected={handleDirectorySelected} />
  }

  const renderView = () => {
    switch(currentView) {
      case 'timeline':
        return <Timeline photos={photos} />
      case 'albums':
        return <Albums />
      case 'places':
        return <Places photos={photos} />
      case 'people':
        return <People photos={photos} />
      case 'memories':
        return <Memories />
      default:
        return <Timeline photos={photos} />
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Toaster />
      <Navbar 
        activeView={currentView}
        onNavigate={setCurrentView}
        onChangeDirectory={handleChangeDirectory}
        onEject={handleEject}
        onImport={handleImport}
        repository={repository}
      />
      
      {/* Import Progress Bar */}
      {isImporting && importProgress.total > 0 && importProgress.current < importProgress.total && (
        <div className="fixed top-16 left-0 right-0 z-40 bg-white border-b border-gray-200 shadow-sm">
          <div className="max-w-7xl mx-auto p-4">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">
                    Importing photos...
                  </span>
                  <span className="text-sm text-gray-600">
                    {importProgress.current} / {importProgress.total}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                  />
                </div>
              </div>
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
            </div>
          </div>
        </div>
      )}
      
      <main className={`max-w-7xl mx-auto p-4 ${isImporting && importProgress.total > 0 ? 'mt-20' : ''}`}>
        {isInitialized ? renderView() : (
          <div className="flex items-center justify-center h-64">
            <p className="text-gray-500">Initializing image repository...</p>
          </div>
        )}
      </main>

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