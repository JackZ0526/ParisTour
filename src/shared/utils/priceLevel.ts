import type { Locale, TranslationKey } from './../i18n/types'
import { translate } from '../i18n/i18nStore'

/** Key map: Google `priceLevel` enum → i18n dictionary key. */
const TIER_KEYS: Record<number, TranslationKey> = {
  0: 'place.priceTier0',
  1: 'place.priceTier1',
  2: 'place.priceTier2',
  3: 'place.priceTier3',
  4: 'place.priceTier4',
}

function symbolCount(value: string): number {
  const runs = [...value.matchAll(/([$€£¥])\1{0,3}/g)]
  if (!runs.length) return 0
  return Math.min(4, Math.max(...runs.map((match) => match[0].length)))
}

/**
 * Map Google `priceLevel` or Tripadvisor `$` / `€€€` text → display chip.
 *
 * `locale` is the target dictionary locale; the symbol prefix (€, $, £, ¥) is
 * always kept from the input so the chip reads naturally in either language.
 * Pass `undefined` to fall back to the active i18n locale.
 */
export function formatPriceLevelLabel(
  priceLevel: string | undefined | null,
  locale?: Locale,
): string | null {
  if (!priceLevel) return null

  const raw = priceLevel.trim()
  if (!raw) return null

  if (/\d/.test(raw) && /[$€£¥]/.test(raw)) return raw

  const key = raw.toUpperCase().replace(/^PRICE_LEVEL_/, '')
  let tier: number | null = null
  switch (key) {
    case 'FREE':
      tier = 0
      break
    case 'INEXPENSIVE':
      tier = 1
      break
    case 'MODERATE':
      tier = 2
      break
    case 'EXPENSIVE':
      tier = 3
      break
    case 'VERY_EXPENSIVE':
      tier = 4
      break
    default: {
      const count = symbolCount(raw)
      if (count >= 1) tier = count
    }
  }

  if (tier == null) return null
  return translate(TIER_KEYS[tier], undefined, locale)
}
