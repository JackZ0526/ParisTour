import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  extractPlaceRecommendationRows,
  extractJsonObject,
} from '../shared/services/llm/json'
import { recommendPlacesForDay } from '../shared/services/llm/business/place'
import { jsonContract, getChatOutputRules } from '../shared/services/llm/prompts'
import * as llmService from '../shared/services/llm/business/_service'
import {
  getDayRecommendCache,
  setDayRecommendCache,
  clearAllRecommendCache,
} from '../features/place/services/recommendCache'
import { setLocale } from '../shared/i18n'

const candidate = {
  id: 'place-123',
  name: 'Café Kitsuné',
  type: 'cafe' as const,
}

function recommendInput() {
  return {
    day: 1,
    title: '右岸经典',
    pace: 'moderate',
    currentPlaceNames: [] as string[],
    types: ['cafe' as const],
    countPerType: 1,
    verifiedCandidates: [candidate],
    recommendationPreferences: {
      dayStartTime: '09:30',
      tags: ['morningCoffee'],
      avoidLouvreAndVersailles: true,
    },
    locale: 'zh-CN' as const,
  }
}

describe('extractPlaceRecommendationRows', () => {
  it('reads the canonical recommendations array', () => {
    expect(
      extractPlaceRecommendationRows({
        recommendations: [{ name: 'Café Kitsuné', type: 'cafe' }],
      }),
    ).toEqual([{ name: 'Café Kitsuné', type: 'cafe' }])
  })

  it('reads Chinese aliases and grouped type buckets', () => {
    expect(
      extractPlaceRecommendationRows({
        推荐: [{ 名称: 'Café Kitsuné', 类型: '咖啡馆' }],
      }),
    ).toHaveLength(1)

    expect(
      extractPlaceRecommendationRows({
        cafe: [{ name: 'Café Kitsuné' }],
        attraction: [],
      }),
    ).toEqual([{ name: 'Café Kitsuné', type: 'cafe' }])
  })

  it('reads a root array and numeric-keyed json_object fallback', () => {
    expect(
      extractPlaceRecommendationRows([{ name: 'Café Kitsuné', type: 'cafe' }]),
    ).toHaveLength(1)
    expect(
      extractPlaceRecommendationRows({
        '0': { name: 'Café Kitsuné', type: 'cafe' },
      }),
    ).toHaveLength(1)
  })

  it('ignores a chat-style reply/actions envelope with no places', () => {
    expect(
      extractPlaceRecommendationRows({
        reply: '这里有一些咖啡馆推荐。',
        actions: [],
      }),
    ).toEqual([])
  })
})

describe('extractJsonObject think-tag stripping', () => {
  it('parses JSON after a think block', () => {
    const text = `<think>should wrap { braces }</think>\n{"recommendations":[{"name":"Café Kitsuné"}]}`
    expect(extractJsonObject(text)?.recommendations).toEqual([
      { name: 'Café Kitsuné' },
    ])
  })
})

describe('jsonContract lead copy', () => {
  it('does not mention reply/actions for place-recommend schemas', () => {
    const contract = jsonContract(
      '{ recommendations: [{ name, type }] }',
      '{ "recommendations": [{ "name": "Café Kitsuné", "type": "cafe" }] }',
      'zh-CN',
    )
    expect(contract).toContain('符合 Schema')
    expect(contract).not.toContain('reply 优先')
  })

  it('keeps reply-first order for chat schemas', () => {
    expect(jsonContract('{"reply":"...","actions":[]}', undefined, 'zh-CN')).toContain(
      'reply 优先',
    )
    expect(getChatOutputRules('zh-CN')).toContain('先 reply')
  })
})

describe('recommendPlacesForDay parse recovery', () => {
  beforeEach(() => {
    clearAllRecommendCache()
    setLocale('zh-CN')
    vi.restoreAllMocks()
    vi.spyOn(llmService, 'isLlmConfigured').mockReturnValue(true)
  })

  it('accepts grouped cafe/attraction JSON instead of recommendations[]', async () => {
    vi.spyOn(llmService, 'generateText').mockResolvedValue(
      JSON.stringify({
        cafe: [
          {
            name: 'Café Kitsuné',
            googlePlaceId: 'place-123',
            reason: '就在今天路线上',
            intro: '皇宫花园里的精品咖啡。',
          },
        ],
      }),
    )

    const recs = await recommendPlacesForDay(recommendInput())
    expect(recs).toHaveLength(1)
    expect(recs[0].name).toBe('Café Kitsuné')
    expect(recs[0].type).toBe('cafe')
  })

  it('recovers a truncated recommendations stream via parsePartialJson', async () => {
    vi.spyOn(llmService, 'generateText').mockResolvedValue(
      '{"recommendations":[{"name":"Café Kitsuné","googlePlaceId":"place-123","type":"cafe","reason":"近路',
    )

    const recs = await recommendPlacesForDay(recommendInput())
    expect(recs).toHaveLength(1)
    expect(recs[0].name).toBe('Café Kitsuné')
  })

  it('throws the unparseable-list error for chat-shaped JSON with no places', async () => {
    vi.spyOn(llmService, 'generateText').mockResolvedValue(
      JSON.stringify({ reply: '推荐几家咖啡馆给你。', actions: [] }),
    )

    await expect(recommendPlacesForDay(recommendInput())).rejects.toThrow(
      '大模型返回了内容，但无法解析成地点列表',
    )
  })

  it('does not write a failed parse into recommendCache', async () => {
    setDayRecommendCache({
      day: 1,
      batch: 1,
      model: 'test-model',
      recommendations: [
        {
          name: 'Du Pain et des Idées',
          type: 'cafe',
          reason: '旧缓存',
          intro: '旧缓存',
        },
      ],
      fetchedAt: Date.now(),
      locale: 'zh-CN',
    })
    vi.spyOn(llmService, 'generateText').mockResolvedValue(
      JSON.stringify({ reply: '坏结果', actions: [] }),
    )

    await expect(recommendPlacesForDay(recommendInput())).rejects.toThrow()
    expect(getDayRecommendCache(1, 'zh-CN')?.recommendations[0].name).toBe(
      'Du Pain et des Idées',
    )
  })
})
