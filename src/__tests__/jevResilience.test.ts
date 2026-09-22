import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { JevCircuit, JEV_CLIENT_BUDGET_MS, JEV_COOLDOWN_MS } from '../shared/services/jevCircuit'
import { requestJev, jevClientCircuit } from '../shared/services/llm/jev-request'
import { englishJevState } from '../shared/services/llm/jev-english'
import { authFetch } from '../features/auth/services/authFetch'
vi.mock('../shared/services/llm/jev-english', () => ({ englishJevState: vi.fn(async () => '{}') }))
vi.mock('../features/auth/services/authFetch', () => ({ authFetch: vi.fn() }))
beforeEach(() => { vi.clearAllMocks(); jevClientCircuit.reset(); vi.useFakeTimers() })
afterEach(() => vi.useRealTimers())

describe('Jev quick fallback', () => {
  it('isolates purposes, permits one recovery probe and ignores stale successes', () => {
    const circuit = new JevCircuit()
    const failed = circuit.acquire('rank')!
    const stale = circuit.acquire('rank')!
    failed('failure')
    stale('success')
    expect(circuit.acquire('rank')).toBeNull()
    expect(circuit.acquire('chat')).not.toBeNull()
    expect(circuit.acquire('preflight')).not.toBeNull()
    vi.advanceTimersByTime(JEV_COOLDOWN_MS)
    const probe = circuit.acquire('rank')!
    expect(circuit.acquire('rank')).toBeNull()
    probe('success')
    expect(circuit.acquire('rank')).not.toBeNull()
  })
  it('skips translation and network during cooldown, then recovers', async () => {
    vi.mocked(authFetch).mockResolvedValue(new Response('', { status: 503 }))
    expect(await requestJev('rank', {})).toBeNull()
    expect(await requestJev('rank', { message: '中文' })).toBeNull()
    expect(englishJevState).toHaveBeenCalledTimes(1)
    expect(authFetch).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(JEV_COOLDOWN_MS)
    vi.mocked(authFetch).mockResolvedValue(Response.json({ scores: [] }))
    expect(await requestJev('rank', {})).toEqual({ scores: [] })
  })
  it('bounds even an uncooperative fetch and immediately bypasses the next attempt', async () => {
    vi.mocked(authFetch).mockImplementation(() => new Promise(() => {}))
    const pending = requestJev('rank', {})
    await vi.advanceTimersByTimeAsync(JEV_CLIENT_BUDGET_MS - 1)
    let settled = false
    pending.then(() => { settled = true })
    await Promise.resolve()
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(await pending).toBeNull()
    expect(await requestJev('rank', {})).toBeNull()
    expect(authFetch).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('does not treat caller cancellation, input rejection or translation errors as an outage', async () => {
    vi.mocked(authFetch).mockImplementation(() => new Promise(() => {}))
    const controller = new AbortController()
    const pending = requestJev('chat', {}, controller.signal)
    const assertion = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    controller.abort()
    await assertion
    vi.mocked(authFetch).mockResolvedValue(new Response('', { status: 422 }))
    expect(await requestJev('chat', {})).toBeNull()
    vi.mocked(englishJevState).mockRejectedValueOnce(new Error('Translation failed'))
    expect(await requestJev('chat', {})).toBeNull()
    vi.mocked(authFetch).mockResolvedValue(Response.json({ healthy: true }))
    expect(await requestJev('chat', {})).toEqual({ healthy: true })
  })
})
