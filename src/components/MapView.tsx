import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { ImageRecord } from '@/lib/image-repository'
import { useDirectory } from '@/contexts/DirectoryContext'

interface MapViewProps {
  photos: ImageRecord[]
}

export default function MapView({ photos }: MapViewProps) {
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
  }, [])

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
      const popup = document.createElement('div')

      const img = document.createElement('img')
      img.style.width = '200px'
      img.style.height = 'auto'
      img.alt = photo.filename ?? 'Photo'
      popup.appendChild(img)

      const title = document.createElement('div')
      title.style.marginTop = '6px'
      title.style.fontWeight = '600'
      title.textContent = photo.filename ?? 'Photo'
      popup.appendChild(title)

      marker.bindPopup(popup)
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
