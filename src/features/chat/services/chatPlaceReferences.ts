import type { Place, PlaceType } from '../../../types'

/** Display references only: opening one must never create an itinerary action. */
export interface ChatPlaceReference {
  name: string
  label?: string
  type?: PlaceType
  address?: string
}

const PLACE_TYPES = new Set<PlaceType>(['attraction', 'restaurant', 'cafe', 'hotel', 'transport'])
const GENERIC_NAMES = /^(?:place|restaurant|cafe|hotel|museum|景点|地点|餐厅|咖啡馆|酒店|博物馆)$/i
const clean = (value: unknown, limit: number) => typeof value === 'string' ? value.trim().slice(0, limit) : ''

export function parseChatPlaceReferences(raw: unknown, reply: string): ChatPlaceReference[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const result: ChatPlaceReference[] = []
  for (const value of raw.slice(0, 24)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue
    const name = clean(value.name, 180)
    const label = clean(value.label, 180)
    if (name.length < 2 || GENERIC_NAMES.test(name)) continue
    if (![name, label].some(text => text && reply.toLocaleLowerCase().includes(text.toLocaleLowerCase()))) continue
    const address = clean(value.address, 300)
    const key = `${name.toLocaleLowerCase()}|${address.toLocaleLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    const type = PLACE_TYPES.has(value.type) ? value.type as PlaceType : undefined
    result.push({ name, ...(label && label !== name ? { label } : {}), ...(type ? { type } : {}), ...(address ? { address } : {}) })
  }
  return result
}

export function referenceFromPlace(place: Place): ChatPlaceReference {
  return { name: place.name, label: place.nameLocal, type: place.type, address: place.googleAddress }
}

/** The detail header expects a Chinese alias, not the combined chat label. */
export function chatPlaceLocalName(reference: ChatPlaceReference): string | undefined {
  if (!reference.label || !/\p{Script=Han}/u.test(reference.label)) return undefined
  const original = reference.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return reference.label.replace(new RegExp(`\\s*[（(]\\s*${original}\\s*[）)]\\s*$`, 'iu'), '').trim() || undefined
}

export function findKnownChatPlace(reference: ChatPlaceReference, places: readonly Place[]): Place | undefined {
  const names = [reference.name, reference.label].filter(Boolean).map(name => name!.toLocaleLowerCase())
  return places.find(place => {
    if (![place.name, place.nameLocal].some(name => name && names.includes(name.toLocaleLowerCase()))) return false
    if (!reference.address || !place.googleAddress) return true
    const a = reference.address.toLocaleLowerCase()
    const b = place.googleAddress.toLocaleLowerCase()
    return a.includes(b) || b.includes(a)
  })
}
