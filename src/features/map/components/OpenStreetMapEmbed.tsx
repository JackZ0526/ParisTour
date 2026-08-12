import { CircleMarker, MapContainer, TileLayer } from 'react-leaflet'
import type { Coordinates } from '../../../types'

export function OpenStreetMapEmbed({
  location,
  title,
}: {
  location: Coordinates
  title: string
}) {
  return (
    <MapContainer
      center={[location.lat, location.lng]}
      zoom={16}
      scrollWheelZoom={false}
      dragging={false}
      doubleClickZoom={false}
      keyboard={false}
      zoomControl
      attributionControl
      className="h-[260px] w-full"
      aria-label={`${title} 地图位置`}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <CircleMarker
        center={[location.lat, location.lng]}
        radius={9}
        pathOptions={{
          color: '#ffffff',
          fillColor: '#b56a3c',
          fillOpacity: 1,
          opacity: 1,
          weight: 3,
        }}
      />
    </MapContainer>
  )
}
