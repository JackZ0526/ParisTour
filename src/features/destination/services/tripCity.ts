import { loadDestination } from './destination'

export interface TripCity {
  /** English name used in Tripadvisor / Maps queries. */
  nameEn: string
  /** Tripadvisor geoId for seeded Paris listings. */
  tripadvisorGeoId?: string
  /** Extra location tokens that still count as this city. */
  regionPattern?: RegExp
}

interface KnownCity extends TripCity {
  aliases: string[]
}

const KNOWN_CITIES: KnownCity[] = [
  {
    nameEn: 'Paris',
    tripadvisorGeoId: '187147',
    regionPattern: /île-de-france|ile-de-france/i,
    aliases: ['paris', 'paris, france', 'paris france', '巴黎'],
  },
]

function normalizeDestination(value: string): string {
  return value
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Resolve the active trip city. Destination may be Chinese, English, or "City, Country". */
export function tripCityFromDestination(destination?: string): TripCity {
  const raw = (destination?.trim() || loadDestination() || '').trim()
  const normalized = normalizeDestination(raw)
  if (normalized) {
    for (const city of KNOWN_CITIES) {
      if (
        city.aliases.some(
          (alias) =>
            normalized === alias ||
            normalized.startsWith(`${alias},`) ||
            normalized.endsWith(`, ${alias}`) ||
            normalized.includes(alias),
        )
      ) {
        return {
          nameEn: city.nameEn,
          tripadvisorGeoId: city.tripadvisorGeoId,
          regionPattern: city.regionPattern,
        }
      }
    }
  }
  const latin = raw.match(/[A-Za-z][A-Za-z\-']+(?:\s+[A-Za-z][A-Za-z\-']+)*/)?.[0]?.trim()
  if (latin) {
    const known = KNOWN_CITIES.find((city) => city.nameEn.toLowerCase() === latin.toLowerCase())
    if (known) {
      return {
        nameEn: known.nameEn,
        tripadvisorGeoId: known.tripadvisorGeoId,
        regionPattern: known.regionPattern,
      }
    }
    return { nameEn: latin }
  }
  if (raw) return { nameEn: raw }
  return {
    nameEn: KNOWN_CITIES[0].nameEn,
    tripadvisorGeoId: KNOWN_CITIES[0].tripadvisorGeoId,
    regionPattern: KNOWN_CITIES[0].regionPattern,
  }
}

export function appendCityToQuery(query: string, cityName: string): string {
  const city = cityName.trim()
  const core = query
    .replace(new RegExp(`\\b${escapeRegExp(city)}\\b`, 'gi'), ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!core) return city
  return `${core} ${city}`
}

export function locationBelongsToCity(label: string, city: TripCity): boolean {
  const value = label.trim()
  if (!value) return true
  if (new RegExp(`\\b${escapeRegExp(city.nameEn)}\\b`, 'i').test(value)) return true
  return Boolean(city.regionPattern?.test(value))
}
