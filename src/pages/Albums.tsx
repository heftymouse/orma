interface AlbumsProps {
  photos: File[]
}

const Albums = ({ photos }: AlbumsProps) => {
  return (
    <div className="container mx-auto">
      <h1 className="text-2xl font-semibold mb-2">Albums</h1>
      <p className="text-sm text-gray-500 mb-4">Organize your photos into albums</p>
      <div className="text-center py-12 text-gray-400">
        <p>Albums view coming soon...</p>
      </div>
    </div>
  )
}

export default Albums