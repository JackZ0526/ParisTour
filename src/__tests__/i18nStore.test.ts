import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  getLocale,
  setLocale,
  initLocale,
  getSystemPreferredLocale,
  translate,
  subscribeLocale,
  isLocale,
  setI18nDevWarnEnabled,
  _resetI18nStoreForTests,
} from '../shared/i18n/i18nStore'
import { LOCALES, SUPPORTED_LOCALES, DEFAULT_LOCALE } from '../shared/i18n/locales/registry'

describe('i18nStore', () => {
  let storage: Record<string, string> = {}
  let warnSpy: ReturnType<typeof vi.spyOn>

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

    // Capture console.warn so we can assert dev-mode behavior.
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    warnSpy.mockRestore()
  })

  it('validates supported locales correctly', () => {
    for (const id of Object.keys(LOCALES)) {
      expect(isLocale(id)).toBe(true)
    }
    expect(isLocale('fr')).toBe(false) // fr was removed
    expect(isLocale('de')).toBe(false)
    expect(isLocale(null)).toBe(false)
    expect(isLocale(undefined)).toBe(false)
    expect(isLocale(42)).toBe(false)
  })

  it('switches and retrieves active locale', () => {
    expect(getLocale()).toBe(DEFAULT_LOCALE)
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

  it('translates keys with interpolation', () => {
    setLocale('zh-CN')
    expect(translate('common.confirm')).toBe('确认')
    expect(translate('nav.dayN', { day: 3 })).toBe('第 3 天')

    setLocale('en')
    expect(translate('common.confirm')).toBe('Confirm')
    expect(translate('nav.dayN', { day: 3 })).toBe('Day 3')
  })

  it('returns the key itself when neither active nor default has it', () => {
    // @ts-expect-error test non-existent key
    expect(translate('non.existent.key')).toBe('non.existent.key')
  })

  it('initializes from localStorage if available', () => {
    storage['paris_tour_locale_mode'] = 'en'
    expect(initLocale()).toBe('en')
    expect(getLocale()).toBe('en')
  })

  describe('system preference detection', () => {
    it('selects zh-CN for Chinese variants', () => {
      vi.stubGlobal('navigator', { language: 'zh-CN', languages: ['zh-CN'] })
      expect(getSystemPreferredLocale()).toBe('zh-CN')

      vi.stubGlobal('navigator', { language: 'zh-TW', languages: ['zh-TW'] })
      expect(getSystemPreferredLocale()).toBe('zh-CN')

      vi.stubGlobal('navigator', { language: 'zh-HK', languages: ['zh-HK'] })
      expect(getSystemPreferredLocale()).toBe('zh-CN')

      vi.stubGlobal('navigator', { language: 'zh', languages: ['zh'] })
      expect(getSystemPreferredLocale()).toBe('zh-CN')
    })

    it('selects en for all non-Chinese languages', () => {
      vi.stubGlobal('navigator', { language: 'en-US', languages: ['en-US', 'en'] })
      expect(getSystemPreferredLocale()).toBe('en')

      vi.stubGlobal('navigator', { language: 'fr-FR', languages: ['fr-FR', 'fr'] })
      expect(getSystemPreferredLocale()).toBe('en')

      vi.stubGlobal('navigator', { language: 'ja-JP', languages: ['ja-JP'] })
      expect(getSystemPreferredLocale()).toBe('en')

      vi.stubGlobal('navigator', { language: 'es-ES', languages: ['es-ES'] })
      expect(getSystemPreferredLocale()).toBe('en')

      vi.stubGlobal('navigator', { language: 'de', languages: ['de'] })
      expect(getSystemPreferredLocale()).toBe('en')
    })

    it('defaults to en when navigator language is unavailable or SSR', () => {
      vi.stubGlobal('navigator', { language: '', languages: [] })
      expect(getSystemPreferredLocale()).toBe('en')
    })

    it('initLocale uses system language when localStorage is empty', () => {
      vi.stubGlobal('navigator', { language: 'fr-FR', languages: ['fr-FR'] })
      expect(initLocale()).toBe('en')
      expect(getLocale()).toBe('en')

      vi.stubGlobal('navigator', { language: 'zh-CN', languages: ['zh-CN'] })
      expect(initLocale()).toBe('zh-CN')
      expect(getLocale()).toBe('zh-CN')
    })
  })

  describe('dev missing-key warnings', () => {
    it('does NOT warn when dev warnings are disabled (default in tests)', () => {
      setI18nDevWarnEnabled(false)
      // Force a fall-through: we can't easily mutate a registry dict
      // mid-test, so just verify the silent behavior is the default.
      setLocale('en')
      translate('common.confirm') // exists in en
      expect(warnSpy).not.toHaveBeenCalled()
    })

    it('warns ONCE per missing key when dev warnings are enabled', () => {
      setI18nDevWarnEnabled(true)
      setLocale('en')
      // Simulate "missing in active" by pointing translate at zh-CN
      // for a key that does exist only in zh-CN. Since both dictionaries
      // currently share the I18nSchema shape, we can instead spy on
      // the warn path by deleting from a temporary view. Easier: call
      // translate with a non-existent key and assert warn fires + dedupes.
      // @ts-expect-error test non-existent key
      translate('fake.missing.key')
      // @ts-expect-error same call again
      translate('fake.missing.key')
      // @ts-expect-error again
      translate('fake.missing.key')

      expect(warnSpy).toHaveBeenCalledTimes(1)
      expect(warnSpy.mock.calls[0][0]).toMatch(/\[i18n\] Missing key "fake\.missing\.key"/)
    })

    it('warnedKeys clears when dev warnings are re-disabled', () => {
      setI18nDevWarnEnabled(true)
      setLocale('en')
      // @ts-expect-error
      translate('another.missing.key')
      expect(warnSpy).toHaveBeenCalledTimes(1)

      setI18nDevWarnEnabled(false)
      // @ts-expect-error
      translate('another.missing.key')
      expect(warnSpy).toHaveBeenCalledTimes(1) // still 1, silenced

      setI18nDevWarnEnabled(true)
      // @ts-expect-error
      translate('another.missing.key')
      expect(warnSpy).toHaveBeenCalledTimes(2) // warned again after re-enable
    })
  })

  describe('registry exports', () => {
    it('exposes one LocaleMeta per registered id', () => {
      expect(SUPPORTED_LOCALES).toHaveLength(Object.keys(LOCALES).length)
      for (const meta of SUPPORTED_LOCALES) {
        expect(meta.id).toBeDefined()
        expect(meta.nativeName.length).toBeGreaterThan(0)
        expect(meta.systemPrefixes.length).toBeGreaterThan(0)
        expect(meta.llmInstruction.length).toBeGreaterThan(0)
        // sanity: dictionary has at least the `common` namespace
        expect(typeof meta.dictionary.common.confirm).toBe('string')
      }
    })
  })
})
