import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { mapLocales } from '../shared/i18n/mapLocale'
it('covers every installed MapLibre UI string in both languages', () => {
  const source = readFileSync('node_modules/maplibre-gl/src/ui/default_locale.ts', 'utf8')
  const keys = [...source.matchAll(/'([^']+)':/g)].map(m => m[1]).sort()
  for (const locale of ['en', 'zh-CN'] as const) expect(Object.keys(mapLocales[locale]).sort()).toEqual(keys)
  for (const value of Object.values(mapLocales.en)) expect(value).not.toMatch(/\p{Script=Han}/u)
  for (const value of Object.values(mapLocales['zh-CN'])) expect(value).toMatch(/\p{Script=Han}/u)
})
