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
  resolvePlacesStepBadges,
  applyStepBadges,
  searchStepBadges,
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

  it('searchStepBadges, resolvePlacesStepBadges, and applyStepBadges format properly', () => {
    // searchStepBadges
    expect(searchStepBadges({ source: 'web', query: 'Paris', sourcesCount: 5 }, 'en')).toEqual([
      'Ref 5 sources',
    ])
    expect(searchStepBadges({ source: 'web', query: 'Paris', sourcesCount: 3 }, 'zh-CN')).toEqual([
      '参考了 3 篇资料',
    ])

    // resolvePlacesStepBadges
    expect(resolvePlacesStepBadges(['Louvre', 'Eiffel Tower'], 2, 'en')).toEqual([
      'Louvre · Eiffel Tower',
      '2/2 verified',
    ])
    expect(resolvePlacesStepBadges(['卢浮宫', '埃菲尔铁塔'], 2, 'zh-CN')).toEqual([
      '卢浮宫 · 埃菲尔铁塔',
      '2/2 已核实',
    ])

    // applyStepBadges
    expect(applyStepBadges(['已将「卢浮宫」加入第 1 天', '已更新住宿'])).toEqual([
      '已将「卢浮宫」加入第 1 天',
      '已更新住宿',
    ])
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

  it('completedWorkSummary uses unified compact summary with reasoning and steps', () => {
    setLocale('en')
    const enSteps: TripChatWorkStep[] = [
      { id: 'webSearch', status: 'done', label: 'Web search' },
      { id: 'generate', status: 'done', label: 'Generate' },
    ] as TripChatWorkStep[]
    expect(completedWorkSummary(enSteps, true, 'en')).toBe(
      'Thought · Web searched · Answer ready · 2 steps',
    )

    setLocale('zh-CN')
    expect(completedWorkSummary(enSteps, true, 'zh-CN')).toBe(
      '思考完成 · 联网搜索 · 已生成回答 · 共 2 步',
    )
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
