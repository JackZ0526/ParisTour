import type { SelectedHotel } from '../types'

/** Soft placeholder until LLM / custom hotel is ready. */
export const PENDING_HOTEL: SelectedHotel = {
  id: 'hotel-pending',
  name: '待选择酒店',
  address: 'Paris, France',
  lat: 48.8566,
  lng: 2.3522,
  nearestMetro: '',
  areaKey: 'custom',
  source: 'recommended',
}

/** Map free-text area labels to itinerary metroHintFromArea keys. */
export function hotelAreaKeyFromLabel(area: string): string {
  const a = area.toLowerCase()
  if (a.includes('marais') || a.includes('玛黑') || a.includes('le marais')) return 'marais'
  if (a.includes('opéra') || a.includes('opera') || a.includes('欧培拉') || a.includes('saint-lazare'))
    return 'opera'
  if (a.includes('boulevard') || a.includes('2e') || a.includes('2ème') || a.includes('泊松'))
    return 'boulevards'
  if (
    a.includes('saint-germain') ||
    a.includes('saint germain') ||
    a.includes('左岸') ||
    a.includes('6e') ||
    a.includes('6ème')
  )
    return 'saintGermain'
  if (a.includes('latin') || a.includes('拉丁') || a.includes('odeon') || a.includes('odéon'))
    return 'latin'
  return 'custom'
}
