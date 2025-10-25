import type { ImageRecord } from '@/lib/image-repository'
import PhotoGrid from '@/components/PhotoGrid'

interface TimelineProps {
  photos: ImageRecord[]
}

const Timeline = ({ photos }: TimelineProps) => {
  return (
    <div className="container mx-auto">
      <h1 className="text-2xl font-semibold mb-2">Timeline</h1>
      <PhotoGrid 
        photos={photos} 
        emptyMessage="No photos yet. Click Import to add photos."
        countLabel="photo"
        actions={{}}
      />
    </div>
  )
}

export default Timeline