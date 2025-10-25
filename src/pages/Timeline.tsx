import { useState, useEffect } from 'react'

interface TimelineProps {
  photos: File[]
}

const Timeline = ({ photos }: TimelineProps) => {
  const [imageUrls, setImageUrls] = useState<string[]>([])

  useEffect(() => {
    const urls = photos.map(file => URL.createObjectURL(file))
    setImageUrls(urls)

    return () => {
      urls.forEach(url => URL.revokeObjectURL(url))
    }
  }, [photos])

  return (
    <div className="page-container">
      <h1 className="page-title">Timeline</h1>
      <p className="page-subtitle">
        {photos.length} photo{photos.length !== 1 ? 's' : ''} imported
      </p>
      
      {imageUrls.length > 0 ? (
        <div className="photo-grid">
          {imageUrls.map((url, index) => (
            <div key={index} className="photo-item">
              <img src={url} alt={`Photo ${index + 1}`} />
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <p>No photos yet. Click Import to add photos.</p>
        </div>
      )}
    </div>
  )
}

export default Timeline