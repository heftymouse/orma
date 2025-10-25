interface MemoriesProps {
  photos: File[]
}

const Memories = ({ photos }: MemoriesProps) => {
  return (
    <div className="page-container">
      <h1 className="page-title">Memories</h1>
      <p className="page-subtitle">Relive your special moments</p>
      <div className="empty-state">
        <p>Memories view coming soon...</p>
      </div>
    </div>
  )
}

export default Memories