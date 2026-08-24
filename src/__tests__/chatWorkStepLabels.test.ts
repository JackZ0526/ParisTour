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
  visualAnalysisStepBadges,
  parseStepDisplay,
  searchStepLabel,
  completedWorkSummary,
} from '../features/chat/components/ChatWorkStepList'
import type { TripChatRequestPlan, TripChatWorkStep } from '../features/chat/services/tripChat'

describe('chat work-step labels are locale-aware', () => {
  beforeEach(() => setLocale('en'))

  it('chatWorkStepLabel returns English label in en mode', () => {
    setLocale('en')
    expect(chatWorkStepLabel('visualAnalysis')).toBe('Analyzing image')
    expect(chatWorkStepLabel('generate')).toBe('Generating answer')
    expect(chatWorkStepLabel('parse')).toBe('Parsing actions')
    expect(chatWorkStepLabel('apply')).toBe('Applying changes')
  })

  it('chatWorkStepLabel returns Chinese label in zh-CN mode', () => {
    setLocale('zh-CN')
    expect(chatWorkStepLabel('visualAnalysis')).toBe('解析图片')
    expect(chatWorkStepLabel('generate')).toBe('生成回答')
    expect(chatWorkStepLabel('parse')).toBe('解析动作')
    expect(chatWorkStepLabel('apply')).toBe('应用改动')
  })

  it('getChatWorkStepLabels returns the full label map in the active locale', () => {
    setLocale('en')
    const en = getChatWorkStepLabels()
    expect(en.visualAnalysis).toBe('Analyzing image')
    expect(en.generate).toBe('Generating answer')
    expect(en.parse).toBe('Parsing actions')

    setLocale('zh-CN')
    const zh = getChatWorkStepLabels()
    expect(zh.visualAnalysis).toBe('解析图片')
    expect(zh.generate).toBe('生成回答')
    expect(zh.parse).toBe('解析动作')
  })

  it('initialChatWorkSteps uses the active locale labels and handles images', () => {
    setLocale('en')
    const enSteps = initialChatWorkSteps('hi', true)
    expect(enSteps[0]?.label).toBe('Understanding the question')
    expect(enSteps.find((s) => s.id === 'visualAnalysis')?.status).toBe('pending')

    setLocale('zh-CN')
    const zhSteps = initialChatWorkSteps('hi', false)
    expect(zhSteps[0]?.label).toBe('理解问题')
    expect(zhSteps.find((s) => s.id === 'visualAnalysis')?.status).toBe('skipped')
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

    const visualBadges = requestPlanStepBadges(plan, 'en', true)
    expect(visualBadges).toEqual(['Visual Recognition', 'No Web', 'Reasoning: Low'])
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

  it('visualAnalysisStepBadges formats properly', () => {
    expect(visualAnalysisStepBadges(1, true, 'zh-CN')).toEqual(['调用 V4 Vision', '1 张图片'])
    expect(visualAnalysisStepBadges(2, false, 'zh-CN')).toEqual(['多模态识图', '2 张图片'])
    expect(visualAnalysisStepBadges(1, true, 'en')).toEqual(['V4 Vision Proxy', '1 image'])
    expect(visualAnalysisStepBadges(3, false, 'en')).toEqual(['Multimodal Vision', '3 images'])
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
      { id: 'visualAnalysis', status: 'done', label: 'Analyze image' },
      { id: 'generate', status: 'done', label: 'Generate' },
    ] as TripChatWorkStep[]
    expect(completedWorkSummary(enSteps, true, 'en')).toBe(
      'Thought · Analyzed image · Answer ready · 2 steps',
    )

    setLocale('zh-CN')
    expect(completedWorkSummary(enSteps, true, 'zh-CN')).toBe(
      '思考完成 · 已解析图片 · 已生成回答 · 共 2 步',
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
