import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { generatePlaceDescription } from '../shared/services/llm/business/place'
import { generateText } from '../shared/services/llm/business/_service'
import { setLocale } from '../shared/i18n'

vi.mock('../shared/services/llm/business/_service', () => ({ generateText: vi.fn(), isLlmConfigured: () => true }))
vi.mock('../shared/services/llm/llmMemo', () => ({ memoizeLlmCall: (_key: string, fn: () => Promise<unknown>) => fn() }))
beforeEach(() => { vi.mocked(generateText).mockReset(); setLocale('zh-CN', { persist: false }) })
afterEach(() => setLocale('zh-CN', { persist: false }))

it('enforces the card contract even when a model returns a long description', async () => {
  vi.mocked(generateText).mockResolvedValue('一间集合家居和服饰的概念店。适合慢慢浏览陈列。' + '每层都可以逛很久。'.repeat(50))
  expect(await generatePlaceDescription({ name: 'Merci', type: 'attraction' })).toBe('一间集合家居和服饰的概念店。适合慢慢浏览陈列。')
  expect(vi.mocked(generateText).mock.calls[0][0]).toContain('stop_card_intro')
})
it('rejects a model address response instead of caching it as the blurb', async () => {
  const address = '49 Av. Franklin Delano Roosevelt, 75008 Paris'
  vi.mocked(generateText).mockResolvedValue(address)
  expect(await generatePlaceDescription({ name: 'Le Carré Élysée', type: 'restaurant', address })).toBeNull()
})
it('enforces English bounds independently of the model instruction', async () => {
  setLocale('en', { persist: false })
  vi.mocked(generateText).mockResolvedValue('A design shop with changing homeware displays. Browse slowly for everyday inspiration. ' + 'More background follows. '.repeat(30))
  expect(await generatePlaceDescription({ name: 'Merci', type: 'attraction' })).toBe('A design shop with changing homeware displays. Browse slowly for everyday inspiration.')
})
