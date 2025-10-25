interface PeopleProps {
  photos: File[]
}

const People = ({ photos }: PeopleProps) => {
  return (
    <div className="page-container">
      <h1 className="page-title">People</h1>
      <p className="page-subtitle">Photos organized by people</p>
      <div className="empty-state">
        <p>People view coming soon...</p>
      </div>
    </div>
  )
}

export default People