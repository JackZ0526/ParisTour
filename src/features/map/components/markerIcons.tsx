/**
 * Shared special-marker artwork for timeline badges and Google Map pins.
 * Airport = plane, hotel = house; both use copper so they stand apart from
 * sage/ink numbered place markers.
 */

/** Copper — airport plane & hotel house (special vs numbered). */
export const SPECIAL_MARKER_COLOR = '#b56a3c'
/** Sage — numbered place stops (default). */
export const NUMBER_MARKER_COLOR = '#4a6356'
/** Copper — numbered stop when selected on the map. */
export const NUMBER_MARKER_ACTIVE_COLOR = '#b56a3c'

/** Plane silhouette in a 24×24 viewBox (timeline + map). */
export const PLANE_PATH =
  'M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z'

/** House silhouette in a 24×24 viewBox (timeline + map). */
export const HOUSE_PATH =
  'M12 3.5 20.5 11h-2v8.5h-5v-5h-3v5h-5V11H3.5L12 3.5z'

function toDataUrl(svg: string) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

/** Circular map pin with a 24×24 glyph scaled into the center. */
function specialMarkerSvg(path: string, fill = SPECIAL_MARKER_COLOR) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
  <circle cx="20" cy="20" r="18" fill="${fill}" stroke="#fff" stroke-width="3"/>
  <g transform="translate(20 20) scale(0.72) translate(-12 -12)" fill="#fff">
    <path d="${path}"/>
  </g>
</svg>`
}

export function homeIconUrl() {
  return toDataUrl(specialMarkerSvg(HOUSE_PATH))
}

export function airportIconUrl() {
  return toDataUrl(specialMarkerSvg(PLANE_PATH))
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
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d={HOUSE_PATH} />
    </svg>
  )
}

export function PlaneIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d={PLANE_PATH} />
    </svg>
  )
}
