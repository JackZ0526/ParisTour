import type { Locale } from '../../../shared/i18n/types'
import { translate } from '../../../shared/i18n/i18nStore'

export type PlaceInfoSource =
  | 'google'
  | 'tripadvisor'
  | 'booking'
  | 'website'
  | 'wikimedia'

/**
 * Brand names (Google / Tripadvisor / Booking.com / Wikimedia) are proper
 * nouns and stay untranslated across locales. The `website` source is a
 * generic descriptor, so it goes through the i18n dictionary.
 */
const BRAND_LABEL: Record<Exclude<PlaceInfoSource, 'website'>, string> = {
  google: 'Google',
  tripadvisor: 'Tripadvisor',
  booking: 'Booking.com',
  wikimedia: 'Wikimedia',
}

export function placeSourceLabel(source: PlaceInfoSource, locale?: Locale): string {
  if (source === 'website') {
    return translate('place.sourceWebsite', undefined, locale)
  }
  return BRAND_LABEL[source]
}
