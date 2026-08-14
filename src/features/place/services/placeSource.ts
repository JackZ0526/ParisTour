export type PlaceInfoSource =
  | 'google'
  | 'tripadvisor'
  | 'booking'
  | 'website'
  | 'wikimedia'

const SOURCE_LABEL: Record<PlaceInfoSource, string> = {
  google: 'Google',
  tripadvisor: 'Tripadvisor',
  booking: 'Booking.com',
  website: '官网',
  wikimedia: 'Wikimedia',
}

export function placeSourceLabel(source: PlaceInfoSource): string {
  return SOURCE_LABEL[source]
}
