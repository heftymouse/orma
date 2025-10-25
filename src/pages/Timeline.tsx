import type { ImageFileMetadata } from '@/lib/utils'
import { useState, useEffect } from 'react'

interface TimelineProps {
  photos: ImageFileMetadata[]
}

const Timeline = ({ photos }: TimelineProps) => {
  const [imageUrls, setImageUrls] = useState<string[]>([])

  useEffect(() => {
    const urls = photos.map(file => URL.createObjectURL(file.file))
    setImageUrls(urls)

    return () => {
      urls.forEach(url => URL.revokeObjectURL(url))
    }
  }, [photos])

  return (
    <div className="container mx-auto">
      <h1 className="text-2xl font-semibold mb-2">Timeline</h1>
      <p className="text-sm text-gray-500 mb-4">
        {photos.length} photo{photos.length !== 1 ? 's' : ''} imported
      </p>

      {imageUrls.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {imageUrls.map((url, index) => (
            <div key={index} className="aspect-square rounded-md overflow-hidden bg-gray-100 shadow-sm">
              <img src={url} alt={`Photo ${index + 1}`} className="w-full h-full object-cover" />
            </div>
          ))}
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