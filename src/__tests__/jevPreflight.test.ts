import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveModelCallPreflight } from '../shared/services/llm/prompts-runtime'
import { tryJevRoute } from '../shared/services/llm/jev-router'
import { callOpenAIMessages } from '../shared/services/llm/transport'
import { getThinkingMode } from '../shared/services/llm/model-state'

vi.mock('../shared/services/llm/jev-router', () => ({ tryJevRoute: vi.fn() }))
vi.mock('../shared/services/llm/transport', () => ({ callOpenAIMessages: vi.fn() }))
vi.mock('../shared/services/llm/model-state', () => ({ getThinkingMode: vi.fn(() => 'auto') }))
const messages = [{ role: 'user' as const, content: 'Compare these hotels' }]
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getThinkingMode).mockReturnValue('auto')
  vi.mocked(tryJevRoute).mockResolvedValue({ needsWeb: true, reasoningEffort: 'high' })
})

describe('generic preflight with Jev', () => {
  it('uses Jev without a second model call and preserves task effort limits', async () => {
    const result = await resolveModelCallPreflight(messages, { task: 'hotelRecommend' })
    expect(result.needsWeb).toBe(true)
    expect(result.thinking.effort).toBe('medium')
    expect(callOpenAIMessages).not.toHaveBeenCalled()
  })
  it('preserves explicit web and thinking overrides', async () => {
    const result = await resolveModelCallPreflight(messages, { webSearch: false, thinking: { enabled: false, effort: 'off' } })
    expect(result).toEqual({ needsWeb: false, thinking: { enabled: false, effort: 'off' } })
    vi.mocked(tryJevRoute).mockResolvedValue({ needsWeb: false, reasoningEffort: 'low' })
    expect((await resolveModelCallPreflight(messages, { webSearch: true })).needsWeb).toBe(true)
  })
  it('preserves the manual thinking mode', async () => {
    vi.mocked(getThinkingMode).mockReturnValue('off')
    expect((await resolveModelCallPreflight(messages)).thinking.enabled).toBe(false)
  })
  it('falls back to the existing model router', async () => {
    vi.mocked(tryJevRoute).mockResolvedValue(null)
    vi.mocked(callOpenAIMessages).mockResolvedValue('{"needsWeb":false,"reasoningEffort":"off"}')
    expect((await resolveModelCallPreflight(messages)).needsWeb).toBe(false)
    expect(callOpenAIMessages).toHaveBeenCalledTimes(1)
  })
  it('preserves heuristic fallback if both providers fail', async () => {
    vi.mocked(tryJevRoute).mockResolvedValue(null)
    vi.mocked(callOpenAIMessages).mockRejectedValue(new Error('offline'))
    expect((await resolveModelCallPreflight([{ role: 'user', content: '今天的天气' }])).needsWeb).toBe(true)
  })
  it('skips Jev for preflight-free tasks and explicit bypass', async () => {
    await resolveModelCallPreflight(messages, { task: 'translate' })
    await resolveModelCallPreflight(messages, { preflight: false })
    expect(tryJevRoute).not.toHaveBeenCalled()
  })
})
