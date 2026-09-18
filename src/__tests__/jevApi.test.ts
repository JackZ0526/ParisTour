import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST as openaiPost } from '../../api/openai'
import vercelConfig from '../../vercel.json'
import { handleJev as POST } from '../../api/_lib/jev-handler'
import { requireAllowlistedUser } from '../../api/_lib/auth'
import { evaluateRoute } from '../../api/_lib/jev'
vi.mock('../../api/_lib/auth', () => ({ requireAllowlistedUser: vi.fn() }))
vi.mock('../../api/_lib/jev', () => ({ evaluateRoute: vi.fn() }))
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireAllowlistedUser).mockResolvedValue({ ok: true, user: { id: 'test', email: 'test@example.com' } })
})
const request = (body: unknown) => new Request('https://paristour.test/api/jev', { method: 'POST', body: JSON.stringify(body) })
describe('Jev server boundary', () => {
  it('routes the public Jev URL through the existing function without requiring an OpenAI key', async () => {
    const route = vercelConfig.rewrites.find((r) => r.source === '/api/jev')
    expect(route?.destination).toBe('/api/openai?rest=jev')
    vi.mocked(evaluateRoute).mockResolvedValue({ answers: {}, providerMetadata: { typesafe: {} } } as Awaited<ReturnType<typeof evaluateRoute>>)
    const req = new Request(`https://paristour.test${route?.destination}`, {
      method: 'POST', body: JSON.stringify({ kind: 'chat', state: '{}' }),
    })
    expect((await openaiPost(req)).status).toBe(200)
    expect(evaluateRoute).toHaveBeenCalledTimes(1)
    expect(requireAllowlistedUser).toHaveBeenCalledTimes(1)
  })
  it('keeps the authentication gate on the rewritten Jev endpoint', async () => {
    vi.mocked(requireAllowlistedUser).mockResolvedValue({ ok: false, response: new Response('', { status: 401 }) })
    const req = new Request('https://paristour.test/api/openai?rest=jev', {
      method: 'POST', body: JSON.stringify({ kind: 'chat', state: '{}' }),
    })
    expect((await openaiPost(req)).status).toBe(401)
    expect(evaluateRoute).not.toHaveBeenCalled()
  })
  it('rejects unauthenticated requests before inference', async () => {
    vi.mocked(requireAllowlistedUser).mockResolvedValue({ ok: false, response: new Response('', { status: 401 }) })
    expect((await POST(request({ kind: 'chat', state: '{}' }))).status).toBe(401)
    expect(evaluateRoute).not.toHaveBeenCalled()
  })
  it('rejects invalid and oversized input before inference', async () => {
    for (const body of [null, { kind: 'arbitrary', state: '{}' }, { kind: 'chat', state: {} }]) {
      expect((await POST(request(body))).status).toBe(400)
    }
    expect((await POST(request({ kind: 'chat', state: 'a'.repeat(32_001) }))).status).toBe(413)
    expect(evaluateRoute).not.toHaveBeenCalled()
  })
  it('returns typed answers without caching', async () => {
    vi.mocked(evaluateRoute).mockResolvedValue({ answers: {}, providerMetadata: { typesafe: {} } } as Awaited<ReturnType<typeof evaluateRoute>>)
    const response = await POST(request({ kind: 'preflight', state: '{"task":"translate"}' }))
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(evaluateRoute).toHaveBeenCalledWith('preflight', '{"task":"translate"}', expect.any(AbortSignal))
  })
})
