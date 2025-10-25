import { Upload, Clock, FolderOpen, MapPin, Users, Sparkles, Menu, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { enumerateImageMetadata, type ImageFileMetadata } from '@/lib/utils'

type ViewType = 'timeline' | 'albums' | 'places' | 'people' | 'memories'

interface NavbarProps {
  activeView: ViewType
  onNavigate: (view: ViewType) => void
  onImport: (files: ImageFileMetadata[]) => void
}

const Navbar = ({ activeView, onNavigate, onImport }: NavbarProps) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const navItems = [
    { id: 'timeline' as const, label: 'Timeline', icon: Clock },
    { id: 'albums' as const, label: 'Albums', icon: FolderOpen },
    { id: 'places' as const, label: 'Places', icon: MapPin },
    { id: 'people' as const, label: 'People', icon: Users },
    { id: 'memories' as const, label: 'Memories', icon: Sparkles },
  ]

  const handleImportClick = async () => {
    // const input = document.createElement('input')
    // input.type = 'file'
    // input.multiple = true
    // input.accept = 'image/*'
    // input.onchange = (e) => {
    //   const target = e.target as HTMLInputElement
    //   if (target.files) {
    //     const files = Array.from(target.files)
    //     onImport(files)
    //   }
    // }
    // input.click()

    // @ts-ignore
    const dir = await window.showDirectoryPicker()
    const imagesWithMetadata = await enumerateImageMetadata(dir)
    onImport(imagesWithMetadata)
  }

  const handleNavClick = (id: ViewType) => {
    onNavigate(id)
    setMobileMenuOpen(false)
  }

  return (
    <nav className="bg-white border-b sticky top-0 z-50">
      {/* Desktop */}
      <div className="hidden md:flex items-center justify-between px-4 py-3 max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          {navItems.map((item) => {
            const Icon = item.icon
            const active = activeView === item.id
            return (
              <Button
                key={item.id}
                variant={active ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => onNavigate(item.id)}
                className="flex items-center gap-2"
              >
                <Icon size={16} />
                <span>{item.label}</span>
              </Button>
            )
          })}
        </div>

        <div>
          <Button onClick={handleImportClick} variant="default" size="default">
            <Upload size={16} />
            <span>Import</span>
          </Button>
        </div>
      </div>

      {/* Mobile */}
      <div className="md:hidden px-4 py-3">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <h1 className="text-lg font-semibold">Photo Library</h1>
          <div className="flex items-center gap-2">
            <Button onClick={handleImportClick} variant="default" size="icon">
              <Upload size={16} />
            </Button>
            <Button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} variant="ghost" size="icon">
              {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
            </Button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="mt-2 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon
              const active = activeView === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-left ${
                    active ? 'bg-blue-50 text-blue-600 border-l-4 border-blue-600' : 'hover:bg-gray-50'
                  }`}
                >
                  <Icon size={18} />
                  <span className="font-medium">{item.label}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </nav>
  )
}

export default Navbar