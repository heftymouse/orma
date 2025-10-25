import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { ImageRecord } from '@/lib/image-repository'
import { useDirectory } from '@/contexts/DirectoryContext'

interface MapViewProps {
  photos: ImageRecord[]
  onBoundsChange?: (bounds: { north: number; south: number; east: number; west: number }) => void
}

export default function MapView({ photos, onBoundsChange }: MapViewProps) {
  const mapRef = useRef<any | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const markersRef = useRef<any | null>(null)
  const { createBlobUrl } = useDirectory()

  // initialize map + OSM tile layer once
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return

      const map = L.map(containerRef.current, {
      center: [20, 0],
      zoom: 2,
      minZoom: 1,
      maxZoom: 18,
    })

    L.tileLayer('http://localhost:9999/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map)

    markersRef.current = L.layerGroup().addTo(map)
    mapRef.current = map

    // Emit bounds on map move/zoom
    const updateBounds = () => {
      const bounds = map.getBounds()
      onBoundsChange?.({
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest(),
      })
    }
    
    map.on('moveend', updateBounds)
    map.on('zoomend', updateBounds)
    
    // Initial bounds
    setTimeout(updateBounds, 100)

    // Leaflet needs a size invalidation when the container becomes visible
    // and on resizes — call invalidateSize shortly after mount.
    setTimeout(() => {
      try {
        map.invalidateSize()
      } catch {}
    }, 50)

    const onResize = () => {
      try {
        map.invalidateSize()
      } catch {}
    }
    window.addEventListener('resize', onResize)

    return () => {
      window.removeEventListener('resize', onResize)
      map.remove()
      mapRef.current = null
      markersRef.current = null
    }
  }, [onBoundsChange])

  // render markers whenever photos update
  useEffect(() => {
    const map = mapRef.current
    const markers = markersRef.current
    if (!map || !markers) return

    markers.clearLayers()

    // Ensure Leaflet knows the container size before adding markers
    try {
      map.invalidateSize()
    } catch {}

    const toDecimal = (arr?: [number, number, number]) => {
      if (!arr) return undefined
      return arr[0] + (arr[1] ?? 0) / 60 + (arr[2] ?? 0) / 3600
    }

  const addedMarkers: any[] = []

    for (const photo of photos) {
      const lat = toDecimal(photo.gpsLatitude as any)
      const lon = toDecimal(photo.gpsLongitude as any)
      if (lat == null || lon == null) continue
      const marker = L.marker([lat, lon])

      // create a small circular image element for the tooltip (shown on hover)
  const tooltipEl = document.createElement('div')
  // Make the tooltip element a circular container and clip its contents
  tooltipEl.style.display = 'block'
  tooltipEl.style.width = '80px'
  tooltipEl.style.height = '80px'
  // tooltipEl.style.borderRadius = '50%'
  tooltipEl.style.overflow = 'hidden'
  tooltipEl.style.background = 'transparent'
  // add the white ring on the container itself
  tooltipEl.style.border = '2px solid rgba(255,255,255,0.9)'

  const img = document.createElement('img')
  // make the image fill the circular container; no background so we don't see a square
  img.style.width = '100%'
  img.style.height = '100%'
  img.style.objectFit = 'cover'
  img.alt = photo.filename ?? 'Photo'

  // set a tiny transparent SVG as a safe placeholder so the element renders at the correct size
  img.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"></svg>'

  tooltipEl.appendChild(img)

      // bind tooltip (default Leaflet behavior: show on hover)
      // use a custom class so we can style/hide tooltip background
      marker.bindTooltip(tooltipEl as any, {
        direction: 'top',
        offset: [0, -10],
        className: 'leaflet-photo-tooltip',
      })

      markers.addLayer(marker)
      addedMarkers.push(marker)

      // load thumbnail asynchronously
      createBlobUrl(photo.path)
        .then((url) => {
          if (url) img.src = url
        })
        .catch(() => {
          /* ignore */
        })
    }

    // fit map to markers if any
    if (addedMarkers.length > 0) {
      const group = L.featureGroup(addedMarkers)
      try {
        // ensure map size is up to date before fitting
        try { map.invalidateSize() } catch {}
        map.fitBounds(group.getBounds().pad(0.2))
      } catch {
        // ignore fit failures for single/invalid bounds
      }
    }
  }, [photos, createBlobUrl])

  return <div ref={containerRef} style={{ width: '100%', height: '100%', minHeight: 300 }} />
}
