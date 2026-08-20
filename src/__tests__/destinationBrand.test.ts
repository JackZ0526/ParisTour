import { describe, expect, it } from 'vitest'
import {
  destinationBrandFromDestination,
  tripCityFromDestination,
} from '../features/destination/services/tripCity'

describe('destination-aware branding', () => {
  it('keeps the current Paris brand for the locked destination', () => {
    expect(destinationBrandFromDestination('巴黎')).toEqual({
      flag: '🇫🇷',
      title: 'Paris Tour',
    })
  })

  it('updates the flag and title for a future known destination selection', () => {
    expect(destinationBrandFromDestination('东京')).toEqual({
      flag: '🇯🇵',
      title: 'Tokyo Tour',
    })
    expect(tripCityFromDestination('东京')).toMatchObject({
      nameEn: 'Tokyo',
      countryCode: 'JP',
    })
  })

  it('uses a neutral travel mark for an unknown destination', () => {
    expect(destinationBrandFromDestination('Reykjavik')).toEqual({
      flag: '🧭',
      title: 'Reykjavik Tour',
    })
  })
})
