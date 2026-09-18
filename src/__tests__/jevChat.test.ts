import { beforeEach, describe, expect, it, vi } from 'vitest'
import { planTripChatRequest, sendTripChatMessage, sendTripChatMessageStream, type TripChatContext } from '../features/chat/services/tripChat'
import { tryJevRoute } from '../shared/services/llm/jev-router'
import { openaiChat, openaiChatStream } from '../shared/services/llm/llm'
import { setThinkingMode } from '../shared/services/llm/model-state'
import { PENDING_HOTEL } from '../features/hotel/constants/hotels'

vi.mock('../shared/services/llm/jev-router', () => ({ tryJevRoute: vi.fn() }))
vi.mock('../shared/services/llm/llm', async (importOriginal) => ({
  ...await importOriginal<typeof import('../shared/services/llm/llm')>(),
  openaiChat: vi.fn(), openaiChatStream: vi.fn(),
}))
const ctx: TripChatContext = { hotel: PENDING_HOTEL, hotelCandidates: [], days: [], currentDay: 1, customPlaces: {}, destination: 'Paris' }
const input = { ctx, history: [], userMessage: '把卢浮宫移到第三天' }
beforeEach(() => {
  vi.clearAllMocks()
  setThinkingMode('auto')
  vi.mocked(tryJevRoute).mockResolvedValue({ intent: 'mutate', needsWeb: false, reasoningEffort: 'low' })
})

describe('trip chat Jev routing', () => {
  it('uses Jev directly, passes history and viewing context, and respects overrides', async () => {
    const plan = await planTripChatRequest({ ...input, webSearch: true })
    expect(plan).toMatchObject({ source: 'jev', intent: 'mutate', needsWeb: true })
    expect(openaiChat).not.toHaveBeenCalled()
    expect(tryJevRoute).toHaveBeenCalledWith('chat', expect.objectContaining({ request: input.userMessage, currentDay: 1, recentHistory: [] }), undefined)
    setThinkingMode('off')
    expect((await planTripChatRequest({ ...input, webSearch: false })).thinking.enabled).toBe(false)
  })
  it('uses the original LLM then deterministic fallback when unavailable', async () => {
    vi.mocked(tryJevRoute).mockResolvedValue(null)
    vi.mocked(openaiChat).mockResolvedValue('{"intent":"answer","needsWeb":false,"reasoningEffort":"off"}')
    expect((await planTripChatRequest(input)).source).toBe('model')
    vi.mocked(openaiChat).mockRejectedValue(new Error('offline'))
    expect(await planTripChatRequest(input)).toMatchObject({ source: 'fallback', intent: 'mutate' })
  })
  it.each([false, true])('sends current and historical images natively, without a proxy (stream=%s)', async (stream) => {
    vi.mocked(tryJevRoute).mockResolvedValue({ intent: 'answer', needsWeb: false, reasoningEffort: 'off' })
    const raw = '{"reply":"这是一张图片。","actions":[]}'
    vi.mocked(openaiChat).mockResolvedValue(raw)
    vi.mocked(openaiChatStream).mockResolvedValue(raw)
    const events = vi.fn()
    const call = stream ? sendTripChatMessageStream : sendTripChatMessage
    await call({ ...input, userMessage: '这是什么？', images: ['data:image/png;base64,current'], history: [{ role: 'user', content: '上一张图', images: ['data:image/png;base64,previous'] }], onVisualAnalysis: events })
    const model = stream ? vi.mocked(openaiChatStream) : vi.mocked(openaiChat)
    expect(model).toHaveBeenCalledTimes(1)
    if (stream) expect(openaiChat).not.toHaveBeenCalled()
    const messages = model.mock.calls[0][0]
    expect(messages[1].content).toContainEqual({ type: 'image_url', image_url: { url: 'data:image/png;base64,previous' } })
    expect(messages.at(-1)?.content).toContainEqual({ type: 'image_url', image_url: { url: 'data:image/png;base64,current' } })
    expect(events.mock.calls).toEqual([['start', { imageCount: 1, isProxy: false }], ['done', { imageCount: 1, isProxy: false }]])
  })
})
