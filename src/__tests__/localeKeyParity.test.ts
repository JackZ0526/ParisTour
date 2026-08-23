import { describe, it, expect } from 'vitest'
import { en } from '../shared/i18n/locales/en'
import { zhCN } from '../shared/i18n/locales/zh-CN'

function getKeys(obj: unknown, prefix = ''): string[] {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return []
  const out: string[] = []
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out.push(...getKeys(v, path))
    } else {
      out.push(path)
    }
  }
  return out
}

describe('locale key parity', () => {
  const enKeys = new Set(getKeys(en))
  const zhKeys = new Set(getKeys(zhCN))

  it('en and zh-CN have the same set of keys', () => {
    const inEnNotZh = [...enKeys].filter((k) => !zhKeys.has(k))
    const inZhNotEn = [...zhKeys].filter((k) => !enKeys.has(k))
    if (inEnNotZh.length > 0) {
      console.error('Keys in en but missing in zh-CN:', inEnNotZh)
    }
    if (inZhNotEn.length > 0) {
      console.error('Keys in zh-CN but missing in en:', inZhNotEn)
    }
    expect(inEnNotZh).toEqual([])
    expect(inZhNotEn).toEqual([])
  })

  it('en has preferenceTag block (15 codes)', () => {
    const prefTagKeys = [...enKeys].filter((k) => k.startsWith('preferenceTag.'))
    expect(prefTagKeys.length).toBe(15)
  })

  it('zh-CN has preferenceTag block (15 codes)', () => {
    const prefTagKeys = [...zhKeys].filter((k) => k.startsWith('preferenceTag.'))
    expect(prefTagKeys.length).toBe(15)
  })

  it('en has itinerary.cdgAirportLabel', () => {
    expect(enKeys.has('itinerary.cdgAirportLabel')).toBe(true)
  })
})
