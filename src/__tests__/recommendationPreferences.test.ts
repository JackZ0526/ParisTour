import { describe, it, expect } from 'vitest'
import {
  DEFAULT_RECOMMENDATION_PREFERENCES,
  DEFAULT_PREFERENCE_TAGS,
  PRESET_PREFERENCE_TAGS,
  normalizeRecommendationPreferences,
  recommendationPreferencesPrompt,
} from '../features/place/services/recommendationPreferences'
import { extractPreferenceTags } from '../shared/services/llm/llm'

describe('recommendationPreferences', () => {
  it('has valid default tags and presets', () => {
    expect(DEFAULT_PREFERENCE_TAGS.length).toBeGreaterThan(0)
    expect(PRESET_PREFERENCE_TAGS.length).toBeGreaterThan(5)
    expect(DEFAULT_RECOMMENDATION_PREFERENCES.tags).toEqual(DEFAULT_PREFERENCE_TAGS)
  })

  it('normalizes legacy preferences by converting boolean flags into code tags', () => {
    const legacy = {
      dayStartTime: '09:30',
      preferCafeStart: true,
      preferLunchAndDinner: true,
      includeDisneyDay: true,
      includeChampsAndArc: false,
      avoidLouvreAndVersailles: true,
      preferLowWalking: false,
      extraNotes: '热爱摄影',
    }

    const normalized = normalizeRecommendationPreferences(legacy)
    expect(normalized.dayStartTime).toBe('09:30')
    expect(normalized.tags).toContain('morningCoffee')
    expect(normalized.tags).toContain('twoMeals')
    expect(normalized.tags).toContain('disney')
    expect(normalized.tags).toContain('avoidLargeMuseums')
    // champsArc was explicitly false in legacy, so it must NOT be present
    expect(normalized.tags).not.toContain('champsArc')
    expect(normalized.extraNotes).toBe('热爱摄影')
  })

  it('accepts legacy Chinese tag values in input (backward compat)', () => {
    // Pre-refactor localStorage may store tags as Chinese strings. They should
    // be preserved verbatim (just cleaned) so the UI can localize them via
    // `localizePrefTag` + `LEGACY_PREF_TAG_MAP`.
    const legacy = {
      dayStartTime: '10:00',
      tags: ['晨间咖啡', '两顿正餐', '巴黎迪士尼'],
    }
    const normalized = normalizeRecommendationPreferences(legacy)
    expect(normalized.tags).toEqual(['晨间咖啡', '两顿正餐', '巴黎迪士尼'])
  })

  it('generates rich prompt lines including all active tags', () => {
    const prefs = {
      dayStartTime: '10:30',
      tags: ['photography', 'seineCruise'],
      extraNotes: '晚上想吃海鲜',
    }

    const prompt = recommendationPreferencesPrompt(prefs)
    expect(prompt[0]).toContain('10:30')
    expect(prompt.some((line) => line.includes('photography'))).toBe(true)
    expect(prompt.some((line) => line.includes('seineCruise'))).toBe(true)
    expect(prompt.some((line) => line.includes('晚上想吃海鲜'))).toBe(true)
  })

  it('generates English prompt lines when locale is en', () => {
    const prefs = {
      dayStartTime: '10:30',
      tags: ['photography', 'seineCruise'],
      extraNotes: 'Want seafood at night',
    }

    const prompt = recommendationPreferencesPrompt(prefs, { locale: 'en' })
    expect(prompt[0]).toContain('10:30')
    expect(prompt.some((line) => line.includes('10:30') && /start around/.test(line))).toBe(true)
    // codes should be localized to the chip text in en mode
    expect(prompt.some((line) => line.includes('Photo spots'))).toBe(true)
    expect(prompt.some((line) => line.includes('Seine cruise'))).toBe(true)
    expect(prompt.some((line) => line.includes('Want seafood at night'))).toBe(true)
    // no Chinese should leak into the en prompt
    expect(prompt.every((line) => !/[\u4e00-\u9fa5]/.test(line))).toBe(true)
  })

  it('English prompt localizes legacy Chinese tag values from old localStorage', () => {
    const prefs = {
      dayStartTime: '09:00',
      tags: ['晨间咖啡', '巴黎迪士尼'],
    }
    const prompt = recommendationPreferencesPrompt(prefs, { locale: 'en' })
    expect(prompt.some((line) => line.includes('Morning coffee'))).toBe(true)
    expect(prompt.some((line) => line.includes('Disney Paris'))).toBe(true)
  })

  it('falls back safely when extracting tags offline without API key', async () => {
    const input = '喜欢小众咖啡馆，想吃海鲜，少走路'
    const tags = await extractPreferenceTags(input)
    expect(tags.length).toBeGreaterThan(0)
    expect(tags.some((t) => t.includes('咖啡') || t.includes('海鲜') || t.includes('走'))).toBe(true)
  })

  it('falls back to English tags in en mode without API key', async () => {
    const input = 'I love indie coffee shops for photos, oysters at night, minimal walking'
    const tags = await extractPreferenceTags(input, { locale: 'en' })
    expect(tags.length).toBeGreaterThan(0)
    // English fallback should produce English text (not Chinese)
    expect(tags.every((t) => /^[A-Za-z0-9 +&'-]+$/.test(t))).toBe(true)
    expect(tags.some((t) => t.length > 0)).toBe(true)
  })

  it('respects explicit locale override for tag extraction', async () => {
    const input = 'I love vintage markets and French pastries'
    const tags = await extractPreferenceTags(input, { locale: 'en' })
    expect(tags.every((t) => !/[\u4e00-\u9fa5]/.test(t))).toBe(true)
  })
})
