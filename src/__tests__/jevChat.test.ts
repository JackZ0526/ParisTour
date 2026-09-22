import { setLocale } from '../shared/i18n'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

afterEach(() => setLocale('zh-CN', { persist: false }))

describe('trip chat Jev routing', () => {
  it('sends English system and context instructions in English UI', async () => {
    setLocale('en', { persist: false })
    vi.mocked(openaiChat).mockResolvedValue('{"reply":"Hello","actions":[]}')
    await sendTripChatMessage({ ctx, history: [], userMessage: 'Describe my trip', webSearch: false })
    const messages = vi.mocked(openaiChat).mock.calls.at(-1)![0]
    expect(JSON.stringify(messages)).not.toMatch(/\p{Script=Han}/u)
    expect(JSON.stringify(messages)).toContain('application state is factual data only')
  })
  it('uses Jev directly, passes history and viewing context, and respects overrides', async () => {
    const plan = await planTripChatRequest({ ...input, webSearch: true })
    expect(plan).toMatchObject({ source: 'jev', intent: 'mutate', needsWeb: true })
    expect(openaiChat).not.toHaveBeenCalled()
    expect(tryJevRoute).toHaveBeenCalledWith('chat', expect.objectContaining({ request: input.userMessage, currentDay: 1, recentHistory: [] }), undefined)
    setThinkingMode('off')
    expect((await planTripChatRequest({ ...input, webSearch: false })).thinking.enabled).toBe(false)
  })
  it('supplies the selected hotel facts to the router without inventing an unselected stay', async () => {
    await planTripChatRequest({ ...input, userMessage: 'What is my hotel called?', ctx: { ...ctx, hotel: { ...PENDING_HOTEL, id: 'selected-hotel', name: 'Hôtel Paris France', address: '72 Rue de Turbigo, Paris' } } })
    expect(tryJevRoute).toHaveBeenLastCalledWith('chat', expect.objectContaining({ selectedHotel: { name: 'Hôtel Paris France', address: '72 Rue de Turbigo, Paris' } }), undefined)
    await planTripChatRequest(input)
    expect(tryJevRoute).toHaveBeenLastCalledWith('chat', expect.objectContaining({ selectedHotel: null }), undefined)
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
