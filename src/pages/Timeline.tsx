import type { ImageRecord } from '@/lib/image-repository'
import { useState, useEffect } from 'react'
import { useDirectory } from '@/contexts/DirectoryContext'

interface TimelineProps {
  photos: ImageRecord[]
  onImageClick?: (photo: ImageRecord, src: string) => void
}

const Timeline = ({ photos, onImageClick }: TimelineProps) => {
  const [imageUrls, setImageUrls] = useState<Map<number, string>>(new Map())
  const { createBlobUrl } = useDirectory()

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

  return (
    <div className="container mx-auto">
      <h1 className="text-2xl font-semibold mb-2">Timeline</h1>
      <p className="text-sm text-gray-500 mb-4">
        {photos.length} photo{photos.length !== 1 ? 's' : ''} imported
      </p>

      {imageUrls.size > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {photos.map((photo, index) => {
            const url = photo.id ? imageUrls.get(photo.id) : undefined
            if (!url) return null
            
            return (
              <div
                key={photo.id ?? index}
                className="aspect-square rounded-md overflow-hidden bg-gray-100 shadow-sm cursor-pointer"
                onClick={() => onImageClick?.(photo, url)}
              >
                <img src={url} alt={photo.filename} className="w-full h-full object-cover" />
              </div>
            )
          })}
        </div>
      ) : (
        <div className="text-center py-12 text-gray-400">
          <p>No photos yet. Click Import to add photos.</p>
        </div>
      )}
    </div>
  )
}

export default Timeline