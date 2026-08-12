import { describe, expect, it } from 'vitest'
import {
  categorizeFacilities,
  localizeFacility,
  localizePropertyType,
} from '../features/hotel/utils/hotelDisplay'

describe('hotelDisplay', () => {
  it('localizes property types and facilities', () => {
    expect(localizePropertyType('Hotels')).toBe('酒店')
    expect(localizeFacility('Private bathroom')).toBe('独立浴室')
    expect(localizeFacility('Hot tub')).toBe('按摩浴缸')
    expect(localizeFacility('Free Wifi')).toBe('免费 Wi-Fi')
  })

  it('groups facilities into categories', () => {
    const groups = categorizeFacilities([
      'Free Wifi',
      'Restaurant',
      'Private bathroom',
      '24-hour front desk',
    ])

    expect(groups.map((group) => group.category)).toEqual(['网络', '餐饮', '客房', '服务'])
  })
})
