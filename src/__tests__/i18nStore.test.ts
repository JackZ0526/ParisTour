import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  getLocale,
  setLocale,
  initLocale,
  translate,
  subscribeLocale,
  isLocale,
  _resetI18nStoreForTests,
} from '../shared/i18n/i18nStore'

describe('i18nStore', () => {
  let storage: Record<string, string> = {}

  beforeEach(() => {
    _resetI18nStoreForTests()
    storage = {}

    const mockLocalStorage = {
      getItem: vi.fn((key: string) => storage[key] ?? null),
      setItem: vi.fn((key: string, val: string) => {
        storage[key] = val
      }),
      removeItem: vi.fn((key: string) => {
        delete storage[key]
      }),
      clear: vi.fn(() => {
        storage = {}
      }),
    }

    vi.stubGlobal('localStorage', mockLocalStorage)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('validates supported locales correctly', () => {
    expect(isLocale('zh-CN')).toBe(true)
    expect(isLocale('en')).toBe(true)
    expect(isLocale('fr')).toBe(true)
    expect(isLocale('de')).toBe(false)
    expect(isLocale(null)).toBe(false)
  })

  it('switches and retrieves active locale', () => {
    expect(getLocale()).toBe('zh-CN')
    setLocale('en')
    expect(getLocale()).toBe('en')
    expect(storage['paris_tour_locale_mode']).toBe('en')
  })

  it('notifies subscribers on locale change', () => {
    let notified = 0
    const unsub = subscribeLocale(() => {
      notified++
    })

    setLocale('en')
    expect(notified).toBe(1)

    unsub()
    setLocale('zh-CN')
    expect(notified).toBe(1)
  })

  it('translates keys with fallback and interpolation', () => {
    setLocale('zh-CN')
    expect(translate('common.confirm')).toBe('确认')
    expect(translate('nav.dayN', { day: 3 })).toBe('第 3 天')

    setLocale('en')
    expect(translate('common.confirm')).toBe('Confirm')
    expect(translate('nav.dayN', { day: 3 })).toBe('Day 3')
  })

  it('falls back gracefully to key or zh-CN if translation missing', () => {
    // @ts-expect-error test non-existent key
    expect(translate('non.existent.key')).toBe('non.existent.key')
  })

  it('initializes from localStorage if available', () => {
    storage['paris_tour_locale_mode'] = 'en'
    expect(initLocale()).toBe('en')
    expect(getLocale()).toBe('en')
  })
})
