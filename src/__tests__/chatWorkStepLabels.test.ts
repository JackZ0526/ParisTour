/**
 * Tests that the chat work-step pipeline labels and helpers are locale-aware.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { setLocale, getLocale } from '../shared/i18n/i18nStore'
import {
  chatWorkStepLabel,
  getChatWorkStepLabels,
  initialChatWorkSteps,
  requestPlanStepBadges,
  requestPlanStepLabel,
  parseStepDisplay,
  searchStepLabel,
  completedWorkSummary,
} from '../features/chat/components/ChatWorkStepList'
import type { TripChatRequestPlan, TripChatWorkStep } from '../features/chat/services/tripChat'

describe('chat work-step labels are locale-aware', () => {
  beforeEach(() => setLocale('en'))

  it('chatWorkStepLabel returns English label in en mode', () => {
    setLocale('en')
    expect(chatWorkStepLabel('generate')).toBe('Generating answer')
    expect(chatWorkStepLabel('parse')).toBe('Parsing actions')
    expect(chatWorkStepLabel('apply')).toBe('Applying changes')
  })

  it('chatWorkStepLabel returns Chinese label in zh-CN mode', () => {
    setLocale('zh-CN')
    expect(chatWorkStepLabel('generate')).toBe('生成回答')
    expect(chatWorkStepLabel('parse')).toBe('解析动作')
    expect(chatWorkStepLabel('apply')).toBe('应用改动')
  })

  it('getChatWorkStepLabels returns the full label map in the active locale', () => {
    setLocale('en')
    const en = getChatWorkStepLabels()
    expect(en.generate).toBe('Generating answer')
    expect(en.parse).toBe('Parsing actions')

    setLocale('zh-CN')
    const zh = getChatWorkStepLabels()
    expect(zh.generate).toBe('生成回答')
    expect(zh.parse).toBe('解析动作')
  })

  it('initialChatWorkSteps uses the active locale labels', () => {
    setLocale('en')
    const enSteps = initialChatWorkSteps('hi')
    expect(enSteps[0]?.label).toBe('Understanding the question')

    setLocale('zh-CN')
    const zhSteps = initialChatWorkSteps('hi')
    expect(zhSteps[0]?.label).toBe('理解问题')
  })

  it('requestPlanStepLabel and requestPlanStepBadges return English parts in en mode', () => {
    setLocale('en')
    const plan: TripChatRequestPlan = {
      intent: 'answer',
      needsWeb: false,
      recommendedEffort: 'low',
      thinking: { enabled: true, effort: 'low' },
      source: 'model',
    }
    const label = requestPlanStepLabel(plan, 'en')
    const badges = requestPlanStepBadges(plan, 'en')
    expect(label).toBe('Analyzing question')
    expect(badges).toEqual(['Info Query', 'No Web', 'Reasoning: Low'])
  })

  it('requestPlanStepLabel and requestPlanStepBadges return Chinese parts in zh-CN mode', () => {
    setLocale('zh-CN')
    const plan: TripChatRequestPlan = {
      intent: 'recommend',
      needsWeb: true,
      recommendedEffort: 'high',
      thinking: { enabled: true, effort: 'high' },
      source: 'model',
    }
    const label = requestPlanStepLabel(plan, 'zh-CN')
    const badges = requestPlanStepBadges(plan, 'zh-CN')
    expect(label).toBe('分析问题')
    expect(badges).toEqual(['推荐', '联网搜索', '推理: 高'])
  })

  it('parseStepDisplay handles badges and legacy string formatting', () => {
    // Native badges
    const native = parseStepDisplay({
      id: 'preprocessPlan',
      label: '分析问题',
      badges: ['推荐', '联网搜索'],
      status: 'done',
    })
    expect(native.label).toBe('分析问题')
    expect(native.badges).toEqual(['推荐', '联网搜索'])

    // Legacy concatenated string format
    const legacy = parseStepDisplay({
      id: 'preprocessPlan',
      label: '分析问题：信息查询 · 无需联网 · 推理强度：中',
      status: 'done',
    })
    expect(legacy.label).toBe('分析问题')
    expect(legacy.badges).toEqual(['信息查询', '无需联网', '推理强度：中'])
  })

  it('searchStepLabel uses locale-aware prefix', () => {
    setLocale('en')
    expect(searchStepLabel(undefined, 'Eiffel Tower tickets', 'en')).toBe(
      'Search: Eiffel Tower tickets',
    )
    setLocale('zh-CN')
    expect(searchStepLabel(undefined, '巴黎铁塔门票', 'zh-CN')).toBe(
      '搜索：巴黎铁塔门票',
    )
  })

  it('completedWorkSummary uses locale-aware text', () => {
    setLocale('en')
    const enSteps: TripChatWorkStep[] = [
      { id: 'webSearch', status: 'done' },
      { id: 'generate', status: 'done' },
    ] as TripChatWorkStep[]
    expect(completedWorkSummary(enSteps, 'en')).toBe(
      'Searched the web and generated answer',
    )

    setLocale('zh-CN')
    expect(completedWorkSummary(enSteps, 'zh-CN')).toBe('已完成联网搜索并生成回答')
  })

  it('locale defaults to the active i18n locale when none is passed', () => {
    setLocale('zh-CN')
    expect(getLocale()).toBe('zh-CN')
    expect(chatWorkStepLabel('generate')).toBe('生成回答')

    setLocale('en')
    expect(getLocale()).toBe('en')
    expect(chatWorkStepLabel('generate')).toBe('Generating answer')
  })
})
