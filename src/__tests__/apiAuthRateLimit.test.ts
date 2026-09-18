import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { requireAllowlistedUser } from '../../api/_lib/auth'
const fetchMock = vi.fn()
beforeEach(() => {
  vi.stubEnv('VERCEL', '1')
  vi.stubEnv('SUPABASE_URL', 'https://db.example.test')
  vi.stubEnv('SUPABASE_ANON_KEY', 'test-public-key')
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
  fetchMock.mockResolvedValueOnce(Response.json({ id: 'test-user', email: 'test@example.test' }))
    .mockResolvedValueOnce(Response.json(true))
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })
const request = () => new Request('https://app.example.test/api/deepseek/chat/completions', {
  headers: { authorization: 'Bearer test-token' },
})
it('permits an authenticated allowlisted request within quota', async () => {
  fetchMock.mockResolvedValueOnce(Response.json(true))
  expect(await requireAllowlistedUser(request())).toMatchObject({ ok: true })
  expect(fetchMock.mock.calls[2][0]).toContain('/rpc/consume_ai_request')
})
it('returns 429 and Retry-After when the quota is exceeded', async () => {
  fetchMock.mockResolvedValueOnce(Response.json(false))
  const result = await requireAllowlistedUser(request())
  expect(result.ok).toBe(false)
  if (!result.ok) {
    expect(result.response.status).toBe(429)
    expect(result.response.headers.get('retry-after')).toBe('60')
  }
})
it('fails closed when the limiter is unavailable', async () => {
  fetchMock.mockRejectedValueOnce(new Error('offline'))
  const result = await requireAllowlistedUser(request())
  if (!result.ok) expect(result.response.status).toBe(503)
  else throw new Error('Unexpected authorization')
})
