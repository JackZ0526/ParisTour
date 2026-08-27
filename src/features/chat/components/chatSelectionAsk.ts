/**
 * Pure helpers for the itinerary-chat “Ask about” selection toolbar.
 * Kept free of React so positioning + prompt building can be unit-tested.
 */

export const CHAT_ASK_SELECTABLE_ATTR = 'data-chat-ask-selectable'
export const CHAT_ASK_SELECTABLE_SELECTOR = `[${CHAT_ASK_SELECTABLE_ATTR}]`
export const ASK_ABOUT_MAX_EXCERPT = 2000
export const ASK_ABOUT_PREVIEW_MAX = 36
export const ASK_ABOUT_TOOLBAR_ESTIMATE = { width: 120, height: 36 }
export const ASK_ABOUT_TOOLBAR_Z = 2060
export const ASK_ABOUT_HIGHLIGHT_Z = 2055

export type SelectionRect = {
  top: number
  left: number
  width: number
  height: number
}

export type ViewportSize = {
  width: number
  height: number
}

export type ToolbarPlacement = {
  top: number
  left: number
  placed: 'above' | 'below'
}

export type ChatSelectionAskState = {
  text: string
  top: number
  left: number
  highlights: SelectionRect[]
}

export function normalizeAskExcerpt(raw: string): string {
  const trimmed = raw
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (!trimmed) return ''
  if (trimmed.length <= ASK_ABOUT_MAX_EXCERPT) return trimmed
  return `${trimmed.slice(0, ASK_ABOUT_MAX_EXCERPT).trimEnd()}…`
}

/** Insert excerpt after i18n lookup so braces inside the quote cannot interpolate. */
export function fillAskAboutPrompt(template: string, excerpt: string): string {
  return template.split('{excerpt}').join(excerpt)
}

export function fillAskAboutWithQuestion(
  template: string,
  excerpt: string,
  question: string,
): string {
  const excerptToken = '\u0001excerpt\u0001'
  const questionToken = '\u0001question\u0001'
  return template
    .split('{excerpt}')
    .join(excerptToken)
    .split('{question}')
    .join(questionToken)
    .split(excerptToken)
    .join(excerpt)
    .split(questionToken)
    .join(question)
}

export function previewAskExcerpt(raw: string, max = ASK_ABOUT_PREVIEW_MAX): string {
  const oneLine = normalizeAskExcerpt(raw).replace(/\n+/g, ' ')
  if (!oneLine) return ''
  if (oneLine.length <= max) return oneLine
  return `${oneLine.slice(0, max).trimEnd()}…`
}

/** Flatten quote + bubble text for later model turns. */
export function askAboutHistoryContent(quote: string | undefined, content: string): string {
  const excerpt = quote ? normalizeAskExcerpt(quote) : ''
  const question = content.trim()
  if (!excerpt) return question
  if (!question) return excerpt
  return `${excerpt}\n${question}`
}
export function buildAskAboutSendMessage(input: {
  excerpt: string
  question: string
  explainTemplate: string
  withQuestionTemplate: string
}): string {
  const excerpt = normalizeAskExcerpt(input.excerpt)
  const question = input.question.trim()
  if (!excerpt) return question
  if (!question) return fillAskAboutPrompt(input.explainTemplate, excerpt)
  return fillAskAboutWithQuestion(input.withQuestionTemplate, excerpt, question)
}

export function getViewportSize(): ViewportSize {
  if (typeof window === 'undefined') return { width: 0, height: 0 }
  return {
    width: window.innerWidth,
    height: window.innerHeight,
  }
}

export function positionToolbarAbove(
  selection: SelectionRect,
  toolbar: { width: number; height: number },
  viewport: ViewportSize,
  opts?: { gap?: number; padding?: number },
): ToolbarPlacement {
  const gap = opts?.gap ?? 8
  const pad = opts?.padding ?? 8
  const toolbarWidth = Math.max(1, toolbar.width)
  const toolbarHeight = Math.max(1, toolbar.height)
  const viewW = Math.max(toolbarWidth + pad * 2, viewport.width)
  const viewH = Math.max(toolbarHeight + pad * 2, viewport.height)

  const centerX = selection.left + selection.width / 2
  let left = centerX - toolbarWidth / 2
  left = Math.min(Math.max(pad, left), viewW - toolbarWidth - pad)

  let top = selection.top - toolbarHeight - gap
  let placed: 'above' | 'below' = 'above'
  if (top < pad) {
    top = selection.top + selection.height + gap
    placed = 'below'
  }
  top = Math.min(Math.max(pad, top), viewH - toolbarHeight - pad)
  return { top, left, placed }
}

function nodeToElement(node: Node | null): Element | null {
  if (!node) return null
  if (node.nodeType === Node.ELEMENT_NODE) return node as Element
  return node.parentElement
}

export function isRangeInsideAskable(range: Range, container: Element): boolean {
  const start = nodeToElement(range.startContainer)
  const end = nodeToElement(range.endContainer)
  if (!start || !end) return false
  const startHit = start.closest(CHAT_ASK_SELECTABLE_SELECTOR)
  const endHit = end.closest(CHAT_ASK_SELECTABLE_SELECTOR)
  if (!startHit || !endHit) return false
  return container.contains(startHit) && container.contains(endHit)
}

export function selectionRectsFromRange(range: Range): SelectionRect[] {
  const rects = Array.from(range.getClientRects())
    .filter((rect) => rect.width > 0 && rect.height > 0)
    .map((rect) => ({
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    }))
  if (rects.length) return rects
  const fallback = range.getBoundingClientRect()
  if (fallback.width > 0 || fallback.height > 0) {
    return [
      {
        top: fallback.top,
        left: fallback.left,
        width: fallback.width,
        height: fallback.height,
      },
    ]
  }
  return []
}

function firstUsefulClientRect(range: Range): DOMRect | null {
  const rects = selectionRectsFromRange(range)
  if (!rects.length) return null
  const first = rects[0]
  return new DOMRect(first.left, first.top, first.width, first.height)
}

export function readAskableSelection(container: Element | null): {
  text: string
  rect: SelectionRect
  highlights: SelectionRect[]
  range: Range
} | null {
  if (!container || typeof window === 'undefined') return null
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null
  const text = normalizeAskExcerpt(sel.toString())
  if (!text) return null
  const range = sel.getRangeAt(0)
  if (!isRangeInsideAskable(range, container)) return null
  const rect = firstUsefulClientRect(range)
  if (!rect) return null
  return {
    text,
    rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
    highlights: selectionRectsFromRange(range),
    range: range.cloneRange(),
  }
}
