import { Upload, Clock, FolderOpen, MapPin, Users, Sparkles, Menu, X } from 'lucide-react'
import { useState } from 'react'

type ViewType = 'timeline' | 'albums' | 'places' | 'people' | 'memories'

interface NavbarProps {
  activeView: ViewType
  onNavigate: (view: ViewType) => void
  onImport: (files: File[]) => void
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

  const handleImportClick = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.accept = 'image/*'
    input.onchange = (e) => {
      const target = e.target as HTMLInputElement
      if (target.files) {
        const files = Array.from(target.files)
        onImport(files)
      }
    }
    input.click()
  }

  const handleNavClick = (id: ViewType) => {
    onNavigate(id)
    setMobileMenuOpen(false)
  }

  return (
    <nav className="navbar">
      {/* Desktop Navigation */}
      <div className="navbar-desktop">
        <div className="nav-items">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`nav-button ${activeView === item.id ? 'active' : ''}`}
              >
                <Icon size={20} />
                <span>{item.label}</span>
              </button>
            )
          })}
        </div>
        
        <button onClick={handleImportClick} className="import-button">
          <Upload size={20} />
          <span>Import</span>
        </button>
      </div>

      {/* Mobile Navigation */}
      <div className="navbar-mobile">
        <div className="navbar-content">
          <h1 className="navbar-title">Photo Library</h1>
          <div className="navbar-actions">
            <button onClick={handleImportClick} className="import-button-mobile">
              <Upload size={20} />
            </button>
            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="menu-button">
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="mobile-menu">
            {navItems.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item.id)}
                  className={`mobile-nav-button ${activeView === item.id ? 'active' : ''}`}
                >
                  <Icon size={20} />
                  <span>{item.label}</span>
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