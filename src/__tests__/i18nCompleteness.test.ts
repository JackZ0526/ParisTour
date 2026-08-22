import { describe, it, expect } from 'vitest'
import { zhCN } from '../shared/i18n/locales/zh-CN'
import { en } from '../shared/i18n/locales/en'

function getKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.keys(obj).flatMap((key) => {
    const val = obj[key]
    const nextKey = prefix ? `${prefix}.${key}` : key
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      return getKeys(val as Record<string, unknown>, nextKey)
    }
    return [nextKey]
  })
}

describe('i18n Completeness', () => {
  it('en locale has all keys present in zh-CN', () => {
    const zhKeys = getKeys(zhCN as unknown as Record<string, unknown>)
    const enKeys = getKeys(en as unknown as Record<string, unknown>)

    const missingInEn = zhKeys.filter((k) => !enKeys.includes(k))
    const extraInEn = enKeys.filter((k) => !zhKeys.includes(k))

    expect(missingInEn).toEqual([])
    expect(extraInEn).toEqual([])
  })
})
