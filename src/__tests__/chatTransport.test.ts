import { beforeEach, describe, expect, it, vi } from 'vitest'
import { openaiChatStream } from '../shared/services/llm/transport'
import { authFetch } from '../features/auth/services/authFetch'
vi.mock('../features/auth/services/authFetch', () => ({ authFetch: vi.fn() }))
const messages = [{ role: 'user' as const, content: 'hello' }]
const options = { preflight: false, thinking: { enabled: true, effort: 'low' as const } }
function stream(chunks: string[]) {
  return new Response(new ReadableStream({ start(controller) {
    chunks.forEach(chunk => controller.enqueue(new TextEncoder().encode(chunk)))
    controller.close()
  } }), { headers: { 'content-type': 'text/event-stream' } })
}
const frame = (text: string) => `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}`
beforeEach(() => vi.clearAllMocks())
describe('chat streaming', () => {
  it('accepts CRLF boundaries split across network chunks and final unterminated frame', async () => {
    vi.mocked(authFetch).mockResolvedValue(stream([frame('hello') + '\r', '\n\r', '\n' + frame(' world')]))
    expect(await openaiChatStream(messages, options)).toBe('hello world')
  })
  it('retries empty output once with reasoning disabled', async () => {
    vi.mocked(authFetch).mockResolvedValueOnce(stream(['data: [DONE]\n\n']))
      .mockResolvedValueOnce(stream([frame('recovered') + '\n\n']))
    expect(await openaiChatStream(messages, options)).toBe('recovered')
    expect(authFetch).toHaveBeenCalledTimes(2)
    const body = JSON.parse(String(vi.mocked(authFetch).mock.calls[1][1]?.body))
    expect(body.thinking?.type ?? body.reasoning_effort).toMatch(/disabled|none/)
  })
  it('does not loop on an empty provider or retry cancelled requests', async () => {
    vi.mocked(authFetch).mockImplementation(async () => stream(['data: [DONE]\n\n']))
    await expect(openaiChatStream(messages, options)).rejects.toMatchObject({ code: 'empty' })
    expect(authFetch).toHaveBeenCalledTimes(2)
    await expect(openaiChatStream(messages, { ...options, signal: AbortSignal.abort() })).rejects.toMatchObject({ code: 'aborted' })
    expect(authFetch).toHaveBeenCalledTimes(2)
  })
})

it('never retries a provider error after partial output', async () => {
  vi.mocked(authFetch).mockResolvedValue(stream([frame('partial') + '\n\n', 'data: {"error":{"code":"empty","message":"upstream failed"}}\n\n']))
  await expect(openaiChatStream(messages, options)).rejects.toMatchObject({ code: 'empty' })
  expect(authFetch).toHaveBeenCalledTimes(1)
})
it('can retry empty output when reasoning was already off', async () => {
  vi.mocked(authFetch).mockResolvedValueOnce(stream(['data: [DONE]\n\n']))
    .mockResolvedValueOnce(stream([frame('ok') + '\n\n']))
  expect(await openaiChatStream(messages, { ...options, thinking: { enabled: false, effort: 'off' } })).toBe('ok')
  expect(authFetch).toHaveBeenCalledTimes(2)
})
