import type { ImageRecord } from "@/lib/image-repository"
import MapView from '@/components/MapView'

interface PlacesProps {
  photos: ImageRecord[]
}

const Places = ({ photos }: PlacesProps) => {
  return (
    <div className="container mx-auto">
      <h1 className="text-2xl font-semibold mb-2">Places</h1>
      <p className="text-sm text-gray-500 mb-4">Photos organized by location</p>

      <div style={{ height: '80vh' }}>
        <MapView photos={photos} />
      </div>
    </div>
  )
}

export default Places