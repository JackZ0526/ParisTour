import { loadDestination } from './destination'

export interface TripCity {
  /** English name used in Tripadvisor / Maps queries. */
  nameEn: string
  /** ISO 3166-1 alpha-2 country code used by destination-aware branding. */
  countryCode?: string
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
    countryCode: 'FR',
    tripadvisorGeoId: '187147',
    regionPattern: /île-de-france|ile-de-france/i,
    aliases: ['paris', 'paris, france', 'paris france', '巴黎'],
  },
  { nameEn: 'Tokyo', countryCode: 'JP', aliases: ['tokyo', '东京', '東京'] },
  { nameEn: 'Rome', countryCode: 'IT', aliases: ['rome', 'roma', '罗马', '羅馬'] },
  {
    nameEn: 'Barcelona',
    countryCode: 'ES',
    aliases: ['barcelona', '巴塞罗那', '巴塞隆納'],
  },
  {
    nameEn: 'New York',
    countryCode: 'US',
    aliases: ['new york', 'new york city', 'nyc', '纽约', '紐約'],
  },
  { nameEn: 'London', countryCode: 'GB', aliases: ['london', '伦敦', '倫敦'] },
  { nameEn: 'Kyoto', countryCode: 'JP', aliases: ['kyoto', '京都'] },
  {
    nameEn: 'Florence',
    countryCode: 'IT',
    aliases: ['florence', 'firenze', '佛罗伦萨', '佛羅倫斯'],
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
          countryCode: city.countryCode,
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
        countryCode: known.countryCode,
        tripadvisorGeoId: known.tripadvisorGeoId,
        regionPattern: known.regionPattern,
      }
    }
    return { nameEn: latin }
  }
  if (raw) return { nameEn: raw }
  return {
    nameEn: KNOWN_CITIES[0].nameEn,
    countryCode: KNOWN_CITIES[0].countryCode,
    tripadvisorGeoId: KNOWN_CITIES[0].tripadvisorGeoId,
    regionPattern: KNOWN_CITIES[0].regionPattern,
  }
}

function flagForCountryCode(countryCode?: string): string {
  const code = countryCode?.trim().toUpperCase()
  if (!code || !/^[A-Z]{2}$/.test(code)) return '🧭'
  return String.fromCodePoint(
    ...Array.from(code, (letter) => 0x1f1e6 + letter.charCodeAt(0) - 65),
  )
}

export interface DestinationBrand {
  flag: string
  title: string
}

/** Header branding derived from the same destination value used by trip logic. */
export function destinationBrandFromDestination(destination: string): DestinationBrand {
  const city = tripCityFromDestination(destination)
  return {
    flag: flagForCountryCode(city.countryCode),
    title: `${city.nameEn} Tour`,
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
