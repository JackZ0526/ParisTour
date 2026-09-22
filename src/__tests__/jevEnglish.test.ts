import { beforeEach, describe, expect, it, vi } from 'vitest'
import { englishJevState, clearJevEnglishCache } from '../shared/services/llm/jev-english'
import { callOpenAIMessages } from '../shared/services/llm/transport'
import { setLocale } from '../shared/i18n'
vi.mock('../shared/services/llm/transport', () => ({ callOpenAIMessages: vi.fn() }))
beforeEach(() => { vi.clearAllMocks(); clearJevEnglishCache() })
describe('English-only Jev context', () => {
  it.each(['en', 'zh-CN'] as const)('normalizes presets without an API request in %s', async (locale) => {
    setLocale(locale, { persist: false })
    const result = await englishJevState({ preferences: ['晨间咖啡'], id: 'place-1' })
    expect(result).not.toMatch(/\p{Script=Han}/u)
    expect(JSON.parse(result).id).toBe('place-1')
    expect(callOpenAIMessages).not.toHaveBeenCalled()
  })
  it('translates once, preserves IDs and source data, and caches across UI languages', async () => {
    vi.mocked(callOpenAIMessages).mockResolvedValue('{"translations":["Do not remove the Louvre"]}')
    const original = { request: '不要移除卢浮宫', placeId: 'google-123' }
    const first = await englishJevState(original)
    setLocale('en', { persist: false })
    expect(await englishJevState(original)).toBe(first)
    expect(JSON.parse(first)).toEqual({ request: 'Do not remove the Louvre', placeId: 'google-123' })
    expect(original.request).toBe('不要移除卢浮宫')
    expect(callOpenAIMessages).toHaveBeenCalledTimes(1)
    expect(callOpenAIMessages).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ preflight: false, webSearch: false }))
  })
  it.each(['{}', '{"translations":[]}', '{"translations":["仍是中文"]}'])('rejects incomplete translation: %s', async (raw) => {
    vi.mocked(callOpenAIMessages).mockResolvedValue(raw)
    await expect(englishJevState({ request: '新请求' })).rejects.toThrow()
  })
  it('does not translate opaque identifiers to make a request pass', async () => {
    await expect(englishJevState({ id: '中文ID' })).rejects.toThrow()
    expect(callOpenAIMessages).not.toHaveBeenCalled()
  })
})
