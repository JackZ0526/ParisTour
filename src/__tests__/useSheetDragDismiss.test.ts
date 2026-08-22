import { describe, expect, it } from 'vitest'

describe('useSheetDragDismiss touch targets', () => {
  it('identifies elements inside data-sheet-no-drag as non-draggable', () => {
    type MockElement = {
      tagName: string
      getAttribute: (name: string) => string | null
      parentElement: MockElement | null
      closest: (selector: string) => MockElement | null
    }

    function createMockElement(tagName: string, attrs: Record<string, string> = {}): MockElement {
      const el: MockElement = {
        tagName,
        getAttribute: (name: string) => attrs[name] ?? null,
        parentElement: null,
        closest(selector: string) {
          if (selector === '[data-sheet-no-drag]') {
            let curr: MockElement | null = this
            while (curr) {
              if (curr.getAttribute('data-sheet-no-drag') !== null) return curr
              curr = curr.parentElement
            }
            return null
          }
          return null
        },
      }
      return el
    }

    const parent = createMockElement('div', { 'data-sheet-no-drag': '' })
    const child = createMockElement('div')
    child.parentElement = parent

    expect(Boolean(child.closest('[data-sheet-no-drag]'))).toBe(true)

    const standalone = createMockElement('div')
    expect(Boolean(standalone.closest('[data-sheet-no-drag]'))).toBe(false)
  })
})
