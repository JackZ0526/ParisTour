import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  House as LucideHouse,
  Plane as LucidePlane,
  type LucideIcon,
} from 'lucide-react'

/** Copper — airport plane & hotel house (special vs numbered). */
export const SPECIAL_MARKER_COLOR = '#b56a3c'
/** Sage — numbered place stops (default). */
export const NUMBER_MARKER_COLOR = '#4a6356'
/** Copper — numbered stop when selected on the map. */
export const NUMBER_MARKER_ACTIVE_COLOR = '#b56a3c'

function toDataUrl(svg: string) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

/** Render a Lucide glyph as the circular data-URL marker Leaflet expects. */
function specialMarkerSvg(Icon: LucideIcon, fill = SPECIAL_MARKER_COLOR) {
  return renderToStaticMarkup(
    createElement(Icon, {
      xmlns: 'http://www.w3.org/2000/svg',
      width: 40,
      height: 40,
      color: '#fff',
      strokeWidth: 2,
      style: {
        backgroundColor: fill,
        border: '3px solid #fff',
        borderRadius: '50%',
        boxSizing: 'border-box',
        padding: 7,
      },
      'aria-hidden': true,
    }),
  )
}

export function homeIconUrl() {
  return toDataUrl(specialMarkerSvg(LucideHouse))
}

export function airportIconUrl() {
  return toDataUrl(specialMarkerSvg(LucidePlane))
}

export function numberIconUrl(n: number, active: boolean) {
  const bg = active ? NUMBER_MARKER_ACTIVE_COLOR : NUMBER_MARKER_COLOR
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30">
  <circle cx="15" cy="15" r="13" fill="${bg}" stroke="#fff" stroke-width="2"/>
  <text x="15" y="20" text-anchor="middle" fill="#fff" font-size="13" font-family="Arial,sans-serif" font-weight="700">${n}</text>
</svg>`
  return toDataUrl(svg)
}

export function HouseIcon({ size = 14 }: { size?: number }) {
  return <LucideHouse size={size} strokeWidth={2} aria-hidden />
}

export function PlaneIcon({ size = 14 }: { size?: number }) {
  return <LucidePlane size={size} strokeWidth={2} aria-hidden />
}
