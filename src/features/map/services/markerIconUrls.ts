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
export const SPECIAL_MARKER_SIZE = 32

function toDataUrl(svg: string) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

/** Render a Lucide glyph as the circular data-URL marker MapLibre expects. */
function specialMarkerSvg(Icon: LucideIcon, fill = SPECIAL_MARKER_COLOR) {
  return renderToStaticMarkup(
    createElement(
      'svg',
      {
        xmlns: 'http://www.w3.org/2000/svg',
        width: SPECIAL_MARKER_SIZE,
        height: SPECIAL_MARKER_SIZE,
        viewBox: `0 0 ${SPECIAL_MARKER_SIZE} ${SPECIAL_MARKER_SIZE}`,
      },
      createElement('circle', {
        cx: 16,
        cy: 16,
        r: 15,
        fill,
        stroke: '#fff',
        strokeWidth: 2,
      }),
      createElement(Icon, {
        x: 7,
        y: 7,
        width: 18,
        height: 18,
        color: '#fff',
        strokeWidth: 2,
        'aria-hidden': true,
      }),
    ),
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
