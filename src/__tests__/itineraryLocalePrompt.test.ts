/**
 * Tests that itinerary-generation LLM prompts are locale-aware. We don't
 * hit the network here — we just inspect the prompt strings via the
 * public `buildFullItineraryPrompt` / `buildSingleDayRoleRules` helpers
 * (re-exported below for testing) and assert that the active locale
 * switches the language of role + hard_rules + roleRules.
 */
import { describe, it, expect } from 'vitest'
import { setLocale } from '../shared/i18n/i18nStore'
import {
  buildFullItineraryPrompt,
  buildSingleDayRoleRules,
} from '../shared/services/llm/business/itinerary'
import { recommendationPreferencesPrompt } from '../features/place/services/recommendationPreferences'
import {
  getCommonRules,
  getPlaceResearchDiscipline,
  getCafeVsRestaurantRule,
  getRouterExamples,
} from '../shared/services/llm/prompts'
import type { RecommendationPreferences } from '../features/place/services/recommendationPreferences'

const defaultPrefs: RecommendationPreferences = {
  dayStartTime: '10:00',
  tags: ['morningCoffee', 'twoMeals'],
  preferCafeStart: true,
  preferLunchAndDinner: true,
  includeDisneyDay: false,
  includeChampsAndArc: true,
  avoidLouvreAndVersailles: false,
  preferLowWalking: true,
  extraNotes: '',
}

