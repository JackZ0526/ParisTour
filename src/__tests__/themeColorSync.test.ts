import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  DEFAULT_THEME_COLOR,
  OVERLAY_THEME_COLOR,
  getThemeColor,
  setThemeColor,
  acquireThemeColorLock,
  _resetThemeColorLockForTests,
} from '../shared/services/themeColor'

describe('themeColor dynamic synchronization', () => {
  let metaTags: Array<{ name: string; content: string }>

  beforeEach(() => {
    _resetThemeColorLockForTests()
    metaTags = [{ name: 'theme-color', content: DEFAULT_THEME_COLOR }]

    const mockDocument = {
      querySelector: vi.fn((selector: string) => {
        if (selector === 'meta[name="theme-color"]') {
          const match = metaTags.find((m) => m.name === 'theme-color')
          if (!match) return null
          return {
            getAttribute: (attr: string) => (attr === 'content' ? match.content : null),
            setAttribute: (attr: string, val: string) => {
              if (attr === 'content') match.content = val
              if (attr === 'name') match.name = val
            },
          }
        }
        return null
      }),
      createElement: vi.fn((tag: string) => {
        if (tag === 'meta') {
          const newMeta = { name: '', content: '' }
          return {
            getAttribute: (attr: string) => (attr === 'content' ? newMeta.content : null),
            setAttribute: (attr: string, val: string) => {
              if (attr === 'content') newMeta.content = val
              if (attr === 'name') newMeta.name = val
            },
            _meta: newMeta,
          }
        }
        return {}
      }),
      head: {
        appendChild: vi.fn((el: any) => {
          if (el._meta) {
            metaTags.push(el._meta)
          }
        }),
      },
    }

    vi.stubGlobal('document', mockDocument)
  })

  afterEach(() => {
    _resetThemeColorLockForTests()
    vi.unstubAllGlobals()
  })

  it('reads current theme color correctly', () => {
    expect(getThemeColor()).toBe(DEFAULT_THEME_COLOR)
    setThemeColor('#ffffff')
    expect(getThemeColor()).toBe('#ffffff')
  })

  it('updates theme-color to overlay color when lock is acquired and restores on release', () => {
    expect(getThemeColor()).toBe(DEFAULT_THEME_COLOR)

    const release = acquireThemeColorLock()
    expect(getThemeColor()).toBe(OVERLAY_THEME_COLOR)

    release()
    expect(getThemeColor()).toBe(DEFAULT_THEME_COLOR)
  })

  it('supports reference counting for nested modal locks', () => {
    expect(getThemeColor()).toBe(DEFAULT_THEME_COLOR)

    // First modal opens
    const releaseFirst = acquireThemeColorLock()
    expect(getThemeColor()).toBe(OVERLAY_THEME_COLOR)

    // Second (nested) modal opens
    const releaseSecond = acquireThemeColorLock()
    expect(getThemeColor()).toBe(OVERLAY_THEME_COLOR)

    // Second modal closes -> theme-color should still be overlay color
    releaseSecond()
    expect(getThemeColor()).toBe(OVERLAY_THEME_COLOR)

    // First modal closes -> theme-color restores to original
    releaseFirst()
    expect(getThemeColor()).toBe(DEFAULT_THEME_COLOR)
  })

  it('handles idempotency if release is called multiple times', () => {
    const release = acquireThemeColorLock()
    expect(getThemeColor()).toBe(OVERLAY_THEME_COLOR)

    release()
    expect(getThemeColor()).toBe(DEFAULT_THEME_COLOR)

    // Calling release again should not cause underflow or error
    release()
    expect(getThemeColor()).toBe(DEFAULT_THEME_COLOR)
  })

  it('creates meta tag if missing when acquiring lock', () => {
    metaTags = []
    expect(getThemeColor()).toBe(DEFAULT_THEME_COLOR)

    const release = acquireThemeColorLock()
    expect(getThemeColor()).toBe(OVERLAY_THEME_COLOR)

    release()
    expect(getThemeColor()).toBe(DEFAULT_THEME_COLOR)
  })
})
