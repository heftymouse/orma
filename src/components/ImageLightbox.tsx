import { useEffect, useState, useRef } from "react"
import { X, Info, ChevronDown, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { ImageRecord } from "@/lib/image-repository"

interface ImageLightboxProps {
  src: string | null
  photo: ImageRecord
  onClose: () => void
}

export default function ImageLightbox({ src, photo, onClose }: ImageLightboxProps) {
  const [showInfo, setShowInfo] = useState(false)
  const [dimensions, setDimensions] = useState<{ w: number; h: number } | null>(null)
  const [showAdvancedDetails, setShowAdvancedDetails] = useState(false)

  // Zoom / pan state
  const [scale, setScale] = useState(1)
  const [translate, setTranslate] = useState({ x: 0, y: 0 })
  const isPanning = useRef(false)
  const lastPos = useRef<{ x: number; y: number } | null>(null)
  const imgContainerRef = useRef<HTMLDivElement | null>(null)

  // controls visibility on mouse movement
  const [showControls, setShowControls] = useState(true)
  const hideTimer = useRef<number | null>(null)

  useEffect(() => {
    if (!src) return
    const img = new Image()
    img.src = src
    const onLoad = () => setDimensions({ w: img.naturalWidth, h: img.naturalHeight })
    img.addEventListener("load", onLoad)
    return () => {
      img.removeEventListener("load", onLoad)
      setDimensions(null)
    }
  }, [src])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
      if (e.key === "i" || e.key === "I") setShowInfo((s) => !s)
      if (e.key === "+" || e.key === "=") setScale((s) => Math.min(4, +(s + 0.25).toFixed(2)))
      if (e.key === "-") setScale((s) => Math.max(0.5, +(s - 0.25).toFixed(2)))
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  if (!src) return null

  const formatBytes = (n?: number) =>
    n == null ? "—" : n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / (1024 * 1024)).toFixed(1)} MB`

  const formatDate = (date?: Date) =>
    date ? date.toLocaleString() : "—"

  // mouse movement => show controls and reset hide timer
  const handlePointerMove = () => {
    setShowControls(true)
    if (hideTimer.current) {
      window.clearTimeout(hideTimer.current)
    }
    hideTimer.current = window.setTimeout(() => setShowControls(false), 2000)
  }

  // wheel for zoom
  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey) return // don't interfere with browser zoom
    e.preventDefault()
    e.stopPropagation() // prevent event from bubbling to timeline
    const delta = -e.deltaY
    const step = delta > 0 ? 0.12 : -0.12
    setScale(s => Math.min(4, Math.max(0.5, +(s + step).toFixed(2))))
  }

  // pointer events for pan
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    isPanning.current = true;
    lastPos.current = { x: e.clientX, y: e.clientY };
    (e.target as Element).setPointerCapture(e.pointerId)
  }

  const onPointerMovePan = (e: React.PointerEvent) => {
    if (!isPanning.current || !lastPos.current) return
    const dx = e.clientX - lastPos.current.x
    const dy = e.clientY - lastPos.current.y
    lastPos.current = { x: e.clientX, y: e.clientY }
    setTranslate(t => ({ x: t.x + dx, y: t.y + dy }))
  }

  const onPointerUp = (e: React.PointerEvent) => {
    isPanning.current = false
    lastPos.current = null
    try { (e.target as Element).releasePointerCapture?.(e.pointerId) } catch {}
  }

  // double click to toggle zoom fit / 2x
  const onDoubleClick = () => {
    setScale(s => s === 1 ? 2 : 1)
    setTranslate({ x: 0, y: 0 })
  }

  // reset hide timer on mount/unmount
  useEffect(() => {
    handlePointerMove()
    return () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

    useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
    }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
    >
      {/* clickable backdrop layer */}
      <div
        className="absolute inset-0"
        onClick={onClose}
      />

      {/* actual content layer */}
      <div
        className="relative w-full h-full flex items-center justify-center overflow-hidden z-10"
        onMouseMove={handlePointerMove}
        onWheel={(e) => {
          e.preventDefault()
          e.stopPropagation()
        }}
      >
        {/* top overlay: title left, controls right */}
        <div
          className={cn(
            "absolute left-0 right-0 top-4 px-6 flex items-center justify-between transition-opacity z-30",
            showControls ? "opacity-100" : "opacity-0"
          )}
        >
          <div className="text-sm text-white/90 font-medium truncate max-w-[50%]">
            {photo.filename ?? "Photo"}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation()
                setShowInfo(s => !s)
              }}
              aria-pressed={showInfo}
              aria-label="Toggle info (I)"
              className="text-white hover:text-white hover:bg-white/20"
            >
              <Info size={16} className="text-white" />
            </Button>

            <Button 
              variant="ghost" 
              size="icon" 
              onClick={(e) => {
                e.stopPropagation()
                onClose()
              }}
              aria-label="Close (Esc)"
              className="text-white hover:text-white hover:bg-white/20"
            >
              <X size={16} className="text-white" />
            </Button>
          </div>
        </div>

        {/* Image area with pan/zoom */}
        <div
          ref={imgContainerRef}
          className="relative w-full h-full flex items-center justify-center touch-pan-y"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMovePan}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={onDoubleClick}
        >
          <img
            src={src}
            alt={photo.filename ?? "photo"}
            className="max-w-[90vw] max-h-[90vh] object-contain select-none"
            draggable={false}
            onWheel={onWheel}
            style={{
              transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
              transition: isPanning.current ? 'none' : 'transform 120ms ease-out',
            }}
          />
        </div>

        {/* Right-side metadata sidebar */}
        <aside
          className={cn(
            "absolute top-0 right-0 h-full w-[360px] bg-card/95 backdrop-blur-sm border-l p-4 overflow-auto transition-transform z-40",
            showInfo ? "translate-x-0 opacity-100" : "translate-x-[110%] opacity-0"
          )}
          style={{ scrollbarGutter: 'stable' }}
          aria-hidden={!showInfo}
          onWheel={(e) => {
            e.stopPropagation() // prevent sidebar scroll from affecting image zoom
          }}
        >
          <div className="flex items-start justify-between gap-2 mb-4">
            <h3 className="text-lg font-semibold">Info</h3>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setShowInfo(false)} 
              aria-label="Close info"
              className="hover:bg-gray-100"
            >
              <X size={16} />
            </Button>
          </div>

          <div className="space-y-3 text-sm">
            <div className="bg-gray-50 p-3 rounded-lg">
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Name</div>
              <div className="font-medium text-gray-900">{photo.filename ?? '—'}</div>
            </div>

            <div className="bg-gray-50 p-3 rounded-lg">
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Type</div>
              <div className="font-medium text-gray-900">{photo.mimeType || 'image/*'}</div>
            </div>

            <div className="bg-gray-50 p-3 rounded-lg">
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Size</div>
              <div className="font-medium text-gray-900">{formatBytes(photo.fileSize)}</div>
            </div>

            <div className="bg-gray-50 p-3 rounded-lg">
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Last modified</div>
              <div className="font-medium text-gray-900">{formatDate(photo.lastModified)}</div>
            </div>

            {photo.dateTimeOriginal && (
              <div className="bg-gray-50 p-3 rounded-lg">
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Date taken</div>
                <div className="font-medium text-gray-900">{formatDate(photo.dateTimeOriginal)}</div>
              </div>
            )}

            <div className="bg-gray-50 p-3 rounded-lg">
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Image dimensions</div>
              <div className="font-medium text-gray-900">{dimensions ? `${dimensions.w} × ${dimensions.h}` : 'Loading…'}</div>
            </div>

            {photo.metadata && (
              <div className="bg-gray-50 p-3 rounded-lg">
                <button
                  onClick={() => setShowAdvancedDetails(!showAdvancedDetails)}
                  className="flex items-center justify-between w-full text-left"
                >
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Advanced Details</div>
                  {showAdvancedDetails ? (
                    <ChevronDown size={14} className="text-gray-500" />
                  ) : (
                    <ChevronRight size={14} className="text-gray-500" />
                  )}
                </button>
                
                {showAdvancedDetails && (
                  <div className="mt-2 space-y-2">
                    {Object.entries(photo.metadata)
                      .filter(([key, value]) => value != null && value !== '' && key !== 'filename' && key !== 'fileSize' && key !== 'mimeType' && key !== 'lastModified')
                      .map(([key, value]) => (
                        <div key={key} className="flex justify-between">
                          <span className="text-gray-600 text-xs">{key}:</span>
                          <span className="font-medium text-xs text-right max-w-[60%] break-words">
                            {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                          </span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}