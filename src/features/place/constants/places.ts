import { runtimeCopy } from '../../../shared/i18n/copy/places-runtime-d3a5e3'
import type { Place } from '../../../types'

function mapsUrl(query: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

/** Cafés, attractions, restaurants — each opens Google Maps for photos & ratings */
export const places: Record<string, Place> = {
  // —— Cafés ——
  'cafe-boots': {
    id: 'cafe-boots',
    name: 'Boot Café',
    nameLocal: 'Boot Café',
    type: 'cafe',
    get description() { return runtimeCopy('mfd50fd66d2', undefined) },
    ratingHint: 'Google ≈ 4.5',
    priceHint: '€',
    image:
      'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=1200&q=80',
    location: { lat: 48.8612, lng: 2.3631 },
    googleMapsUrl: mapsUrl('Boot Café Paris'),
    get durationHint() { return runtimeCopy('me72790c935', undefined) },
  },
  'cafe-kitsune': {
    id: 'cafe-kitsune',
    name: 'Café Kitsuné Palais Royal',
    type: 'cafe',
    get description() { return runtimeCopy('mc36a269a01', undefined) },
    ratingHint: 'Google ≈ 4.3',
    priceHint: '€€',
    image:
      'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=1200&q=80',
    location: { lat: 48.8635, lng: 2.3369 },
    googleMapsUrl: mapsUrl('Café Kitsuné Palais Royal Paris'),
    get durationHint() { return runtimeCopy('m2dad347696', undefined) },
  },
  'cafe-haute': {
    id: 'cafe-haute',
    name: 'Ten Belles',
    type: 'cafe',
    get description() { return runtimeCopy('mb6d7c38fb0', undefined) },
    ratingHint: 'Google ≈ 4.4',
    priceHint: '€€',
    image:
      'https://images.unsplash.com/photo-1453614512568-c4024d13c247?auto=format&fit=crop&w=1200&q=80',
    location: { lat: 48.8726, lng: 2.3628 },
    googleMapsUrl: mapsUrl('Ten Belles Café Paris'),
    get durationHint() { return runtimeCopy('m2dad347696', undefined) },
  },
  'cafe-odette': {
    id: 'cafe-odette',
    name: 'Café de Flore',
    type: 'cafe',
    get description() { return runtimeCopy('mc0d53da1ff', undefined) },
    ratingHint: 'Google ≈ 4.1',
    priceHint: '€€€',
    image:
      'https://images.unsplash.com/photo-1511920170033-f8396924c348?auto=format&fit=crop&w=1200&q=80',
    location: { lat: 48.8541, lng: 2.3325 },
    googleMapsUrl: mapsUrl('Café de Flore Paris'),
    get durationHint() { return runtimeCopy('m3b3ae7380e', undefined) },
  },
  'cafe-disney-start': {
    id: 'cafe-disney-start',
    name: 'Coutume Café',
    type: 'cafe',
    get description() { return runtimeCopy('me02bcb2808', undefined) },
    ratingHint: 'Google ≈ 4.4',
    priceHint: '€€',
    image:
      'https://images.unsplash.com/photo-1498804103079-a6351b050096?auto=format&fit=crop&w=1200&q=80',
    location: { lat: 48.8478, lng: 2.3185 },
    googleMapsUrl: mapsUrl('Coutume Café Paris'),
    get durationHint() { return runtimeCopy('m5211fcbd19', undefined) },
  },
  'cafe-fontaine': {
    id: 'cafe-fontaine',
    name: 'Holybelly 5',
    type: 'cafe',
    get description() { return runtimeCopy('m215891063f', undefined) },
    ratingHint: 'Google ≈ 4.5',
    priceHint: '€€',
    image:
      'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=1200&q=80',
    location: { lat: 48.8735, lng: 2.3639 },
    googleMapsUrl: mapsUrl('Holybelly 5 Paris'),
    get durationHint() { return runtimeCopy('m48f222225e', undefined) },
  },
  'cafe-depart': {
    id: 'cafe-depart',
    name: 'Fragments',
    type: 'cafe',
    get description() { return runtimeCopy('m2bf69e6b02', undefined) },
    ratingHint: 'Google ≈ 4.6',
    priceHint: '€€',
    image:
      'https://images.unsplash.com/photo-1442512595331-e89e73853f31?auto=format&fit=crop&w=1200&q=80',
    location: { lat: 48.8605, lng: 2.3618 },
    googleMapsUrl: mapsUrl('Fragments Café Paris Marais'),
    get durationHint() { return runtimeCopy('m2ddc8a2b7b', undefined) },
  },

  // —— Attractions ——
  'attr-arc': {
    id: 'attr-arc',
    get name() { return runtimeCopy('m23e62bc97b', undefined) },
    nameLocal: 'Arc de Triomphe',
    tripadvisorContentId: '188709',
    type: 'attraction',
    get description() { return runtimeCopy('m5bee264cb2', undefined) },
    ratingHint: 'Google ≈ 4.7',
    image:
      'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=1200&q=80',
    location: { lat: 48.8738, lng: 2.295 },
    googleMapsUrl: mapsUrl('Arc de Triomphe Paris'),
    get durationHint() { return runtimeCopy('mc10fa5f4ea', undefined) },
  },
  'attr-champs': {
    id: 'attr-champs',
    get name() { return runtimeCopy('m539026f721', undefined) },
    nameLocal: 'Avenue des Champs-Élysées',
    tripadvisorContentId: '209760',
    type: 'attraction',
    get description() { return runtimeCopy('m90d8a13dc3', undefined) },
    ratingHint: 'Google ≈ 4.6',
    image:
      'https://images.unsplash.com/photo-1499856871958-5b9627545d1a?auto=format&fit=crop&w=1200&q=80',
    location: { lat: 48.8698, lng: 2.3075 },
    googleMapsUrl: mapsUrl('Champs-Élysées Paris'),
    get durationHint() { return runtimeCopy('m3b3ae7380e', undefined) },
  },
  'attr-monceau': {
    id: 'attr-monceau',
    get name() { return runtimeCopy('md92a3aec00', undefined) },
    nameLocal: 'Parc Monceau',
    type: 'attraction',
    get description() { return runtimeCopy('m0a94a97c41', undefined) },
    ratingHint: 'Google ≈ 4.6',
    image:
      'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=1200&q=80',
    location: { lat: 48.8797, lng: 2.309 },
    googleMapsUrl: mapsUrl('Parc Monceau Paris'),
    get durationHint() { return runtimeCopy('m3b3ae7380e', undefined) },
  },
  'attr-canal': {
    id: 'attr-canal',
    get name() { return runtimeCopy('mc2899c1289', undefined) },
    nameLocal: 'Canal Saint-Martin',
    type: 'attraction',
    get description() { return runtimeCopy('ma563d9c4a6', undefined) },
    ratingHint: 'Google ≈ 4.5',
    image:
      'https://images.unsplash.com/photo-1522093007474-d86e9bf7ba6f?auto=format&fit=crop&w=1200&q=80',
    location: { lat: 48.8715, lng: 2.3658 },
    googleMapsUrl: mapsUrl('Canal Saint-Martin Paris'),
    get durationHint() { return runtimeCopy('m1966ba1b9f', undefined) },
  },
  'attr-passages': {
    id: 'attr-passages',
    get name() { return runtimeCopy('m09c0b543e2', undefined) },
    type: 'attraction',
    get description() { return runtimeCopy('m06da00b3f7', undefined) },
    ratingHint: 'Google ≈ 4.4',
    image:
      'https://images.unsplash.com/photo-1520939817895-060bdaf4fe1b?auto=format&fit=crop&w=1200&q=80',
    location: { lat: 48.871, lng: 2.3415 },
    googleMapsUrl: mapsUrl('Passage des Panoramas Paris'),
    get durationHint() { return runtimeCopy('m2dad347696', undefined) },
  },
  'attr-marais-walk': {
    id: 'attr-marais-walk',
    get name() { return runtimeCopy('m3bb928927b', undefined) },
    type: 'attraction',
    get description() { return runtimeCopy('m6ce2bc7141', undefined) },
    ratingHint: 'Google ≈ 4.7',
    image:
      'https://images.unsplash.com/photo-1471623432079-b009d30b6729?auto=format&fit=crop&w=1200&q=80',
    location: { lat: 48.8555, lng: 2.3655 },
    googleMapsUrl: mapsUrl('Place des Vosges Paris'),
    get durationHint() { return runtimeCopy('m1966ba1b9f', undefined) },
  },
  'attr-luxembourg': {
    id: 'attr-luxembourg',
    get name() { return runtimeCopy('m0ee9df67c1', undefined) },
    nameLocal: 'Jardin du Luxembourg',
    type: 'attraction',
    get description() { return runtimeCopy('mb0662b42e7', undefined) },
    ratingHint: 'Google ≈ 4.7',
    image:
      'https://images.unsplash.com/photo-1549144511-f099e773c147?auto=format&fit=crop&w=1200&q=80',
    location: { lat: 48.8462, lng: 2.3372 },
    googleMapsUrl: mapsUrl('Jardin du Luxembourg Paris'),
    get durationHint() { return runtimeCopy('m6c9227a953', undefined) },
  },
  'attr-ile': {
    id: 'attr-ile',
    get name() { return runtimeCopy('m892d046f9d', undefined) },
    nameLocal: 'Île Saint-Louis',
    type: 'attraction',
    get description() { return runtimeCopy('me727adfad5', undefined) },
    ratingHint: 'Google ≈ 4.6',
    image:
      'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=1200&q=80',
    location: { lat: 48.8515, lng: 2.3565 },
    googleMapsUrl: mapsUrl('Île Saint-Louis Paris'),
    get durationHint() { return runtimeCopy('m3b3ae7380e', undefined) },
  },
  'attr-disney': {
    id: 'attr-disney',
    get name() { return runtimeCopy('mf250700238', undefined) },
    nameLocal: 'Disneyland Paris',
    type: 'attraction',
    get description() { return runtimeCopy('ma7d6237569', undefined) },
    ratingHint: 'Google ≈ 4.5',
    image:
      'https://images.unsplash.com/photo-1578662996442-48f60103fc96?auto=format&fit=crop&w=1200&q=80',
    location: { lat: 48.8674, lng: 2.7838 },
    googleMapsUrl: mapsUrl('Disneyland Paris'),
    get durationHint() { return runtimeCopy('m79b62069f5', undefined) },
  },
  'attr-fontainebleau': {
    id: 'attr-fontainebleau',
    get name() { return runtimeCopy('mfa21eeb5f0', undefined) },
    nameLocal: 'Château de Fontainebleau',
    type: 'attraction',
    get description() { return runtimeCopy('m74fb267253', undefined) },
    ratingHint: 'Google ≈ 4.7',
    image:
      'https://images.unsplash.com/photo-1591289009723-aef0a1a8a04f?auto=format&fit=crop&w=1200&q=80',
    location: { lat: 48.4021, lng: 2.7002 },
    googleMapsUrl: mapsUrl('Château de Fontainebleau'),
    get durationHint() { return runtimeCopy('m6a3ea73979', undefined) },
  },
  'attr-forest': {
    id: 'attr-forest',
    get name() { return runtimeCopy('m5d3fa33eac', undefined) },
    type: 'attraction',
    get description() { return runtimeCopy('m625002960c', undefined) },
    ratingHint: 'Google ≈ 4.6',
    image:
      'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1200&q=80',
    location: { lat: 48.408, lng: 2.655 },
    googleMapsUrl: mapsUrl('Forêt de Fontainebleau Franchard'),
    get durationHint() { return runtimeCopy('m2dad347696', undefined) },
  },
  'attr-cdg': {
    id: 'attr-cdg',
    get name() { return runtimeCopy('mf5da624c58', undefined) },
    nameLocal: 'Aéroport Paris-Charles de Gaulle (CDG)',
    type: 'transport',
    get description() { return runtimeCopy('m38079c1d6f', undefined) },
    ratingHint: '—',
    image:
      'https://images.unsplash.com/photo-1436491865332-7a61a109cab0?auto=format&fit=crop&w=1200&q=80',
    location: { lat: 49.0097, lng: 2.5479 },
    googleMapsUrl: mapsUrl('Paris Charles de Gaulle Airport'),
    get durationHint() { return runtimeCopy('mc103332f2e', undefined) },
  },

  // —— Restaurants ——
  'rest-bouillon': {
    id: 'rest-bouillon',
    name: 'Bouillon Chartier Grands Boulevards',
    type: 'restaurant',
    get description() { return runtimeCopy('m6e01f86d4c', undefined) },
    get cuisine() { return runtimeCopy('md8068eeca9', undefined) },
    ratingHint: 'Google ≈ 4.2',
    priceHint: '€',
    image:
      'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1200&q=80',
    location: { lat: 48.8722, lng: 2.3438 },
    googleMapsUrl: mapsUrl('Bouillon Chartier Grands Boulevards Paris'),
    get durationHint() { return runtimeCopy('m48f222225e', undefined) },
  },
  'rest-clown': {
    id: 'rest-clown',
    name: 'Le Petit Cler',
    type: 'restaurant',
    get description() { return runtimeCopy('m2aa2bb260c', undefined) },
    get cuisine() { return runtimeCopy('mbb2ecd0fbf', undefined) },
    ratingHint: 'Google ≈ 4.4',
    priceHint: '€€',
    image:
      'https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=1200&q=80',
    location: { lat: 48.857, lng: 2.306 },
    googleMapsUrl: mapsUrl('Le Petit Cler Paris'),
    get durationHint() { return runtimeCopy('m8f29e5c330', undefined) },
  },
  'rest-east': {
    id: 'rest-east',
    name: 'East Mamma',
    type: 'restaurant',
    get description() { return runtimeCopy('m2669e8cba7', undefined) },
    get cuisine() { return runtimeCopy('m8833d65830', undefined) },
    ratingHint: 'Google ≈ 4.4',
    priceHint: '€€',
    image:
      'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=1200&q=80',
    location: { lat: 48.8495, lng: 2.3778 },
    googleMapsUrl: mapsUrl('East Mamma Paris'),
    get durationHint() { return runtimeCopy('m8f29e5c330', undefined) },
  },
  'rest-laza': {
    id: 'rest-laza',
    name: 'Laza',
    type: 'restaurant',
    get description() { return runtimeCopy('m70bd5d1eea', undefined) },
    get cuisine() { return runtimeCopy('m38ad335fc7', undefined) },
    ratingHint: 'Google ≈ 4.5',
    priceHint: '€€',
    image:
      'https://images.unsplash.com/photo-1529042410759-befb1204b468?auto=format&fit=crop&w=1200&q=80',
    location: { lat: 48.8658, lng: 2.3785 },
    googleMapsUrl: mapsUrl('Laza Restaurant Paris'),
    get durationHint() { return runtimeCopy('m8f29e5c330', undefined) },
  },
  'rest-asuka': {
    id: 'rest-asuka',
    name: 'Asuka',
    type: 'restaurant',
    get description() { return runtimeCopy('ma935fb2f8e', undefined) },
    get cuisine() { return runtimeCopy('md9decc629e', undefined) },
    ratingHint: 'Google ≈ 4.5',
    priceHint: '€€',
    image:
      'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=1200&q=80',
    location: { lat: 48.8685, lng: 2.342 },
    googleMapsUrl: mapsUrl('Asuka Restaurant Paris'),
    get durationHint() { return runtimeCopy('meaed892bd1', undefined) },
  },
  'rest-breizh': {
    id: 'rest-breizh',
    name: 'Breizh Café – Marais',
    type: 'restaurant',
    get description() { return runtimeCopy('mf4450d2912', undefined) },
    get cuisine() { return runtimeCopy('ma38704c8ad', undefined) },
    ratingHint: 'Google ≈ 4.4',
    priceHint: '€€',
    image:
      'https://images.unsplash.com/photo-1506084868230-bb9d95c24759?auto=format&fit=crop&w=1200&q=80',
    location: { lat: 48.8568, lng: 2.3622 },
    googleMapsUrl: mapsUrl('Breizh Café Marais Paris'),
    get durationHint() { return runtimeCopy('m48f222225e', undefined) },
  },
  'rest-septime': {
    id: 'rest-septime',
    name: 'Le Servan',
    type: 'restaurant',
    get description() { return runtimeCopy('m1f87b6c68f', undefined) },
    get cuisine() { return runtimeCopy('m52012386b4', undefined) },
    ratingHint: 'Google ≈ 4.5',
    priceHint: '€€€',
    image:
      'https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=1200&q=80',
    location: { lat: 48.863, lng: 2.3805 },
    googleMapsUrl: mapsUrl('Le Servan Paris'),
    get durationHint() { return runtimeCopy('m98344af93a', undefined) },
  },
  'rest-fish': {
    id: 'rest-fish',
    name: 'Clamato',
    type: 'restaurant',
    get description() { return runtimeCopy('m074aa02f0a', undefined) },
    get cuisine() { return runtimeCopy('m515aa3902d', undefined) },
    ratingHint: 'Google ≈ 4.4',
    priceHint: '€€€',
    image:
      'https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=1200&q=80',
    location: { lat: 48.8532, lng: 2.3808 },
    googleMapsUrl: mapsUrl('Clamato Paris'),
    get durationHint() { return runtimeCopy('m34e3516a62', undefined) },
  },
  'rest-neige': {
    id: 'rest-neige',
    name: 'Hai Kai',
    type: 'restaurant',
    get description() { return runtimeCopy('mf8a0d45c0b', undefined) },
    get cuisine() { return runtimeCopy('mdd6e0b2d27', undefined) },
    ratingHint: 'Google ≈ 4.5',
    priceHint: '€€',
    image:
      'https://images.unsplash.com/photo-1553621042-f6e147245754?auto=format&fit=crop&w=1200&q=80',
    location: { lat: 48.8652, lng: 2.3675 },
    googleMapsUrl: mapsUrl('Hai Kai Paris'),
    get durationHint() { return runtimeCopy('m8f29e5c330', undefined) },
  },
  'rest-disney': {
    id: 'rest-disney',
    get name() { return runtimeCopy('m1b81be5b78', undefined) },
    type: 'restaurant',
    get description() { return runtimeCopy('mdb62e3aec0', undefined) },
    get cuisine() { return runtimeCopy('ma1bcc37544', undefined) },
    get ratingHint() { return runtimeCopy('m79b5c4501a', undefined) },
    priceHint: '€€',
    image:
      'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1200&q=80',
    location: { lat: 48.8695, lng: 2.782 },
    googleMapsUrl: mapsUrl('Disney Village Disneyland Paris restaurants'),
    get durationHint() { return runtimeCopy('m6c9227a953', undefined) },
  },
  'rest-fontaine-town': {
    id: 'rest-fontaine-town',
    get name() { return runtimeCopy('maa1a1a4578', undefined) },
    type: 'restaurant',
    get description() { return runtimeCopy('m77759601fb', undefined) },
    get cuisine() { return runtimeCopy('mbf2abf2184', undefined) },
    ratingHint: 'Google ≈ 4.5',
    priceHint: '€€',
    image:
      'https://images.unsplash.com/photo-1466978913421-dad2ebd01d17?auto=format&fit=crop&w=1200&q=80',
    location: { lat: 48.4045, lng: 2.7018 },
    googleMapsUrl: mapsUrl('La Petite Menuiserie Fontainebleau'),
    get durationHint() { return runtimeCopy('m8f29e5c330', undefined) },
  },
  'rest-return-eve': {
    id: 'rest-return-eve',
    get name() { return runtimeCopy('m3855f2f022', undefined) },
    type: 'restaurant',
    get description() { return runtimeCopy('mbcca4ff302', undefined) },
    get cuisine() { return runtimeCopy('mcd6bd934af', undefined) },
    get ratingHint() { return runtimeCopy('m041d86d713', undefined) },
    priceHint: '€€',
    image:
      'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80',
    location: { lat: 48.8578, lng: 2.3595 },
    googleMapsUrl: mapsUrl('restaurants near Le Marais Paris'),
    get durationHint() { return runtimeCopy('m48f222225e', undefined) },
  },
  'rest-early': {
    id: 'rest-early',
    get name() { return runtimeCopy('m9e4175da2e', undefined) },
    type: 'restaurant',
    get description() { return runtimeCopy('mbe469732df', undefined) },
    get cuisine() { return runtimeCopy('m54493947e0', undefined) },
    ratingHint: 'Google ≈ 4.2+',
    priceHint: '€–€€',
    image:
      'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1200&q=80',
    location: { lat: 48.8578, lng: 2.3595 },
    googleMapsUrl: mapsUrl('Bouillon Chartier Paris'),
    get durationHint() { return runtimeCopy('m3b3ae7380e', undefined) },
  },
}

export function getPlace(id: string, customPlaces: Record<string, Place> = {}): Place {
  const place = customPlaces[id] || places[id]
  if (!place) {
    throw new Error(`Unknown place: ${id}`)
  }
  return place
}

export function listCatalogPlaces(): Place[] {
  return Object.values(places)
}
