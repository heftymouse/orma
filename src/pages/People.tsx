import type { ImageRecord } from "@/lib/image-repository"
import type { ImageFileMetadata } from "@/lib/utils"

interface PeopleProps {
  photos: ImageRecord[]
}

const People = ({ photos }: PeopleProps) => {
  return (
    <div className="container mx-auto">
      <h1 className="text-2xl font-semibold mb-2">People</h1>
      <p className="text-sm text-gray-500 mb-4">Photos organized by people</p>
      <div className="text-center py-12 text-gray-400">
        <p>People view coming soon...</p>
      </div>
    </div>
  )
}

export default People