describe('itinerary LLM prompts are locale-aware', () => {
  describe('buildFullItineraryPrompt', () => {
    it('returns Chinese role + hard_rules in zh-CN mode', () => {
      setLocale('zh-CN')
      const out = buildFullItineraryPrompt(3, defaultPrefs, 2, '巴黎', '春季', 'zh-CN')
      expect(out.role).toContain('旅行规划师')
      expect(out.hardRules).toContain('必须输出恰好')
      expect(out.outputFormat).toContain('简体中文')
      // No English-only sentence should leak
      expect(out.hardRules).not.toContain('Output exactly')
    })

    it('returns English role + hard_rules in en mode', () => {
      setLocale('en')
      const out = buildFullItineraryPrompt(3, defaultPrefs, 2, 'Paris', 'spring', 'en')
      expect(out.role).toContain('travel planner')
      expect(out.hardRules).toContain('Output exactly 3 days')
      expect(out.hardRules).toContain('"hotel-selected"')
      expect(out.hardRules).toContain('"attr-cdg"')
      expect(out.outputFormat).toMatch(/JSON only/i)
      // No Chinese sentence should leak
      expect(out.hardRules).not.toContain('必须输出')
    })

    it('inlines includeDisneyDay branch correctly in en mode', () => {
      setLocale('en')
      const out = buildFullItineraryPrompt(5, defaultPrefs, 4, 'Paris', 'spring', 'en')
      expect(out.hardRules).toContain('Day 4')
      expect(out.hardRules).toContain('Disney Paris day')
    })
  })

  describe('buildSingleDayRoleRules', () => {
    it('returns English role rules for a mid-trip day in en mode', () => {
      const lines = buildSingleDayRoleRules(
        2, null, defaultPrefs, false, false, false, 'en',
      )
      const joined = lines.join('\n')
      expect(joined).toContain('Mid-trip day')
      expect(joined).toContain('hotel-selected')
      expect(joined).not.toContain('中间日')
    })

    it('returns Chinese role rules for a mid-trip day in zh-CN mode', () => {
      const lines = buildSingleDayRoleRules(
        2, null, defaultPrefs, false, false, false, 'zh-CN',
      )
      const joined = lines.join('\n')
      expect(joined).toContain('中间日')
      expect(joined).not.toContain('Mid-trip day')
    })

    it('handles arrival day in both locales', () => {
      const en = buildSingleDayRoleRules(1, null, defaultPrefs, true, false, false, 'en')
      expect(en.join('\n')).toContain('arrival')
      const zh = buildSingleDayRoleRules(1, null, defaultPrefs, true, false, false, 'zh-CN')
      expect(zh.join('\n')).toContain('抵达日')
    })

    it('handles return day in both locales', () => {
      const en = buildSingleDayRoleRules(3, null, defaultPrefs, false, true, false, 'en')
      expect(en.join('\n')).toContain('return')
      const zh = buildSingleDayRoleRules(3, null, defaultPrefs, false, true, false, 'zh-CN')
      expect(zh.join('\n')).toContain('返程日')
    })

    it('handles disney day in both locales', () => {
      const en = buildSingleDayRoleRules(2, 2, defaultPrefs, false, false, true, 'en')
      expect(en.join('\n')).toContain('full Disney Paris day')
      const zh = buildSingleDayRoleRules(2, 2, defaultPrefs, false, false, true, 'zh-CN')
      expect(zh.join('\n')).toContain('巴黎迪士尼全日')
    })
  })

  describe('shared prompts module', () => {
    it('getCommonRules switches language by locale', () => {
      expect(getCommonRules('zh-CN')).toContain('data_isolation')
      expect(getCommonRules('zh-CN')).toContain('<app_state_data>')
      expect(getCommonRules('en')).toContain('<data_isolation>')
      expect(getCommonRules('en')).toContain('snapshot')
    })

    it('getPlaceResearchDiscipline switches language by locale', () => {
      expect(getPlaceResearchDiscipline('zh-CN')).toContain('Google Maps 可搜到')
      expect(getPlaceResearchDiscipline('en')).toContain('Google-Maps-discoverable')
    })

    it('getCafeVsRestaurantRule switches language by locale', () => {
      expect(getCafeVsRestaurantRule('zh-CN')).toContain('咖啡馆')
      expect(getCafeVsRestaurantRule('en')).toContain('coffee shop')
    })

    it('getRouterExamples switches language by locale', () => {
      expect(getRouterExamples('zh-CN')).toContain('mutate')
      expect(getRouterExamples('zh-CN')).toContain('巴黎')
      expect(getRouterExamples('en')).toContain('mutate')
      expect(getRouterExamples('en')).toContain('Louvre')
    })
  })

  describe('recommendationPreferencesPrompt is locale-aware', () => {
    it('zh-CN mode keeps tag values verbatim and uses Chinese headers', () => {
      setLocale('zh-CN')
      const lines = recommendationPreferencesPrompt(
        { dayStartTime: '10:00', tags: ['morningCoffee', 'seineCruise'], extraNotes: '' },
        { locale: 'zh-CN' },
      )
      expect(lines[0]).toContain('通常约 10:00')
      expect(lines.some((l) => l.includes('【用户指定行程偏好标签池'))).toBe(true)
      expect(lines.some((l) => l.includes('morningCoffee'))).toBe(true)
      expect(lines.every((l) => !/start around/.test(l))).toBe(true)
    })

    it('en mode localizes codes and uses English headers', () => {
      setLocale('en')
      const lines = recommendationPreferencesPrompt(
        { dayStartTime: '10:00', tags: ['morningCoffee', 'seineCruise'], extraNotes: 'note' },
        { locale: 'en' },
      )
      expect(lines[0]).toContain('start around 10:00')
      expect(lines.some((l) => /\[User-specified itinerary preference tags/.test(l))).toBe(true)
      expect(lines.some((l) => l.includes('Morning coffee'))).toBe(true)
      expect(lines.some((l) => l.includes('Seine cruise'))).toBe(true)
      expect(lines.every((l) => !/[\u4e00-\u9fa5]/.test(l))).toBe(true)
    })
  })

  describe('auto-translate prompt mentions duration', () => {
    it('en target locale prompt includes duration in hard rules and example', async () => {
      const { buildTranslateSystemPrompt } = await import(
        '../shared/services/llm/business/itinerary'
      )
      const prompt = buildTranslateSystemPrompt('en', 'zh-CN', 'Respond in English.')
      // The example must show a `duration` field so the LLM knows to translate it.
      expect(prompt).toMatch(/"duration"\s*:\s*"[^"]+"/)
      // The hard rules must explicitly call out duration so the LLM doesn't drop it.
      expect(prompt).toMatch(/stop\.duration/i)
      expect(prompt).toMatch(/Translate.*duration|do NOT drop the duration/i)
    })

    it('zh-CN target locale prompt includes duration in hard rules and example', async () => {
      const { buildTranslateSystemPrompt } = await import(
        '../shared/services/llm/business/itinerary'
      )
      const prompt = buildTranslateSystemPrompt('zh-CN', 'en', '用简体中文回答。')
      // The example must show a `duration` field.
      expect(prompt).toMatch(/"duration"\s*:\s*"[^"]+"/)
      // The hard rules must mention duration explicitly.
      expect(prompt).toMatch(/stop\.duration|duration 字段/)
    })
  })
})
