import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  getSaveTargetLabel,
  saveLabel,
  syncLabel,
} from '../features/cloud-sync/components/CloudSaveIndicator'
import {
  detectSaveTarget,
} from '../features/cloud-sync/services/tripCloud'
import type { TripSnapshot } from '../features/cloud-sync/services/tripSnapshot'
import { translate, setLocale, _resetI18nStoreForTests } from '../shared/i18n/i18nStore'
import { resetLlmArtifactStoreForTests, setLlmArtifact } from '../shared/services/llm/llmArtifactStore'
import type { DayPlan } from '../types'

const t = (key: any, params?: Record<string, any>) => translate(key, params)

const makeDay = (n: number, title: string): DayPlan => ({
  day: n,
  title,
  theme: '',
  pace: 'moderate',
  summary: '',
  metroHintFromArea: {},
  stops: [],
})

describe('cloudSaveTarget and granular labels', () => {
  beforeEach(() => {
    _resetI18nStoreForTests()
    resetLlmArtifactStoreForTests()
    setLocale('zh-CN')
  })

  afterEach(() => {
    _resetI18nStoreForTests()
    resetLlmArtifactStoreForTests()
  })

  describe('getSaveTargetLabel formatting (zh-CN & en)', () => {
    it('formats single and multiple day targets in zh-CN', () => {
      setLocale('zh-CN')
      expect(getSaveTargetLabel('itinerary_days', [1], t)).toBe('第 1 天行程')
      expect(getSaveTargetLabel('itinerary_days', [1, 2], t)).toBe('第 1, 2 天行程')
      expect(getSaveTargetLabel('itinerary_days', undefined, t)).toBe('行程安排与每日路线')
    })

    it('formats single and multiple day targets in en', () => {
      setLocale('en')
      expect(getSaveTargetLabel('itinerary_days', [2], t)).toBe('Day 2 itinerary')
      expect(getSaveTargetLabel('itinerary_days', [1, 3], t)).toBe('Days 1, 3 itinerary')
      expect(getSaveTargetLabel('itinerary_days', undefined, t)).toBe('Itinerary & daily routes')
    })

    it('formats specialized artifact and core targets', () => {
      setLocale('zh-CN')
      expect(getSaveTargetLabel('place_details', undefined, t)).toBe('地点详情与 AI 数据')
      expect(getSaveTargetLabel('translations', undefined, t)).toBe('地点多语言翻译')
      expect(getSaveTargetLabel('hotel', undefined, t)).toBe('酒店住宿与候选方案')
      expect(getSaveTargetLabel('flights_dates', undefined, t)).toBe('往返航班与行程日期')
      expect(getSaveTargetLabel('preferences', undefined, t)).toBe('个性化行程偏好')
      expect(getSaveTargetLabel('custom_places', undefined, t)).toBe('自定义地点')
      expect(getSaveTargetLabel('composite', undefined, t)).toBe('行程安排与地点数据')
      expect(getSaveTargetLabel('general', undefined, t)).toBe('行程更改')

      setLocale('en')
      expect(getSaveTargetLabel('place_details', undefined, t)).toBe('Place details & AI data')
      expect(getSaveTargetLabel('translations', undefined, t)).toBe('Place translations')
      expect(getSaveTargetLabel('hotel', undefined, t)).toBe('Hotel & candidate stays')
      expect(getSaveTargetLabel('flights_dates', undefined, t)).toBe('Flights & trip dates')
      expect(getSaveTargetLabel('preferences', undefined, t)).toBe('Trip preferences')
      expect(getSaveTargetLabel('custom_places', undefined, t)).toBe('Custom places')
      expect(getSaveTargetLabel('composite', undefined, t)).toBe('Itinerary & place data')
      expect(getSaveTargetLabel('general', undefined, t)).toBe('Trip changes')
    })
  })

  describe('saveLabel formatting', () => {
    it('produces descriptive saving and saved labels in zh-CN', () => {
      setLocale('zh-CN')
      // Place details (e.g. background scroll cache)
      expect(saveLabel('saving', null, 'place_details', undefined, t)).toBe('正在保存地点详情与 AI 数据…')
      expect(saveLabel('saved', null, 'place_details', undefined, t)).toBe('地点详情与 AI 数据已保存')

      // Specific day itinerary edit
      expect(saveLabel('saving', null, 'itinerary_days', [2], t)).toBe('正在保存第 2 天行程…')
      expect(saveLabel('saved', null, 'itinerary_days', [2], t)).toBe('第 2 天行程已保存')

      // General fallback
      expect(saveLabel('saving', null, 'general', undefined, t)).toBe('正在保存…')
      expect(saveLabel('saved', null, 'general', undefined, t)).toBe('行程已保存')

      // Error description
      expect(saveLabel('error', '网络异常', 'general', undefined, t)).toBe('保存失败：网络异常')
    })

    it('produces descriptive saving and saved labels in en', () => {
      setLocale('en')
      expect(saveLabel('saving', null, 'place_details', undefined, t)).toBe('Saving Place details & AI data…')
      expect(saveLabel('saved', null, 'place_details', undefined, t)).toBe('Place details & AI data saved')

      expect(saveLabel('saving', null, 'itinerary_days', [3], t)).toBe('Saving Day 3 itinerary…')
      expect(saveLabel('saved', null, 'itinerary_days', [3], t)).toBe('Day 3 itinerary saved')
    })
  })

  describe('syncLabel formatting', () => {
    it('produces descriptive syncing and synced labels', () => {
      setLocale('zh-CN')
      expect(syncLabel('syncing', 'itinerary_days', [1], t)).toBe('正在同步第 1 天行程…')
      expect(syncLabel('synced', 'itinerary_days', [1], t)).toBe('第 1 天行程已同步')

      setLocale('en')
      expect(syncLabel('syncing', 'hotel', undefined, t)).toBe('Syncing Hotel & candidate stays…')
      expect(syncLabel('synced', 'hotel', undefined, t)).toBe('Hotel & candidate stays synced')
    })
  })

  describe('detectSaveTarget logic', () => {
    const dummySnapshot: TripSnapshot = {
      version: 1,
      destination: 'Paris',
      dates: { startDate: '2026-06-01', endDate: '2026-06-05' },
      flights: null,
      hotel: null,
      baseline: null,
      itinerary: {
        generated: true,
        days: [makeDay(1, 'Louvre'), makeDay(2, 'Orsay')],
        customPlaces: {},
      },
    }

    it('detects translation artifacts target', () => {
      setLlmArtifact('translations:fr:place1', { name: 'Louvre' })
      const detected = detectSaveTarget(['artifacts'], dummySnapshot, 'trip-1')
      expect(detected.target).toBe('translations')
    })

    it('detects place details artifact target', () => {
      setLlmArtifact('place-detail:place123', { rating: 4.8 })
      const detected = detectSaveTarget(['artifacts'], dummySnapshot, 'trip-1')
      expect(detected.target).toBe('place_details')
    })

    it('detects hotel target when only hotel changed', () => {
      const detected = detectSaveTarget(['hotel'], dummySnapshot, 'trip-1')
      expect(detected.target).toBe('hotel')
    })

    it('detects composite target when both days and artifacts changed', () => {
      const detected = detectSaveTarget(['days', 'artifacts'], dummySnapshot, 'trip-1')
      expect(detected.target).toBe('composite')
    })
  })
})
