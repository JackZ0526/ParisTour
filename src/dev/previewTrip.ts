import { itinerary } from '../features/itinerary/constants/itinerary'
import { collectTripSnapshot, applyTripSnapshot } from '../features/cloud-sync/services/tripSnapshot'
import { buildItineraryFingerprint } from '../features/itinerary/utils/itineraryState'
import { flushHotelCacheToStorage } from '../features/hotel/services/hotelCache'
import type { FlightInfo, Place, SelectedHotel } from '../types'

/** Explicit local-only fixture; never overwrite an existing itinerary or sync to an account. */
export function seedPreviewTrip() {
  if (!import.meta.env.DEV || import.meta.env.VITE_ENABLE_CLOUD_SYNC_ON_LOCAL === 'true'
    || !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) return false
  const previous = collectTripSnapshot()
  if (previous.itinerary?.days.length) return false
  localStorage.setItem('paris-tour-before-preview-seed', JSON.stringify(previous))
  const dates = { startDate: '2026-10-11', endDate: '2026-10-18' }
  const hotel: SelectedHotel = {
    id: 'preview-hotel-paris-france', name: 'Hôtel Paris France',
    address: '72 Rue de Turbigo, 75003 Paris, France', lat: 48.8677, lng: 2.3604,
    nearestMetro: 'Temple', areaKey: 'marais', source: 'custom',
    description: 'Local preview fixture. No reservation has been made.',
  }
  const outbound: FlightInfo = {
    flightNumber: 'AF375', airline: 'Air France', source: 'manual',
    from: { code: 'YVR', city: 'Vancouver', scheduled: '2026-10-11T13:30:00-07:00', timeZone: 'America/Vancouver' },
    to: { code: 'CDG', city: 'Paris', scheduled: '2026-10-12T08:15:00+02:00', timeZone: 'Europe/Paris' },
    duration: '9h 45m', rawNote: 'Preview only: sample schedule, not verified flight information.',
  }
  const returnFlight: FlightInfo = {
    flightNumber: 'AF374', airline: 'Air France', source: 'manual',
    from: { code: 'CDG', city: 'Paris', scheduled: '2026-10-18T10:30:00+02:00', timeZone: 'Europe/Paris' },
    to: { code: 'YVR', city: 'Vancouver', scheduled: '2026-10-18T11:30:00-07:00', timeZone: 'America/Vancouver' },
    duration: '10h', rawNote: 'Preview only: sample schedule, not verified flight information.',
  }
  const fingerprint = buildItineraryFingerprint({
    ...dates, hotelId: hotel.id, itineraryStartDate: '2026-10-12',
    outboundFlight: outbound.flightNumber, returnFlight: returnFlight.flightNumber,
  })
  const days = structuredClone(itinerary)
  const customPlaces: Record<string, Place> = {}
  if (new URLSearchParams(location.search).get('introPreview') === '1') {
    const examples: Place[] = [
      {
        id: 'preview-merci', name: 'Merci', type: 'attraction',
        description: 'Merci 是一家集合家居、服饰与咖啡的概念店，适合慢慢欣赏陈列与设计细节。' + '店内分布着不同的选品空间，可以逐层浏览家居织物、文具和日常器物，感受不同陈列的设计巧思。'.repeat(8),
        ratingHint: '', image: '', location: { lat: 48.8603, lng: 2.3668 }, googleMapsUrl: '',
      },
      {
        id: 'preview-address-only', name: 'Le Carré Élysée', type: 'restaurant',
        description: '49 Av. Franklin Delano Roosevelt, 75008 Paris', googleAddress: '49 Av. Franklin Delano Roosevelt, 75008 Paris',
        ratingHint: '', image: '', location: { lat: 48.872, lng: 2.309 }, googleMapsUrl: '',
      },
    ]
    examples.forEach(place => { customPlaces[place.id] = place })
    days[0].stops.splice(1, days[0].stops.length - 1, ...examples.map((place, index) => ({
      id: `preview-intro-${index}`, placeId: place.id, time: '12:00', note: place.description, walkLevel: 'short' as const, duration: '60 min',
    })))
  }
  applyTripSnapshot({
    ...previous, destination: 'Paris', dates,
    flights: { outbound, returnFlight, outboundInput: 'AF375', returnInput: 'AF374' },
    hotel: { candidates: [], selected: hotel, model: 'local-preview', batch: 0, fetchedAt: Date.now() },
    itinerary: { days, customPlaces, generated: true, fingerprint },
    baseline: { days, customPlaces, fingerprint, savedAt: new Date().toISOString() },
  })
  flushHotelCacheToStorage()
  return true
}
