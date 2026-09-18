import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseJevRoute, tryJevRoute } from '../shared/services/llm/jev-router'
import { authFetch } from '../features/auth/services/authFetch'

vi.mock('../features/auth/services/authFetch', () => ({ authFetch: vi.fn() }))
const response = () => ({
  answers: {
    needsWeb: { type: 'boolean', probability: 0.05 },
    reasoningEffort: { type: 'choice', choice: 'low', probabilities: { off: 0.32, low: 0.61, medium: 0.01, high: 0.06 } },
    intent: { type: 'choice', choice: 'mutate', probabilities: { answer: 0, recommend: 0, mutate: 1 } },
  },
  providerMetadata: { typesafe: { confidence: { intent: 1, reasoningEffort: 0.49 } } },
})

beforeEach(() => vi.clearAllMocks())
afterEach(() => vi.useRealTimers())

describe('Jev decision interpretation', () => {
  it('accepts confident routing even when adjacent effort tiers split probability', () => {
    expect(parseJevRoute(response(), 'chat')).toEqual({ intent: 'mutate', needsWeb: false, reasoningEffort: 'low' })
  })
  it('falls back when web research or intent is uncertain', () => {
    const web = response()
    web.answers.needsWeb.probability = 0.55
    expect(parseJevRoute(web, 'chat')).toBeNull()
    const intent = response()
    intent.providerMetadata.typesafe.confidence.intent = 0.3
    expect(parseJevRoute(intent, 'chat')).toBeNull()
  })
  it('generic preflight does not require an intent', () => {
    const r = response()
    expect(parseJevRoute({ answers: { needsWeb: r.answers.needsWeb, reasoningEffort: r.answers.reasoningEffort } }, 'preflight'))
      .toEqual({ needsWeb: false, reasoningEffort: 'low' })
  })
  it('rejects malformed output, out-of-range probabilities and unknown choices', () => {
    for (const value of [null, {}, [], { answers: null }]) expect(parseJevRoute(value, 'chat')).toBeNull()
    const r = response()
    r.answers.needsWeb.probability = Number.NaN
    expect(parseJevRoute(r, 'chat')).toBeNull()
    r.answers.needsWeb.probability = 1.1
    expect(parseJevRoute(r, 'chat')).toBeNull()
    r.answers.needsWeb.probability = 0.1
    r.answers.intent.choice = 'delete_everything'
    expect(parseJevRoute(r, 'chat')).toBeNull()
  })
})

describe('Jev authenticated client', () => {
  it('uses the server endpoint and returns typed decisions', async () => {
    vi.mocked(authFetch).mockResolvedValue(Response.json(response()))
    expect((await tryJevRoute('chat', { request: '移到第三天' }))?.intent).toBe('mutate')
    expect(authFetch).toHaveBeenCalledWith('/api/jev', expect.objectContaining({ method: 'POST', body: JSON.stringify({ kind: 'chat', state: JSON.stringify({ request: '移到第三天' }) }) }))
  })
  it('falls back on unavailable or malformed responses', async () => {
    vi.mocked(authFetch).mockResolvedValue(new Response('', { status: 502 }))
    expect(await tryJevRoute('chat', {})).toBeNull()
    vi.mocked(authFetch).mockResolvedValue(new Response('not JSON'))
    expect(await tryJevRoute('chat', {})).toBeNull()
  })
  it('timeouts fall back, but caller cancellation propagates', async () => {
    vi.useFakeTimers()
    vi.mocked(authFetch).mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))
    }))
    const timed = tryJevRoute('chat', {})
    await vi.advanceTimersByTimeAsync(5_000)
    expect(await timed).toBeNull()
    const controller = new AbortController()
    const pending = tryJevRoute('chat', {}, controller.signal)
    const assertion = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    controller.abort()
    await assertion
    expect(vi.getTimerCount()).toBe(0)
  })
  it('does not send a request when already cancelled', async () => {
    await expect(tryJevRoute('chat', {}, AbortSignal.abort())).rejects.toMatchObject({ name: 'AbortError' })
    expect(authFetch).not.toHaveBeenCalled()
  })
})
