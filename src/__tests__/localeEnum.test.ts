import { describe, it, expect, afterEach } from 'vitest'
import {
  localizePrefTag,
  localizePace,
  localizeWalkLevel,
  localizeTransport,
  localizeTravelChip,
} from '../shared/i18n/localeEnum'
import { setLocale } from '../shared/i18n/i18nStore'

describe('localeEnum helpers', () => {
  describe('localizePrefTag', () => {
    it('translates a code to the English label in en mode', () => {
      setLocale('en')
      expect(localizePrefTag('morningCoffee')).toBe('Morning coffee')
      expect(localizePrefTag('twoMeals')).toBe('Lunch + dinner')
      expect(localizePrefTag('easyWalking')).toBe('Light walking')
      expect(localizePrefTag('photography')).toBe('Photo spots')
    })

    it('translates a code to the Chinese label in zh-CN mode', () => {
      setLocale('zh-CN')
      expect(localizePrefTag('morningCoffee')).toBe('晨间咖啡')
      expect(localizePrefTag('twoMeals')).toBe('两顿正餐')
      expect(localizePrefTag('easyWalking')).toBe('轻松少步行')
      expect(localizePrefTag('photography')).toBe('摄影出片')
    })

    it('maps legacy Chinese values to codes then to current locale', () => {
      setLocale('en')
      // Legacy Chinese values in old localStorage should still localize to English
      expect(localizePrefTag('晨间咖啡')).toBe('Morning coffee')
      expect(localizePrefTag('两顿正餐')).toBe('Lunch + dinner')
      expect(localizePrefTag('巴黎迪士尼')).toBe('Disney Paris')

      setLocale('zh-CN')
      expect(localizePrefTag('晨间咖啡')).toBe('晨间咖啡')
      expect(localizePrefTag('巴黎迪士尼')).toBe('巴黎迪士尼')
    })

    it('passes through unknown values so the UI never goes blank', () => {
      setLocale('en')
      expect(localizePrefTag('some-user-typed-tag')).toBe('some-user-typed-tag')
      expect(localizePrefTag('')).toBe('')
      expect(localizePrefTag(undefined)).toBe('')
    })

    it('respects an explicit locale override', () => {
      setLocale('zh-CN')
      expect(localizePrefTag('morningCoffee', 'en')).toBe('Morning coffee')
    })
  })

  describe('localizePace / WalkLevel / Transport', () => {
    it('localizes pace codes', () => {
      setLocale('en')
      expect(localizePace('relaxed')).toBeTruthy()
      expect(localizePace('moderate')).toBeTruthy()
    })

    it('localizes walkLevel codes', () => {
      setLocale('en')
      expect(localizeWalkLevel('minimal')).toBeTruthy()
    })

    it('localizes transport codes', () => {
      setLocale('en')
      expect(localizeTransport('transit')).toBeTruthy()
    })

    it('localizeTravelChip handles both transport and walkLevel', () => {
      setLocale('en')
      expect(localizeTravelChip('transit')).toBeTruthy()
      expect(localizeTravelChip('minimal')).toBeTruthy()
    })
  })

  afterEach(() => {
    setLocale('zh-CN')
  })
})
