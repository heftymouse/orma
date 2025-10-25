import { useState } from 'react'
import type { ImageRecord } from "@/lib/image-repository"
import MapView from '@/components/MapView'
import PhotoGrid from '@/components/PhotoGrid'

interface PlacesProps {
  photos: ImageRecord[]
}

interface MapBounds {
  north: number
  south: number
  east: number
  west: number
}

const Places = ({ photos }: PlacesProps) => {
  const [bounds, setBounds] = useState<MapBounds | null>(null)

  const toDecimal = (arr?: [number, number, number]) => {
    if (!arr) return undefined
    return arr[0] + (arr[1] ?? 0) / 60 + (arr[2] ?? 0) / 3600
  }

  const photosInBounds = bounds ? photos.filter(photo => {
    const lat = toDecimal(photo.gpsLatitude as any)
    const lon = toDecimal(photo.gpsLongitude as any)
    if (lat == null || lon == null) return false
    
    return lat >= bounds.south && lat <= bounds.north &&
           lon >= bounds.west && lon <= bounds.east
  }) : []

  return (
    <div className="container mx-auto">
      <h1 className="text-2xl font-semibold mb-2">Places</h1>
      <p className="text-sm text-gray-500 mb-4">Photos organized by location</p>

      <div className="grid grid-cols-2 gap-4" style={{ height: '80vh' }}>
        {/* Left column - Map */}
        <div className="h-full">
          <MapView photos={photos} onBoundsChange={setBounds} />
        </div>
        
        {/* Right column - Photos in view */}
        <div className="h-full overflow-auto">
          <PhotoGrid 
            photos={photosInBounds} 
            emptyMessage="No photos in the current map view"
            showCount={true}
            countLabel="photo"
          />
        </div>
      </div>
    </div>
  )
}

export default Places