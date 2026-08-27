import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  generateDayCopy,
  recommendPlacesForDay,
} from '../shared/services/llm/business/place'
import {
  getDayRecommendCache,
  setDayRecommendCache,
  clearAllRecommendCache,
} from '../features/place/services/recommendCache'
import * as llmService from '../shared/services/llm/business/_service'
import { setLocale } from '../shared/i18n'

describe('dayCopy and place recommendations locale support', () => {
  beforeEach(() => {
    clearAllRecommendCache()
    setLocale('zh-CN')
    vi.restoreAllMocks()
  })

  it('returns localized fallback when no places are added', async () => {
    const zh = await generateDayCopy({
      day: 1,
      pace: 'moderate',
      placeNames: [],
      locale: 'zh-CN',
    })
    expect(zh?.title).toBe('第 1 天')
    expect(zh?.theme).toBe('自由安排')
    expect(zh?.summary).toContain('今天还没有安排地点')

    const en = await generateDayCopy({
      day: 2,
      pace: 'relaxed',
      placeNames: [],
      locale: 'en',
    })
    expect(en?.title).toBe('Day 2')
    expect(en?.theme).toBe('Free time')
    expect(en?.summary).toContain('No places added yet')
  })

  it('generates English copy and caches under locale-scoped key for en', async () => {
    vi.spyOn(llmService, 'isLlmConfigured').mockReturnValue(true)
    const generateTextSpy = vi
      .spyOn(llmService, 'generateText')
      .mockResolvedValue(
        JSON.stringify({
          title: 'Right Bank Classics',
          theme: 'Louvre & Tuileries',
          summary: 'Morning art walk at the Louvre, afternoon stroll through Tuileries gardens.',
        }),
      )

    const copyEn = await generateDayCopy({
      day: 1,
      pace: 'moderate',
      placeNames: ['Musée du Louvre', 'Jardin des Tuileries'],
      hotelArea: 'trocadero',
      hotelAreaLabel: 'Trocadéro',
      locale: 'en',
    })

    expect(copyEn).toEqual({
      title: 'Right Bank Classics',
      theme: 'Louvre & Tuileries',
      summary: 'Morning art walk at the Louvre, afternoon stroll through Tuileries gardens.',
    })

    expect(generateTextSpy).toHaveBeenCalled()
    const [systemPrompt] = generateTextSpy.mock.calls[0]
    expect(systemPrompt).toContain('Paris trip editor')
    expect(systemPrompt).toContain('natural, elegant English')
    expect(systemPrompt).toContain('Trocadéro')
  })

  it('passes language instruction to recommendPlacesForDay in English mode', async () => {
    vi.spyOn(llmService, 'isLlmConfigured').mockReturnValue(true)
    const generateTextSpy = vi
      .spyOn(llmService, 'generateText')
      .mockResolvedValue(
        JSON.stringify({
          recommendations: [
            {
              name: 'Café Kitsuné',
              googlePlaceId: 'place-123',
              type: 'cafe',
              reason: 'Great specialty coffee near today route.',
              intro: 'Charming coffee shop situated inside the Palais Royal gardens.',
            },
          ],
        }),
      )

    const recs = await recommendPlacesForDay({
      day: 1,
      title: 'Right Bank Classics',
      pace: 'moderate',
      theme: 'Louvre & Tuileries',
      hotelArea: 'Trocadéro',
      currentPlaceNames: ['Musée du Louvre'],
      types: ['cafe'],
      countPerType: 1,
      verifiedCandidates: [
        {
          id: 'place-123',
          name: 'Café Kitsuné',
          type: 'cafe',
        },
      ],
      recommendationPreferences: {
        dayStartTime: '09:30',
        tags: ['morningCoffee'],
        avoidLouvreAndVersailles: true,
      },
      locale: 'en',
    })

    expect(recs).toHaveLength(1)
    expect(recs[0].name).toBe('Café Kitsuné')
    expect(recs[0].reason).toContain('Great specialty coffee')

    const [systemPrompt] = generateTextSpy.mock.calls[0]
    expect(systemPrompt).toContain('Paris travel advisor')
    expect(systemPrompt).toContain('natural, elegant English')
    expect(systemPrompt).toContain('2–3 sentence introduction in English')
    expect(systemPrompt).not.toContain('reply first')
    expect(systemPrompt).not.toContain('then actions')
  })

  it('isolates recommend cache by locale', () => {
    setDayRecommendCache({
      day: 1,
      batch: 1,
      model: 'test-model',
      recommendations: [
        {
          name: 'Du Pain et des Idées',
          type: 'cafe',
          reason: '中文推荐理由',
          intro: '中文简介',
        },
      ],
      fetchedAt: Date.now(),
      locale: 'zh-CN',
    })

    setDayRecommendCache({
      day: 1,
      batch: 1,
      model: 'test-model',
      recommendations: [
        {
          name: 'Du Pain et des Idées',
          type: 'cafe',
          reason: 'English recommendation reason',
          intro: 'English intro',
        },
      ],
      fetchedAt: Date.now(),
      locale: 'en',
    })

    const zhCache = getDayRecommendCache(1, 'zh-CN')
    expect(zhCache?.recommendations[0].reason).toBe('中文推荐理由')

    const enCache = getDayRecommendCache(1, 'en')
    expect(enCache?.recommendations[0].reason).toBe('English recommendation reason')
  })
})
