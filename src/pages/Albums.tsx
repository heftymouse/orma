interface AlbumsProps {
  photos: File[]
}

const Albums = ({ photos }: AlbumsProps) => {
  return (
    <div className="page-container">
      <h1 className="page-title">Albums</h1>
      <p className="page-subtitle">Organize your photos into albums</p>
      <div className="empty-state">
        <p>Albums view coming soon...</p>
      </div>
    </div>
  )
}

export default Albums