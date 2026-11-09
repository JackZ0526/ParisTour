import { beforeEach, expect, it, vi } from 'vitest'
import { sendTripChatMessageStream, type TripChatContext } from '../features/chat/services/tripChat'
import { authFetch } from '../features/auth/services/authFetch'
import { PENDING_HOTEL } from '../features/hotel/constants/hotels'

// Exercise the real chat service, SSE transport and repair parser together.
vi.mock('../features/auth/services/authFetch', () => ({ authFetch: vi.fn() }))
vi.mock('../shared/services/llm/jev-router', () => ({
  tryJevRoute: vi.fn(async () => ({ intent: 'answer', needsWeb: false, reasoningEffort: 'off' })),
}))

const ctx: TripChatContext = { hotel: PENDING_HOTEL, hotelCandidates: [], days: [], currentDay: 1, customPlaces: {}, destination: 'Paris' }
const request = { ctx, history: [], userMessage: '你好', webSearch: false as const }
const frame = (content: string, finish_reason?: string) => `data: ${JSON.stringify({ choices: [{ delta: { content }, finish_reason }] })}\n\n`
function stream(content: string, finish?: string) {
  return new Response(frame(content, finish) + 'data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } })
}

beforeEach(() => vi.mocked(authFetch).mockReset())

it('recovers whitespace through a generation retry without calling the repair model', async () => {
  vi.mocked(authFetch).mockResolvedValueOnce(stream(' \n\t'))
    .mockResolvedValueOnce(stream('{"reply":"你好！","actions":[]}'))
  const onReplyDelta = vi.fn()
  expect(await sendTripChatMessageStream({ ...request, onReplyDelta })).toEqual({ reply: '你好！', actions: [] })
  expect(authFetch).toHaveBeenCalledTimes(2)
  for (const [, init] of vi.mocked(authFetch).mock.calls) {
    expect(JSON.parse(String(init?.body)).stream).toBe(true)
  }
  expect(onReplyDelta).toHaveBeenLastCalledWith('你好！')
})

it('ends repeated empty generations with a retryable error instead of invoking repair', async () => {
  vi.mocked(authFetch).mockImplementation(async () => stream(' \n'))
  await expect(sendTripChatMessageStream(request)).rejects.toMatchObject({ code: 'empty' })
  expect(authFetch).toHaveBeenCalledTimes(2)
})

it('keeps the streamed reply when the repair API returns an internal error object', async () => {
  vi.mocked(authFetch).mockResolvedValueOnce(stream('{"reply":"你好！","actions":['))
    .mockResolvedValueOnce(Response.json({ choices: [{ message: { content: '{"error":"Please provide the original JSON string for repair."}' } }] }))
  expect(await sendTripChatMessageStream(request)).toEqual({ reply: '你好！', actions: [] })
  expect(authFetch).toHaveBeenCalledTimes(2)
  expect(JSON.parse(String(vi.mocked(authFetch).mock.calls[1][1]?.body)).stream).not.toBe(true)
})

it('does not pass a length-limited action response to JSON repair or action application', async () => {
  vi.mocked(authFetch).mockResolvedValueOnce(stream('{"reply":"已更新。","actions":[{"type":"switch_day","day":1}]}', 'length'))
  await expect(sendTripChatMessageStream(request)).rejects.toMatchObject({ code: 'truncated' })
  expect(authFetch).toHaveBeenCalledTimes(1)
})
