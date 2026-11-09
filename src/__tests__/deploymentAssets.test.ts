import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

const config = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'))
const fallback = config.rewrites.find((rule: { destination: string }) => rule.destination === '/index.html')
const matchesFallback = new RegExp(`^${fallback.source}$`)

it('does not disguise missing application scripts as successful HTML pages', () => {
  expect(matchesFallback.test('/assets/index-missing.js')).toBe(false)
  expect(matchesFallback.test('/assets/TripMap-old.js')).toBe(false)
  expect(matchesFallback.test('/api/deepseek/chat/completions')).toBe(false)
})

it('keeps application navigation on the SPA fallback', () => {
  expect(matchesFallback.test('/')).toBe(true)
  expect(matchesFallback.test('/trip/shared')).toBe(true)
})
