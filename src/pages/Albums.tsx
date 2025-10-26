import { useImageRepository } from "@/contexts/ImageRepositoryContext"
import { useDirectory } from "@/contexts/DirectoryContext"
import type { Album, ImageRecord } from "@/lib/image-repository"
import { useEffect, useState } from "react"
import PhotoGrid from "@/components/PhotoGrid"
import { Button } from "@/components/ui/button"
import { Check, Lock } from "lucide-react"

const Albums = () => {
  const { repository } = useImageRepository()
  // Albums with optional cover preview URL
  type AlbumWithCover = Album & { coverUrl?: string | null }
  const [albums, setAlbums] = useState<AlbumWithCover[]>([])
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [selectedAlbums, setSelectedAlbums] = useState<Set<number>>(new Set())
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null)
  const [albumPhotos, setAlbumPhotos] = useState<ImageRecord[]>([])
  const [loadingAlbums, setLoadingAlbums] = useState(false)
  const [loadingPhotos, setLoadingPhotos] = useState(false)
  const { createBlobUrl, directoryHandle } = useDirectory()
  const [favouritesAlbumId, setFavouritesAlbumId] = useState<number | null>(null)

  // Load favourites album id so it can be made unselectable
  useEffect(() => {
    let mounted = true
    const loadFavourites = async () => {
      if (!repository) return
      try {
        const fav = await repository.getFavouritesAlbum()
        if (mounted) setFavouritesAlbumId(fav?.id ?? null)
      } catch (err) {
        console.warn('Failed to load favourites album id', err)
      }
    }

    loadFavourites()

    return () => { mounted = false }
  }, [repository])

  // Ensure favourites album is shown first (top-left) in the grid
  useEffect(() => {
    if (favouritesAlbumId == null || albums.length === 0) return

    // If already first, nothing to do
    if (albums[0]?.id === favouritesAlbumId) return

    setAlbums(prev => {
      const idx = prev.findIndex(a => a.id === favouritesAlbumId)
      if (idx <= 0) return prev
      const fav = prev[idx]
      const rest = [...prev.slice(0, idx), ...prev.slice(idx + 1)]
      return [fav, ...rest]
    })
  }, [favouritesAlbumId, albums])

  // Load albums when repository becomes available
  useEffect(() => {
    let mounted = true
    const createdUrls: string[] = []

    const load = async () => {
      if (!repository) return
      setLoadingAlbums(true)
      try {
        const list = await repository.getAlbums()

        const enhanced = await Promise.all(list.map(async (alb) => {
          const out: AlbumWithCover = { ...alb, coverUrl: null }

          try {
            // Prefer explicit coverImageId
            let coverImage: ImageRecord | null = null
            if (alb.coverImageId) {
              coverImage = await repository.getImageById(alb.coverImageId)
            }

            // If no explicit cover, try to load the most recently added image
            if (!coverImage && alb.id) {
              const imgs = await repository.getAlbumImages(alb.id)
              if (imgs && imgs.length > 0) coverImage = imgs[0]
            }

            if (coverImage && directoryHandle) {
              const url = await createBlobUrl(coverImage.path)
              out.coverUrl = url
              if (url) createdUrls.push(url)
            }
          } catch (err) {
            // ignore per-album errors
            console.warn('Failed to load album cover for', alb.name, err)
          }

          return out
        }))

        if (mounted) setAlbums(enhanced)
      } catch (err) {
        console.error("Failed to load albums:", err)
      } finally {
        if (mounted) setLoadingAlbums(false)
      }
    }

    load()

    return () => {
      mounted = false
      createdUrls.forEach(u => {
        try { URL.revokeObjectURL(u) } catch {}
      })
    }
  }, [repository, createBlobUrl, directoryHandle])

  // Open an album and load its images
  const openAlbum = async (album: Album) => {
    if (!repository || !album.id) return
    setSelectedAlbum(album)
    setLoadingPhotos(true)
    try {
      const imgs = await repository.getAlbumImages(album.id)
      setAlbumPhotos(imgs)
    } catch (err) {
      console.error("Failed to load album images:", err)
      setAlbumPhotos([])
    } finally {
      setLoadingPhotos(false)
    }
  }

  // Back to album list
  const closeAlbum = () => {
    setSelectedAlbum(null)
    setAlbumPhotos([])
  }

  // Handler for removing photos from the current album
  const handleRemoveFromAlbum = async (photoIds: number[]) => {
    if (!repository || !selectedAlbum?.id || photoIds.length === 0) return

    try {
      for (const photoId of photoIds) {
        await repository.removeImageFromAlbum(selectedAlbum.id, photoId)
      }
      // Reload album photos
      const imgs = await repository.getAlbumImages(selectedAlbum.id)
      setAlbumPhotos(imgs)
      console.log(`Removed ${photoIds.length} photo(s) from album`)
    } catch (error) {
      console.error('Failed to remove photos from album:', error)
    }
  }

  // If an album is selected, show its photos in PhotoGrid
  if (selectedAlbum) {
    return (
      <div className="container mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-semibold">{selectedAlbum.name}</h1>
            <p className="text-sm text-gray-500">
              {selectedAlbum.imageCount} photo{selectedAlbum.imageCount !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={closeAlbum}>
              Back
            </Button>
          </div>
        </div>

        {loadingPhotos ? (
          <div className="text-center py-12 text-gray-500">Loading album...</div>
        ) : (
          <PhotoGrid 
            photos={albumPhotos}
            actions={{
              'Remove from Album': handleRemoveFromAlbum
            }}
          />
        )}
      </div>
    )
  }

  // Album list view
  return (
    <div className="container mx-auto">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-2xl font-semibold">Albums</h1>
          <p className="text-sm text-gray-500">Organize your photos into albums</p>
        </div>

        <div className="flex items-center gap-2">
          {isSelectionMode ? (
            <>
              <div className="text-sm text-muted-foreground">{selectedAlbums.size} selected</div>
              <Button
                className="bg-red-600 hover:bg-red-700 text-white"
                size="sm"
                onClick={async () => {
                  // Delete selected albums
                  if (!repository || selectedAlbums.size === 0) return
                  const ok = window.confirm(`Delete ${selectedAlbums.size} selected album(s)? This cannot be undone.`)
                  if (!ok) return

                  try {
                    // Delete each album from repository
                    const ids = Array.from(selectedAlbums)
                    await Promise.all(ids.map(id => repository.deleteAlbum(id)))

                    // Revoke any cover URLs for deleted albums and remove from state
                    setAlbums(prev => {
                      prev.forEach(a => {
                        if (a.id && selectedAlbums.has(a.id) && a.coverUrl) {
                          try { URL.revokeObjectURL(a.coverUrl) } catch {}
                        }
                      })
                      return prev.filter(a => !(a.id && selectedAlbums.has(a.id)))
                    })

                    setSelectedAlbums(new Set())
                    setIsSelectionMode(false)
                  } catch (error) {
                    console.error('Failed to delete albums:', error)
                  }
                }}
              >
                Delete
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setIsSelectionMode(false); setSelectedAlbums(new Set()) }}>
                Cancel
              </Button>
            </>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setIsSelectionMode(true)}>
              Select
            </Button>
          )}
        </div>
      </div>

      {loadingAlbums ? (
        <div className="text-center py-12 text-gray-500">Loading albums...</div>
      ) : albums.length === 0 ? (
        <div className="text-center py-12 text-gray-400">No albums yet.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {albums.map((a) => {
            const id = a.id ?? -Math.random()
            const isSelected = a.id ? selectedAlbums.has(a.id) : false
            const isSelectable = !!a.id && favouritesAlbumId !== a.id

            return (
              <div
              key={id}
              onClick={() => {
                if (isSelectionMode) {
                  // In selection mode, don't allow selecting the favourites album
                  if (!a.id || !isSelectable) return
                  setSelectedAlbums(prev => {
                    const next = new Set(prev)
                    if (next.has(a.id!)) next.delete(a.id!)
                    else next.add(a.id!)
                    return next
                  })
                } else {
                  openAlbum(a)
                }
              }}
              className={`relative w-full text-left bg-white border rounded-lg p-4 hover:shadow-md transition flex items-center gap-4 ${isSelectionMode && !isSelectable ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}>
              {/* Selection checkbox / disabled lock for favourites */}
              {isSelectionMode && (
                <div className="absolute z-10 ml-2 mt-2">
                  {isSelectable ? (
                    <div className={isSelected ? "w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs" : "w-5 h-5 rounded-full bg-white border flex items-center justify-center text-xs"}>
                      {isSelected && <Check size={12} />}
                    </div>
                  ) : (
                    <div title="Favorites cannot be selected" className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center text-xs text-gray-600">
                      <Lock size={12} />
                    </div>
                  )}
                </div>
              )}

              {/* Thumbnail */}
              <div className="w-20 h-20 rounded-md overflow-hidden bg-muted flex-shrink-0 flex items-center justify-center">
                {a.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.coverUrl} alt={`${a.name} cover`} className="w-full h-full object-cover" />
                ) : (
                  <div className="text-sm text-muted-foreground">No preview</div>
                )}
              </div>

              <div className="flex-1 flex items-center justify-between">
                <div>
                  <div className="font-medium text-lg text-foreground">{a.name}</div>
                  <div className="text-sm text-muted-foreground">{a.imageCount} photo{a.imageCount !== 1 ? 's' : ''}</div>
                </div>
                <div>
                  <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); openAlbum(a) }}>
                    Open
                  </Button>
                </div>
              </div>
            </div>
          )})}
        </div>
      )}
    </div>
  )
}

export default Albums