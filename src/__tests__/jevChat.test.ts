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
  vi.mocked(openaiChat).mockReset()
  vi.mocked(openaiChatStream).mockReset()
  setThinkingMode('auto')
  vi.mocked(tryJevRoute).mockResolvedValue({ intent: 'mutate', needsWeb: false, reasoningEffort: 'low' })
})

describe.each([false, true])('trip chat JSON recovery (stream=%s)', (stream) => {
  const send = stream ? sendTripChatMessageStream : sendTripChatMessage
  const request = { ...input, webSearch: false }
  function completion(raw: string) {
    if (stream) vi.mocked(openaiChatStream).mockResolvedValueOnce(raw)
    else vi.mocked(openaiChat).mockResolvedValueOnce(raw)
  }
  beforeEach(() => {
    vi.mocked(openaiChat).mockResolvedValue('未收到可解析的 JSON 内容。请提供需要修复的原始 JSON 字符串。')
  })

  it.each(['', ' \n\t', '<think>internal reasoning only</think>', '```json\n \n```', '```json\n'])('rejects unusable content without asking the JSON fixer for a reply (%j)', async (raw) => {
    completion(raw)
    await expect(send(request)).rejects.toMatchObject({ code: 'empty_reply' })
    expect(openaiChat).toHaveBeenCalledTimes(stream ? 0 : 1)
  })

  it('preserves a plain-text answer without asking the JSON fixer to reinterpret it', async () => {
    completion('你好！想聊什么？')
    expect(await send(request)).toEqual({ reply: '你好！想聊什么？', actions: [] })
    expect(openaiChat).toHaveBeenCalledTimes(stream ? 0 : 1)
  })

  it('keeps the original recoverable reply when repair returns an explanation instead of JSON', async () => {
    const raw = '{"reply":"你好！","actions":['
    if (stream) vi.mocked(openaiChatStream).mockResolvedValueOnce(raw)
    else vi.mocked(openaiChat).mockResolvedValueOnce(raw)
    vi.mocked(openaiChat).mockResolvedValueOnce('未收到可解析的 JSON 内容。请提供需要修复的原始 JSON 字符串。')
    expect(await send(request)).toEqual({ reply: '你好！', actions: [] })
  })

  it('does not interpret an internal error object as a repaired answer', async () => {
    completion('{"reply":"你好！","actions":[')
    vi.mocked(openaiChat).mockResolvedValueOnce('{"error":"No parseable JSON content was received. Please provide the original JSON string."}')
    expect(await send(request)).toEqual({ reply: '你好！', actions: [] })
  })

  it('keeps the original reply when repair fails or has no usable content', async () => {
    completion('{"reply":"你好！","actions":[')
    vi.mocked(openaiChat).mockRejectedValueOnce(new Error('repair offline'))
    expect(await send(request)).toEqual({ reply: '你好！', actions: [] })
  })

  it('propagates cancellation during repair instead of applying a recovered result', async () => {
    const controller = new AbortController()
    completion('{"reply":"你好！","actions":[')
    vi.mocked(openaiChat).mockImplementationOnce(async () => {
      controller.abort()
      throw Object.assign(new Error('cancelled'), { code: 'aborted' })
    })
    await expect(send({ ...request, signal: controller.signal })).rejects.toMatchObject({ code: 'aborted' })
  })

  it('repairs malformed JSON and preserves valid actions', async () => {
    const raw = '{"reply":"切换到第三天。","actions":[{"type":"switch_day","day":3}],}'
    if (stream) vi.mocked(openaiChatStream).mockResolvedValueOnce(raw)
    else vi.mocked(openaiChat).mockResolvedValueOnce(raw)
    vi.mocked(openaiChat).mockResolvedValueOnce(raw.replace(',}', '}'))
    expect(await send({ ...request, ctx: { ...ctx, currentDay: 3 } })).toEqual({ reply: '切换到第三天。', actions: [{ type: 'switch_day', day: 3 }] })
  })
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
