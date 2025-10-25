import type { ImageFileMetadata } from "@/lib/utils"

interface PlacesProps {
  photos: ImageFileMetadata[]
}

const Places = ({ photos }: PlacesProps) => {
  return (
    <div className="container mx-auto">
      <h1 className="text-2xl font-semibold mb-2">Places</h1>
      <p className="text-sm text-gray-500 mb-4">Photos organized by location</p>
      <div className="text-center py-12 text-gray-400">
        <p>Places view coming soon...</p>
      </div>
    </div>
  )
}

export default Places