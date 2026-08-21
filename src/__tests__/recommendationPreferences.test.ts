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

  it('normalizes legacy preferences by converting boolean flags into tags', () => {
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
    expect(normalized.tags).toContain('☕ 咖啡馆与早餐开场')
    expect(normalized.tags).toContain('🍽️ 每日两顿正餐')
    expect(normalized.tags).toContain('🏰 安排巴黎迪士尼全日')
    expect(normalized.tags).toContain('🌿 避开大型博物馆(卢浮宫/凡尔赛)')
    expect(normalized.extraNotes).toBe('热爱摄影')
  })

  it('generates rich prompt lines including all active tags', () => {
    const prefs = {
      dayStartTime: '10:30',
      tags: ['📸 绝佳摄影与出片机位', '🍷 塞纳河落日游船巡航'],
      extraNotes: '晚上想吃海鲜',
    }

    const prompt = recommendationPreferencesPrompt(prefs)
    expect(prompt[0]).toContain('10:30')
    expect(prompt.some((line) => line.includes('📸 绝佳摄影与出片机位'))).toBe(true)
    expect(prompt.some((line) => line.includes('🍷 塞纳河落日游船巡航'))).toBe(true)
    expect(prompt.some((line) => line.includes('晚上想吃海鲜'))).toBe(true)
  })

  it('falls back safely when extracting tags offline without API key', async () => {
    const input = '喜欢小众咖啡馆，想吃海鲜，少走路'
    const tags = await extractPreferenceTags(input)
    expect(tags.length).toBeGreaterThan(0)
    expect(tags.some((t) => t.includes('咖啡') || t.includes('海鲜') || t.includes('走'))).toBe(true)
  })
})
