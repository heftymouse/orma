import { useEffect, useState } from 'react'
import type { ImageRecord } from '@/lib/image-repository'
import PhotoGrid from '@/components/PhotoGrid'
import { useImageRepository } from '@/contexts/ImageRepositoryContext'
import { Button } from '@/components/ui/button'

const monthNames = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
]

const Memories = () => {
  const { repository } = useImageRepository()
  const [photosForMonth, setPhotosForMonth] = useState<ImageRecord[]>([])
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth())
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      if (!repository) return
      setLoading(true)
      setError(null)
      try {
        const imgs = await repository.getImagesByMonth(selectedMonth)
        setPhotosForMonth(imgs ?? [])
      } catch (err) {
        console.error('Failed to load photos for Memories:', err)
        setError((err as Error)?.message ?? String(err))
        setPhotosForMonth([])
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [repository, selectedMonth])

  return (
    <div className="container mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold">Memories</h1>
          <p className="text-sm text-gray-500">Photos taken in {monthNames[selectedMonth]} across all years</p>
        </div>
      </div>

      <div className="mb-4 overflow-auto pb-2">
        <div className="flex gap-2">
          {monthNames.map((m, idx) => (
            <Button
              key={m}
              size="sm"
              variant={idx === selectedMonth ? 'secondary' : 'outline'}
              onClick={() => setSelectedMonth(idx)}
            >
              {m}
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading memories…</div>
      ) : error ? (
        <div className="text-center py-12 text-red-500">Error: {error}</div>
      ) : (
        <PhotoGrid
          photos={photosForMonth}
          emptyMessage={`No photos found for ${monthNames[selectedMonth]}`}
          showCount={true}
          countLabel="photo"
        />
      )}
    </div>
  )
}

export default Memories