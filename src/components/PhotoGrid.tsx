import type { ImageRecord, Album } from '@/lib/image-repository'
import { useState, useEffect, useMemo, useRef } from 'react'
import { useDirectory } from '@/contexts/DirectoryContext'
import { useImageRepository } from '@/contexts/ImageRepositoryContext'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Plus, FolderPlus, X, ListChecks, Star, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import ImageLightbox from './ImageLightbox'

interface PhotoGridProps {
  photos: ImageRecord[]
  emptyMessage?: string
  showCount?: boolean
  countLabel?: string
  actions?: Record<string, (selectedPhotoIds: number[]) => void | Promise<void>>
  topPaddingLarge?: boolean
}

interface GroupedPhotos {
  [monthKey: string]: {
    photos: ImageRecord[]
    monthLabel: string
  }
}

const PhotoGrid = ({
  photos,
  emptyMessage = "No photos yet. Click Import to add photos.",
  showCount = true,
  countLabel = "photo",
  actions = {},
  topPaddingLarge = true
}: PhotoGridProps) => {
  const [imageUrls, setImageUrls] = useState<Map<number, string>>(new Map())
  // Keep a local copy of photos for view updates (e.g., when unfavouriting while viewing favourites)
  const [displayedPhotos, setDisplayedPhotos] = useState<ImageRecord[]>(photos)
  const [selectedPhotos, setSelectedPhotos] = useState<Set<number>>(new Set())
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [albums, setAlbums] = useState<Album[]>([])
  const [showAlbumDialog, setShowAlbumDialog] = useState(false)
  const [isCreatingAlbum, setIsCreatingAlbum] = useState(false)
  const [newAlbumName, setNewAlbumName] = useState('')
  const [newAlbumError, setNewAlbumError] = useState<string | null>(null)
  const [selectedPhoto, setSelectedPhoto] = useState<ImageRecord | null>(null)
  const [selectedPhotoUrl, setSelectedPhotoUrl] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [favouritePhotoIds, setFavouritePhotoIds] = useState<Set<number>>(new Set())

  // For lightbox navigation
  const [lightboxPhotos, setLightboxPhotos] = useState<ImageRecord[]>([])
  const [lightboxIndex, setLightboxIndex] = useState<number>(0)

  // Refs for drag-to-select (marquee)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const dragRef = useRef({
    startX: 0,
    startY: 0,
    dragging: false,
    thresholdExceeded: false,
    initialSelected: new Set<number>() as Set<number>
  })
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null)

  const { createBlobUrl } = useDirectory()
  const { repository } = useImageRepository()

  // Dispatch event name for favourites updates
  const FAV_EVENT = 'favourites-updated'

  // Sort displayedPhotos by date and group by month
  const groupedPhotos = useMemo(() => {
    // Sort photos by date (newest first)
    const sortedPhotos = [...displayedPhotos].sort((a, b) => {
      const dateA = a.dateTimeOriginal ? new Date(a.dateTimeOriginal).getTime() : 0
      const dateB = b.dateTimeOriginal ? new Date(b.dateTimeOriginal).getTime() : 0
      return dateB - dateA
    })

    // Group by month
    const grouped: GroupedPhotos = {}

    sortedPhotos.forEach(photo => {
      if (photo.dateTimeOriginal) {
        const date = new Date(photo.dateTimeOriginal)
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
        const monthLabel = date.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long'
        })

        if (!grouped[monthKey]) {
          grouped[monthKey] = {
            photos: [],
            monthLabel
          }
        }

        grouped[monthKey].photos.push(photo)
      }
    })

    return grouped
  }, [displayedPhotos])

  useEffect(() => {
    // sync displayedPhotos when parent photos prop changes
    setDisplayedPhotos(photos)

    const loadImageUrls = async () => {
      const urlMap = new Map<number, string>()

      for (const photo of photos) {
        if (photo.id) {
          const url = await createBlobUrl(photo.path)
          if (url) {
            urlMap.set(photo.id, url)
          }
        }
      }

      setImageUrls(urlMap)
    }

    loadImageUrls()

    // Cleanup URLs on unmount or when photos change
    return () => {
      imageUrls.forEach(url => URL.revokeObjectURL(url))
    }
  }, [photos, createBlobUrl])


  useEffect(() => {
    const loadAlbums = async () => {
      if (repository) {
        try {
          const albumList = await repository.getAlbums()
          setAlbums(albumList)
        } catch (error) {
          console.error('Failed to load albums:', error)
        }
      }
    }

    loadAlbums()
  }, [repository])

  // Load favourite photo IDs
  useEffect(() => {
    const loadFavourites = async () => {
      if (!repository) return

      try {
        const favouritesAlbum = await repository.getFavouritesAlbum()
        if (favouritesAlbum?.id) {
          const favouritePhotos = await repository.getAlbumImages(favouritesAlbum.id)
          const favIds = new Set(favouritePhotos.map(p => p.id).filter((id): id is number => id !== undefined))
          setFavouritePhotoIds(favIds)
        }
      } catch (error) {
        console.error('Failed to load favourites:', error)
      }
    }

    loadFavourites()
  }, [repository, photos]) // Re-load when photos change

  // Keep selection in sync with current photos: remove any selected ids that no longer exist
  useEffect(() => {
    const currentIds = new Set(displayedPhotos.filter(p => p.id).map(p => p.id as number))
    setSelectedPhotos(prev => {
      const next = new Set(Array.from(prev).filter(id => currentIds.has(id)))
      if (next.size === 0 && isSelectionMode) setIsSelectionMode(false)
      return next
    })
  }, [displayedPhotos, isSelectionMode])

  // Exit selection mode with Escape key
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        if (isSelectionMode) {
          setIsSelectionMode(false)
          setSelectedPhotos(new Set())
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isSelectionMode])

  const handlePhotoClick = (photo: ImageRecord, url: string) => {
    if (isSelectionMode) {
      handlePhotoSelect(photo.id!)
    } else {
      // Compute month group
      const monthKey = photo.dateTimeOriginal
        ? `${new Date(photo.dateTimeOriginal).getFullYear()}-${String(new Date(photo.dateTimeOriginal).getMonth() + 1).padStart(2, '0')}`
        : null
      const groupPhotos = monthKey && groupedPhotos[monthKey]
        ? groupedPhotos[monthKey].photos
        : [photo]
      setLightboxPhotos(groupPhotos)
      setLightboxIndex(groupPhotos.findIndex(p => p.id === photo.id))
      setSelectedPhoto(photo)
      setSelectedPhotoUrl(url)
    }
  }

  // Helpers for marquee selection
  const rectsIntersect = (r1: { left: number; top: number; right: number; bottom: number }, r2: { left: number; top: number; right: number; bottom: number }) => {
    return !(r1.left > r2.right || r1.right < r2.left || r1.top > r2.bottom || r1.bottom < r2.top)
  }

  const updateSelectionFromMarquee = (m: { x: number; y: number; w: number; h: number }, options?: { add?: boolean }) => {
    const container = containerRef.current
    if (!container) return

    const containerRect = container.getBoundingClientRect()
    const marqueeRect = {
      left: m.x,
      top: m.y,
      right: m.x + m.w,
      bottom: m.y + m.h
    }

    const matchedIds: number[] = []
    for (const [id, el] of itemRefs.current.entries()) {
      if (!el) continue
      const r = el.getBoundingClientRect()
      // convert to container-relative coords
      const rel = {
        left: r.left - containerRect.left,
        top: r.top - containerRect.top,
        right: r.right - containerRect.left,
        bottom: r.bottom - containerRect.top
      }
      if (rectsIntersect(rel, marqueeRect)) matchedIds.push(id)
    }

    setSelectedPhotos(prev => {
      const base = options?.add ? new Set(prev) : new Set<number>()
      matchedIds.forEach(id => base.add(id))
      // Enter selection mode if anything selected
      if (base.size > 0) setIsSelectionMode(true)
      return base
    })
  }

  // Mouse handlers for marquee drag selection
  const onMouseDownHandler = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return // only left click
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    dragRef.current.startX = x
    dragRef.current.startY = y
    dragRef.current.dragging = false
    dragRef.current.thresholdExceeded = false
    dragRef.current.initialSelected = new Set(selectedPhotos)
  }

  const onMouseMoveHandler = (e: React.MouseEvent<HTMLDivElement>) => {
    // only proceed while left button is pressed
    if (e.buttons !== 1) return
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const dx = x - dragRef.current.startX
    const dy = y - dragRef.current.startY

    if (!dragRef.current.thresholdExceeded) {
      if (Math.hypot(dx, dy) > 5) {
        dragRef.current.thresholdExceeded = true
        dragRef.current.dragging = true
        document.body.style.userSelect = 'none'
      } else {
        return
      }
    }

    const left = Math.min(dragRef.current.startX, x)
    const top = Math.min(dragRef.current.startY, y)
    const w = Math.abs(x - dragRef.current.startX)
    const h = Math.abs(y - dragRef.current.startY)
    setMarquee({ x: left, y: top, w, h })

    // Update selection; hold Ctrl/Cmd to add to existing selection
    updateSelectionFromMarquee({ x: left, y: top, w, h }, { add: e.ctrlKey || e.metaKey })
  }

  const finishDrag = () => {
    if (dragRef.current.dragging) {
      dragRef.current.dragging = false
      dragRef.current.thresholdExceeded = false
      setMarquee(null)
      document.body.style.userSelect = ''
    }
  }

  const onMouseUpHandler = () => {
    finishDrag()
  }

  const onMouseLeaveHandler = () => {
    finishDrag()
  }

  const handlePhotoSelect = (photoId: number) => {
    setSelectedPhotos(prev => {
      const newSet = new Set(prev)
      if (newSet.has(photoId)) {
        newSet.delete(photoId)
        if (newSet.size === 0) {
          setIsSelectionMode(false)
        }
      } else {
        newSet.add(photoId)
      }
      return newSet
    })
  }

  const handleLongPress = (photoId: number) => {
    if (!isSelectionMode) {
      setIsSelectionMode(true)
      setSelectedPhotos(new Set([photoId]))
    }
  }

  const exitSelectionMode = () => {
    setIsSelectionMode(false)
    setSelectedPhotos(new Set())
  }

  const selectAll = () => {
    const allPhotoIds = displayedPhotos.filter(p => p.id).map(p => p.id!)
    setSelectedPhotos(new Set(allPhotoIds))
  }

  const handleMonthSelect = (monthPhotos: ImageRecord[]) => {
    const monthPhotoIds = monthPhotos.filter(p => p.id).map(p => p.id!)
    const allSelected = monthPhotoIds.every(id => selectedPhotos.has(id))

    setSelectedPhotos(prev => {
      if (allSelected) {
        let newSet = new Set(prev)
        monthPhotoIds.forEach(id => newSet.delete(id))
        if (newSet.size === 0) {
          setIsSelectionMode(false)
        }
        return newSet
      } else {
        let newSet = new Set(prev)
        monthPhotoIds.forEach(id => newSet.add(id))
        if (!isSelectionMode) {
          setIsSelectionMode(true)
        }
        return newSet
      }
    })
  }

  // Add to album with albums refresh to update count
  const handleAddToAlbum = async (albumId: number) => {
    if (!repository || selectedPhotos.size === 0) return

    try {
      await repository.addImagesToAlbum(albumId, Array.from(selectedPhotos))
      setShowAlbumDialog(false)
      exitSelectionMode()
      console.log(`Added ${selectedPhotos.size} photos to album`)

      const updatedAlbums = await repository.getAlbums()
      setAlbums(updatedAlbums)
    } catch (error) {
      console.error('Failed to add photos to album:', error)
    }
  }

  const handleCloseLightbox = () => {
    setSelectedPhoto(null)
    setSelectedPhotoUrl(null)
  }

  // Create album logic unchanged
  const handleCreateAlbum = async () => {
    if (!repository || !newAlbumName.trim() || selectedPhotos.size === 0) return

    const trimmed = newAlbumName.trim()

    const duplicate = albums.some(a => a.name.toLowerCase() === trimmed.toLowerCase())
    if (duplicate) {
      setNewAlbumError('An album with this name already exists')
      return
    }

    try {
      setIsCreatingAlbum(true)
      setNewAlbumError(null)
      const albumId = await repository.createAlbum({
        name: trimmed,
        description: `Album with ${selectedPhotos.size} photos`
      })

      await repository.addImagesToAlbum(albumId, Array.from(selectedPhotos))

      const updatedAlbums = await repository.getAlbums()
      setAlbums(updatedAlbums)

      setNewAlbumName('')
      setShowAlbumDialog(false)
      exitSelectionMode()
      console.log(`Created album "${trimmed}" with ${selectedPhotos.size} photos`)
    } catch (error: any) {
      if (error && /album/i.test(String(error.message)) && /exist/i.test(String(error.message))) {
        setNewAlbumError('An album with this name already exists')
      } else {
        console.error('Failed to create album:', error)
      }
    } finally {
      setIsCreatingAlbum(false)
    }
  }

  // Delete photos and refresh albums for count update
  const handleDeletePhotos = async () => {
    if (!repository || selectedPhotos.size === 0) return

    const ok = window.confirm(`Delete ${selectedPhotos.size} photo${selectedPhotos.size !== 1 ? 's' : ''}? This cannot be undone.`)
    if (!ok) return

    try {
      setIsProcessing(true)
      await repository.deleteImagesByIds(Array.from(selectedPhotos))
      exitSelectionMode()

      if (repository) {
        const updatedAlbums = await repository.getAlbums()
        setAlbums(updatedAlbums)
      }

      window.location.reload()
    } catch (error) {
      console.error('Failed to delete photos:', error)
    } finally {
      setIsProcessing(false)
    }
  }

  // Toggle favourites with instant UI update
  const handleToggleFavourites = async () => {
    if (!repository || selectedPhotos.size === 0) return

    try {
      setIsProcessing(true)
      const selectedArray = Array.from(selectedPhotos)
      const allAreFavourites = selectedArray.every(id => favouritePhotoIds.has(id))

      setFavouritePhotoIds(prev => {
        const copy = new Set(prev)
        if (allAreFavourites) {
          selectedArray.forEach(id => copy.delete(id))
        } else {
          selectedArray.forEach(id => copy.add(id))
        }
        return copy
      })

      if (allAreFavourites) {
        // remove from favourites in repository
        await repository.removeFromFavourites(selectedArray)

        // remove from current view immediately (useful when viewing the favourites album)
        setDisplayedPhotos(prev => prev.filter(p => !(p.id && selectedArray.includes(p.id))))

        // cleanup imageUrls for removed photos
        setImageUrls(prev => {
          const next = new Map(prev)
          selectedArray.forEach(id => {
            const url = next.get(id)
            if (url) {
              try { URL.revokeObjectURL(url) } catch { }
            }
            next.delete(id)
          })
          return next
        })
      } else {
        const nonFavourites = selectedArray.filter(id => !favouritePhotoIds.has(id))
        if (nonFavourites.length > 0) {
          await repository.addToFavourites(nonFavourites)
        }
      }

      const favouritesAlbum = await repository.getFavouritesAlbum()
      if (favouritesAlbum?.id) {
        const favouritePhotos = await repository.getAlbumImages(favouritesAlbum.id)
        const favIds = new Set(favouritePhotos.map(p => p.id).filter((id): id is number => id !== undefined))
        setFavouritePhotoIds(favIds)
      }

      // Refresh albums list so counts in dialogs stay accurate
      try {
        const updatedAlbums = await repository.getAlbums()
        setAlbums(updatedAlbums)
      } catch (err) {
        console.warn('Failed to refresh albums after toggling favourites', err)
      }

      // Notify other parts of the app that favourites changed so they can refresh (Albums page listens for this)
      try {
        const ev = new CustomEvent('favourites-updated', { detail: { removed: selectedArray } })
        window.dispatchEvent(ev)
      } catch (err) {
        // ignore
      }

      exitSelectionMode()
      console.log(`Updated favourites for ${selectedPhotos.size} photo(s)`)
    } catch (error) {
      console.error('Failed to toggle favourites:', error)
    } finally {
      setIsProcessing(false)
    }
  }

  const hasPhotos = Object.keys(groupedPhotos).length > 0

  return (
    <div
      className='relative'
      ref={containerRef}
      onMouseDown={onMouseDownHandler}
      onMouseMove={onMouseMoveHandler}
      onMouseUp={onMouseUpHandler}
      onMouseLeave={onMouseLeaveHandler}
    >
      {/* Marquee overlay for drag selection */}
      {marquee && (
        <div
          className="pointer-events-none z-50 border-2 border-blue-400 bg-blue-400/20 rounded-sm"
          style={{
            position: 'absolute',
            left: `${marquee.x}px`,
            top: `${marquee.y}px`,
            width: `${marquee.w}px`,
            height: `${marquee.h}px`
          }}
        />
      )}
      {showCount && (
        <div className="flex items-center justify-between mb-6">
          <p className="text-sm text-muted-foreground">
            {displayedPhotos.length} {countLabel}{displayedPhotos.length !== 1 ? 's' : ''} imported
          </p>
        </div>
      )}

      {/* Selection Mode Header */}
      {isSelectionMode && (
        <div className="sticky top-20 left-0 w-full z-50 bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">
                {selectedPhotos.size} photo{selectedPhotos.size !== 1 ? 's' : ''} selected
              </span>
              <Button variant="ghost" size="sm" onClick={selectAll}>
                <ListChecks size={16} />
                Select All
              </Button>
            </div>
            <div className='flex items-center gap-2'>
              {selectedPhotos.size > 0 && (
                <>
                  {Object.entries(actions).map(([name, fn]) => (
                    <Button
                      key={name}
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        try {
                          setIsProcessing(true)
                          await fn(Array.from(selectedPhotos))
                        } catch (err) {
                          console.error(`Action ${name} failed:`, err)
                        } finally {
                          setIsProcessing(false)
                          exitSelectionMode()
                        }
                      }}
                      disabled={isProcessing}
                    >
                      {name}
                    </Button>
                  ))}
                  <div className='w-0 mx-2 h-6 border-l border-l-blue-200' />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAlbumDialog(true)}
                    disabled={isProcessing}
                  >
                    <FolderPlus size={16} />
                    Add to Album
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleToggleFavourites}
                    disabled={isProcessing}
                  >
                    <Star size={16} />
                    {(() => {
                      const selectedArray = Array.from(selectedPhotos)
                      const allAreFavourites = selectedArray.every(id => favouritePhotoIds.has(id))
                      return allAreFavourites ? 'Unfavourite' : 'Favourite'
                    })()}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDeletePhotos}
                    disabled={isProcessing}
                  >
                    <Trash2 size={16} />
                    Delete
                  </Button>
                </>
              )}
              <Button variant="ghost" size="sm" onClick={exitSelectionMode}>
                <X size={16} />
              </Button>
            </div>
          </div>
        </div>
      )}

      {hasPhotos ? (
        <div className="space-y-8">
          {Object.entries(groupedPhotos)
            .sort(([a], [b]) => b.localeCompare(a))
            .map(([monthKey, { photos: monthPhotos, monthLabel }]) => {
              const monthPhotoIds = monthPhotos.filter(p => p.id).map(p => p.id!)
              const selectedInMonth = monthPhotoIds.filter(id => selectedPhotos.has(id)).length
              const allMonthSelected = monthPhotoIds.length > 0 && selectedInMonth === monthPhotoIds.length
              const someMonthSelected = selectedInMonth > 0 && selectedInMonth < monthPhotoIds.length

              return (
                <div key={monthKey} className="space-y-4">
                  <div className="bg-background sticky top-0 z-10 border-b pb-2 flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-foreground">{monthLabel}</h2>
                      <p className="text-sm text-muted-foreground">
                        {monthPhotos.length} {countLabel}{monthPhotos.length !== 1 ? 's' : ''}
                      </p>
                    </div>

                    <Checkbox
                      checked={allMonthSelected ? true : someMonthSelected ? "indeterminate" : false}
                      onCheckedChange={() => handleMonthSelect(monthPhotos)}
                      className="size-6"
                    />
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
                    {monthPhotos.map((photo, index) => {
                      const url = photo.id ? imageUrls.get(photo.id) : undefined
                      const isSelected = photo.id ? selectedPhotos.has(photo.id) : false

                      if (!url) return null

                      return (
                        <div
                          key={photo.id ?? index}
                          ref={(el) => {
                            if (photo.id) {
                              if (el) itemRefs.current.set(photo.id, el)
                              else itemRefs.current.delete(photo.id)
                            }
                          }}
                          className={cn(
                            "group relative aspect-square rounded-lg overflow-hidden bg-muted shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer",
                            isSelected && "ring-2 ring-blue-500"
                          )}
                          onClick={() => handlePhotoClick(photo, url)}
                          onContextMenu={(e) => {
                            e.preventDefault()
                            if (photo.id) handleLongPress(photo.id)
                          }}
                        >
                          <img
                            src={url}
                            alt={photo.filename}
                            className={cn(
                              "w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                            )}
                          />
                          <div className={cn(
                            "absolute inset-0 transition-colors duration-200",
                            isSelected
                              ? "bg-blue-500/20"
                              : "bg-black/0 group-hover:bg-black/10"
                          )} />

                          <div
                            className={cn(
                              "absolute top-2 right-2 transition-opacity duration-200",
                              isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                            )}
                            onClick={(e) => {
                              e.stopPropagation()
                              if (!isSelectionMode) {
                                setIsSelectionMode(true)
                                setSelectedPhotos(new Set([photo.id!]))
                              } else {
                                handlePhotoSelect(photo.id!)
                              }
                            }}
                          >
                            <Checkbox
                              checked={isSelected}
                              className={cn(
                                "size-6 border-2 transition-all pointer-events-none",
                                isSelected
                                  ? "bg-blue-500 border-blue-500"
                                  : "bg-white/80 border-white"
                              )}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
            <svg
              className="w-6 h-6 text-muted-foreground"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
          <p className="text-muted-foreground">{emptyMessage}</p>
        </div>
      )}

      {/* Album Selection Dialog */}
      {showAlbumDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full m-4 max-h-[80vh] overflow-hidden">
            <div className="p-4 border-b">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Add to Album</h3>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowAlbumDialog(false)}
                >
                  <X size={16} />
                </Button>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Adding {selectedPhotos.size} photo{selectedPhotos.size !== 1 ? 's' : ''}
              </p>
            </div>

            <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
              {/* Create New Album */}
              <div className="space-y-2">
                <h4 className="font-medium">Create New Album</h4>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Album name"
                    value={newAlbumName}
                    onChange={(e) => { setNewAlbumName(e.target.value); if (newAlbumError) setNewAlbumError(null) }}
                    className="flex-1 px-3 py-2 border rounded-md text-sm"
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && newAlbumName.trim()) {
                        handleCreateAlbum()
                      }
                    }}
                  />
                  <Button
                    onClick={handleCreateAlbum}
                    disabled={!newAlbumName.trim() || isCreatingAlbum || !!newAlbumError}
                    size="sm"
                  >
                    {isCreatingAlbum ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                    ) : (
                      <Plus size={16} />
                    )}
                  </Button>
                </div>
                {newAlbumError && (
                  <div className="text-sm text-red-600 mt-1">{newAlbumError}</div>
                )}
              </div>

              {/* Existing Albums */}
              {albums.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-medium">Existing Albums</h4>
                  <div className="space-y-1">
                    {albums.map((album) => (
                      <button
                        key={album.id}
                        onClick={() => handleAddToAlbum(album.id!)}
                        className="w-full text-left p-3 rounded-md border hover:bg-gray-50 transition-colors"
                      >
                        <div className="font-medium">{album.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {album.imageCount} photo{album.imageCount !== 1 ? 's' : ''}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {albums.length === 0 && (
                <div className="text-center py-4 text-muted-foreground">
                  <p>No albums yet. Create your first album above.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Lightbox with arrow key navigation */}
      {selectedPhoto && selectedPhotoUrl && (
        <ImageLightbox
          photos={lightboxPhotos}
          photoIndex={lightboxIndex}
          setPhotoIndex={setLightboxIndex}
          imageUrls={imageUrls}
          src={selectedPhotoUrl}
          photo={selectedPhoto}
          onClose={handleCloseLightbox}
        />
      )}
    </div>
  )
}

export default PhotoGrid