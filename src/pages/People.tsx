import { useEffect, useState, useRef } from 'react'
import type { ImageRecord } from '@/lib/image-repository'
import { useDirectory } from '@/contexts/DirectoryContext'
import { loadModel, detectFaces, type FaceDetection } from '@/lib/faceDetection'
import PhotoGrid from '@/components/PhotoGrid'

interface PeopleProps {
  photos: ImageRecord[]
}

const People = ({ photos }: PeopleProps) => {
  const { createBlobUrl } = useDirectory()
  const [photoUrls, setPhotoUrls] = useState<Record<number, string>>({})
  const [faceDetections, setFaceDetections] = useState<Map<number, FaceDetection[]>>(new Map())
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
      const newDetections = new Map<number, FaceDetection[]>()
      
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
        newDetections.set(photo.id, detections)
      }
      
      // Update state once with all detections
      setFaceDetections(newDetections)
      detecting.current = false
    }
    detectAllFaces()
  }, [modelLoaded, photos, photoUrls])

  const photosWithFaces = photos.filter(
    (photo) => {
      const detections = faceDetections.get(photo.id ?? -1)
      return detections && detections.length > 0
    }
  )

  return (
    <div className="container mx-auto py-6">
      <h1 className="text-2xl font-semibold mb-4">People</h1>
      <p className="text-sm text-gray-600 mb-6">Photos with detected faces</p>
      <PhotoGrid photos={photosWithFaces} emptyMessage='No photos with faces detected.' />
    </div>
  )
}

export default People