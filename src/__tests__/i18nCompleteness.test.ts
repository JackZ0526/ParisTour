import { describe, it, expect } from 'vitest'
import { LOCALES, DEFAULT_LOCALE } from '../shared/i18n/locales/registry'

function getKeys(dict: Record<string, unknown>, prefix = ''): string[] {
  return Object.keys(dict).flatMap((key) => {
    const val = dict[key]
    const nextKey = prefix ? `${prefix}.${key}` : key
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      return getKeys(val as Record<string, unknown>, nextKey)
    }
    return [nextKey]
  })
}

describe('i18n Completeness', () => {
  const defaultMeta = LOCALES[DEFAULT_LOCALE]
  const defaultKeys = getKeys(defaultMeta.dictionary as unknown as Record<string, unknown>)

  it('default locale has at least one key (sanity)', () => {
    expect(defaultKeys.length).toBeGreaterThan(0)
  })

  // The big win: this loop is driven by the registry, so adding a new
  // locale automatically gets its own parity test. No test edits needed.
  for (const meta of Object.values(LOCALES)) {
    describe(`locale "${meta.id}"`, () => {
      const metaKeys = getKeys(meta.dictionary as unknown as Record<string, unknown>)

      it('has all keys present in the default locale', () => {
        const missing = defaultKeys.filter((k) => !metaKeys.includes(k))
        expect(missing, `missing keys in "${meta.id}"`).toEqual([])
      })

      it('has no extra keys beyond the default locale', () => {
        const extra = metaKeys.filter((k) => !defaultKeys.includes(k))
        expect(extra, `extra keys in "${meta.id}" not in default`).toEqual([])
      })

      it('every leaf value is a non-empty string', () => {
        const empties: string[] = []
        const visit = (node: unknown, path: string) => {
          if (typeof node === 'string') {
            if (node.trim().length === 0) empties.push(path)
            return
          }
          if (node && typeof node === 'object') {
            for (const [k, v] of Object.entries(node)) {
              visit(v, path ? `${path}.${k}` : k)
            }
          }
        }
        visit(meta.dictionary, '')
        expect(empties, `empty translations in "${meta.id}"`).toEqual([])
      })
    })
  }
})
