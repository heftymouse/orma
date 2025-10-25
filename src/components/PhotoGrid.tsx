import type { ImageRecord } from '@/lib/image-repository'
import { useState, useEffect, useMemo } from 'react'
import { useDirectory } from '@/contexts/DirectoryContext'

interface PhotoGridProps {
  photos: ImageRecord[]
  onImageClick?: (photo: ImageRecord, src: string) => void
  emptyMessage?: string
  showCount?: boolean
  countLabel?: string
}

interface GroupedPhotos {
  [monthKey: string]: {
    photos: ImageRecord[]
    monthLabel: string
  }
}

const PhotoGrid = ({ 
  photos, 
  onImageClick, 
  emptyMessage = "No photos yet. Click Import to add photos.",
  showCount = true,
  countLabel = "photo"
}: PhotoGridProps) => {
  const [imageUrls, setImageUrls] = useState<Map<number, string>>(new Map())
  const { createBlobUrl } = useDirectory()

  // Sort photos by date and group by month
  const groupedPhotos = useMemo(() => {
    // Sort photos by date (newest first)
    const sortedPhotos = [...photos].sort((a, b) => {
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
  }, [photos])

  useEffect(() => {
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

  const hasPhotos = Object.keys(groupedPhotos).length > 0

  return (
    <>
      {showCount && (
        <p className="text-sm text-muted-foreground mb-6">
          {photos.length} {countLabel}{photos.length !== 1 ? 's' : ''} imported
        </p>
      )}

      {hasPhotos ? (
        <div className="space-y-8">
          {Object.entries(groupedPhotos)
            .sort(([a], [b]) => b.localeCompare(a)) // Sort months newest first
            .map(([monthKey, { photos: monthPhotos, monthLabel }]) => (
              <div key={monthKey} className="space-y-4">
                <div className="sticky top-0 z-10 border-b pb-2">
                  <h2 className="text-lg font-semibold text-foreground">
                    {monthLabel}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {monthPhotos.length} {countLabel}{monthPhotos.length !== 1 ? 's' : ''}
                  </p>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
                  {monthPhotos.map((photo, index) => {
                    const url = photo.id ? imageUrls.get(photo.id) : undefined
                    if (!url) return null
                    
                    return (
                      <div
                        key={photo.id ?? index}
                        className="group relative aspect-square rounded-lg overflow-hidden bg-muted shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer"
                        onClick={() => onImageClick?.(photo, url)}
                      >
                        <img 
                          src={url} 
                          alt={photo.filename} 
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" 
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-200" />
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
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
    </>
  )
}

export default PhotoGrid