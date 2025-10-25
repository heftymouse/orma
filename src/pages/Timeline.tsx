import type { ImageRecord } from '@/lib/image-repository'
import PhotoGrid from '@/components/PhotoGrid'

interface TimelineProps {
  photos: ImageRecord[]
  onImageClick?: (photo: ImageRecord, src: string) => void
}

const Timeline = ({ photos, onImageClick }: TimelineProps) => {
  return (
    <div className="container mx-auto">
      <h1 className="text-2xl font-semibold mb-2">Timeline</h1>
      <PhotoGrid 
        photos={photos} 
        onImageClick={onImageClick}
        emptyMessage="No photos yet. Click Import to add photos."
        countLabel="photo"
      />
    </div>
  )
}

export default Timeline