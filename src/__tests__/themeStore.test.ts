import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  initTheme,
  getThemePreference,
  setThemePreference,
  resolveTheme,
  subscribeTheme,
  LIGHT_THEME_COLOR,
  DARK_THEME_COLOR,
  _resetThemeStoreForTests,
} from '../shared/services/themeStore'

describe('Theme Store & Dark Mode', () => {
  let storage: Record<string, string> = {}
  let classList: Set<string> = new Set()
  let systemPrefersDark = false

  beforeEach(() => {
    _resetThemeStoreForTests()
    storage = {}
    classList = new Set()
    systemPrefersDark = false

    const mockLocalStorage = {
      getItem: vi.fn((key: string) => storage[key] ?? null),
      setItem: vi.fn((key: string, val: string) => {
        storage[key] = val
      }),
      removeItem: vi.fn((key: string) => {
        delete storage[key]
      }),
    }

    const mockDocumentElement = {
      classList: {
        add: vi.fn((cls: string) => classList.add(cls)),
        remove: vi.fn((cls: string) => classList.delete(cls)),
        contains: vi.fn((cls: string) => classList.has(cls)),
      },
      style: {
        colorScheme: 'light',
      },
    }

    const mockMatchMedia = vi.fn((query: string) => ({
      matches: systemPrefersDark,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))

    vi.stubGlobal('localStorage', mockLocalStorage)
    vi.stubGlobal('document', {
      documentElement: mockDocumentElement,
      querySelector: vi.fn(() => null),
      createElement: vi.fn(() => ({ setAttribute: vi.fn() })),
      head: { appendChild: vi.fn() },
    })
    vi.stubGlobal('window', {
      matchMedia: mockMatchMedia,
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('resolves explicit light and dark themes correctly', () => {
    expect(resolveTheme('light')).toBe('light')
    expect(resolveTheme('dark')).toBe('dark')
    expect(LIGHT_THEME_COLOR).toBe('#ecefe8')
    expect(DARK_THEME_COLOR).toBe('#121614')
  })

  it('switches to dark mode and applies dark class to document root', () => {
    setThemePreference('dark')
    expect(getThemePreference()).toBe('dark')
    expect(classList.has('dark')).toBe(true)
    expect(storage['paris_tour_theme_mode']).toBe('dark')
  })

  it('switches to light mode and removes dark class from document root', () => {
    setThemePreference('dark')
    expect(classList.has('dark')).toBe(true)

    setThemePreference('light')
    expect(getThemePreference()).toBe('light')
    expect(classList.has('dark')).toBe(false)
    expect(storage['paris_tour_theme_mode']).toBe('light')
  })

  it('notifies subscribers when theme preference changes', () => {
    const callback = vi.fn()
    const unsubscribe = subscribeTheme(callback)

    setThemePreference('dark')
    expect(callback).toHaveBeenCalledTimes(1)

    setThemePreference('light')
    expect(callback).toHaveBeenCalledTimes(2)

    unsubscribe()
    setThemePreference('dark')
    expect(callback).toHaveBeenCalledTimes(2)
  })

  it('initializes from localStorage if saved preference exists', () => {
    storage['paris_tour_theme_mode'] = 'dark'
    initTheme()
    expect(getThemePreference()).toBe('dark')
    expect(classList.has('dark')).toBe(true)
  })

  it('defaults to the system preference when no saved preference exists', () => {
    systemPrefersDark = true
    initTheme()

    expect(getThemePreference()).toBe('system')
    expect(classList.has('dark')).toBe(true)
  })
})
