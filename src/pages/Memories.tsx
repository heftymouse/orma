interface MemoriesProps {
  photos: File[]
}

const Memories = ({ photos }: MemoriesProps) => {
  return (
    <div className="container mx-auto">
      <h1 className="text-2xl font-semibold mb-2">Memories</h1>
      <p className="text-sm text-gray-500 mb-4">Relive your special moments</p>
      <div className="text-center py-12 text-gray-400">
        <p>Memories view coming soon...</p>
      </div>
    </div>
  )
}

export default Memories