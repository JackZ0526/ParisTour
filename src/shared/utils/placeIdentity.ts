import { placeIdentitySimilarity } from './placeTitle'

export interface PlaceIdentity {
  id?: string
  placeId?: string
  googlePlaceId?: string
  tripadvisorContentId?: string
  name: string
  nameLocal?: string
  location?: { lat: number; lng: number }
}
const googleId = (p: PlaceIdentity) => (p.googlePlaceId || (p.id?.startsWith('ChI') || p.id?.startsWith('places/') ? p.id : '') || '').replace(/^places\//, '')
const labels = (p: PlaceIdentity) => [p.name, p.nameLocal].filter((s): s is string => Boolean(s?.trim()))

/** Provider identity wins over display language; distant namesakes stay separate. */
export function samePlace(a: PlaceIdentity, b: PlaceIdentity): boolean {
  const ga = googleId(a), gb = googleId(b)
  if (ga && gb) return ga === gb
  if (a.tripadvisorContentId && b.tripadvisorContentId) return a.tripadvisorContentId === b.tripadvisorContentId
  if ((a.placeId || a.id) && (a.placeId || a.id) === (b.placeId || b.id)) return true
  if (a.location && b.location) {
    const dy = (a.location.lat - b.location.lat) * 111_000
    const dx = (a.location.lng - b.location.lng) * 111_000 * Math.cos(a.location.lat * Math.PI / 180)
    if (Math.hypot(dx, dy) > 300) return false
  }
  const digits = (s: string) => s.match(/\d+/g)?.join(',') || ''
  if (digits(a.name) !== digits(b.name)) return false
  return labels(a).some(x => labels(b).some(y => placeIdentitySimilarity(x, y) >= 0.98))
}

export function uniquePlaces<T extends PlaceIdentity>(rows: T[]): T[] {
  const result: T[] = []
  for (const row of rows) if (!result.some(other => samePlace(row, other))) result.push(row)
  return result
}
