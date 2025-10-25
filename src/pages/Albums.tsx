import { useImageRepository } from "@/contexts/ImageRepositoryContext"
import type { Album, ImageRecord } from "@/lib/image-repository"
import { useEffect, useState } from "react"

interface AlbumsProps {
  photos: ImageRecord[]
}

const Albums = ({ photos }: AlbumsProps) => {
  const { repository } = useImageRepository()
  const [albums, setAlbums] = useState<Album[]>(null!)

  useEffect(() => {
    (async () => {
      const albums = await repository?.getAlbums() ?? []
      setAlbums(albums)
    })()
  })
  
  return (
    <div className="container mx-auto">
      <h1 className="text-2xl font-semibold mb-2">Albums</h1>
      <p className="text-sm text-gray-500 mb-4">Organize your photos into albums</p>
      <div className="text-center py-12 text-gray-400">
        {
          albums && albums.map(e => (
            <>
              <p>{e.name}</p>
              <p>{e.imageCount}</p>
            </>
          ))
        }
      </div>
    </div>
  )
}

export default Albums