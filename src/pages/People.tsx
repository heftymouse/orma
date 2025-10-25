import React, { useEffect, useState, useRef } from 'react'
import type { ImageRecord } from '@/lib/image-repository'
import { useDirectory } from '@/contexts/DirectoryContext'
import { loadModel, detectFaces } from '@/lib/faceDetection'

interface PeopleProps {
  photos: ImageRecord[]
}

const People = ({ photos }: PeopleProps) => {
  const { createBlobUrl } = useDirectory()
  const [photoUrls, setPhotoUrls] = useState<Record<number, string>>({})
  const [faceDetections, setFaceDetections] = useState<Map<number, any[]>>(new Map())
  const [modelLoaded, setModelLoaded] = useState(false)

  const detecting = useRef(false)

  useEffect(() => {
    loadModel().then(() => setModelLoaded(true))
  }, [])

  useEffect(() => {
    const fetchUrls = async () => {
      const urls: Record<number, string> = {}
      for (const photo of photos) {
        if (photo.id) {
          urls[photo.id] = (await createBlobUrl(photo.path)) || ''
        }
      }
      setPhotoUrls(urls)
    }
    fetchUrls()
  }, [photos, createBlobUrl])

  useEffect(() => {
    if (!modelLoaded || detecting.current) return
    detecting.current = true

    const detectAllFaces = async () => {
      for (const photo of photos) {
        if (!photo.id) continue
        const url = photoUrls[photo.id]
        if (!url) continue

        const img = new Image()
        img.src = url
        img.crossOrigin = 'anonymous'

        await new Promise<void>((resolve) => {
          img.onload = () => resolve()
          img.onerror = () => resolve()
        })

        const detections = await detectFaces(img)
        setFaceDetections((prev) => {
          const newMap = new Map(prev)
          newMap.set(photo.id!, detections)
          return newMap
        })
      }
      detecting.current = false
    }
    detectAllFaces()
  }, [modelLoaded, photos, photoUrls])

  const photosWithFaces = photos.filter(
    (photo) => faceDetections.get(photo.id ?? -1)?.length > 0
  )

  return (
    <div className="container mx-auto py-6">
      <h1 className="text-2xl font-semibold mb-4">People</h1>
      <p className="text-sm text-gray-600 mb-6">Photos with detected faces</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {photosWithFaces.length === 0 && (
          <p className="text-gray-500 col-span-full text-center">No photos with faces detected.</p>
        )}
        {photosWithFaces.map((photo) => {
          const photoUrl = photoUrls[photo.id ?? -1] || ''
          const detections = faceDetections.get(photo.id ?? -1) ?? []

          return (
            <div key={photo.id} className="relative rounded-md overflow-hidden border shadow-sm">
              {photoUrl ? (
                <img
                  src={photoUrl}
                  alt={photo.filename}
                  className="w-full h-auto object-cover"
                />
              ) : (
                <div className="w-full h-48 bg-gray-200 flex items-center justify-center text-gray-400">
                  Loading...
                </div>
              )}
              {/* Here you can add canvas overlays or divs to render bounding boxes using detection output */}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default People