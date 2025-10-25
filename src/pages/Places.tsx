interface PlacesProps {
  photos: File[]
}

const Places = ({ photos }: PlacesProps) => {
  return (
    <div className="page-container">
      <h1 className="page-title">Places</h1>
      <p className="page-subtitle">Photos organized by location</p>
      <div className="empty-state">
        <p>Places view coming soon...</p>
      </div>
    </div>
  )
}

export default Places