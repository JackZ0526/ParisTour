import { useMemo } from 'react'

/**
 * Tiny, safe Markdown renderer for assistant chat bubbles.
 *
 * Scope (intentionally narrow — no external deps):
 *   - Paragraphs separated by blank lines
 *   - Single-line breaks inside a paragraph
 *   - `**bold**` and `*italic*` (italic must not sit next to a `*` — avoids
 *     eating the second `*` of `**bold**`)
 *   - `` `inline code` ``
 *   - Unordered (`- ` / `* `) and ordered (`1. ` / `2. `) lists
 *   - Trailing `---` renders as a horizontal rule
 *
 * Everything else passes through as literal text. User content is HTML-escaped
 * before any inline markers are applied, so injection is not possible.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Apply inline markers (`**bold**`, `*italic*`, ` `code` `) to an already
 * HTML-escaped string.
 *
 * Streaming-aware: an *unpaired* trailing marker (e.g. the `**` in
 * "**foo" when the model's reply is still arriving) is kept as a literal
 * character. Once the matching close arrives the same renderer re-runs
 * and the marker becomes a real `<strong>` / `<em>` / `<code>` tag. The
 * user sees text grow with the marker visible, then the marker disappears
 * and the run becomes bold — much less jarring than the text vanishing.
 */
function applyInline(escaped: string): string {
  const PH_OPEN = '\u0001'
  const PH_CLOSE = '\u0002'
  let s = escaped

  // Inline code: `…` (highest priority; no further transforms inside it).
  s = pairOrLeave(s, '`', PH_OPEN + 'CODE:', PH_CLOSE)

  // Bold: **…** (must come before italic so it claims its stars).
  s = pairOrLeave(s, '**', PH_OPEN + 'STRONG:', PH_CLOSE)

  // Italic: single *…* (excluding the `*` that belongs to a `**` we
  // already consumed). We split on isolated single `*` boundaries.
  s = pairItalic(s, PH_OPEN + 'EM:', PH_CLOSE)

  // Expand placeholders to real tags.
  s = s
    .replace(new RegExp(`${PH_OPEN}STRONG:([\\s\\S]*?)${PH_CLOSE}`, 'g'), '<strong>$1</strong>')
    .replace(new RegExp(`${PH_OPEN}EM:([\\s\\S]*?)${PH_CLOSE}`, 'g'), '<em>$1</em>')
    .replace(new RegExp(`${PH_OPEN}CODE:([\\s\\S]*?)${PH_CLOSE}`, 'g'), '<code>$1</code>')

  return s
}

/**
 * Find every occurrence of `marker` (a 1- or 2-char string like `**` or `` ` ``)
 * and pair them up. If there's an unpaired trailing marker, leave it as a
 * literal so the user's eye can see it arrive. Pairs become `open + body + close`
 * placeholders that the caller will later expand to HTML tags.
 */
function pairOrLeave(
  s: string,
  marker: string,
  openPlaceholder: string,
  closePlaceholder: string,
): string {
  const out: string[] = []
  let cursor = 0
  let pendingOpenIdx = -1 // index in `s` of the most recent unpaired marker

  while (cursor <= s.length) {
    const next = s.indexOf(marker, cursor)
    if (next < 0) {
      // No more markers. Flush whatever we have.
      if (pendingOpenIdx >= 0) {
        // The last marker is unpaired — keep the segment as literal text
        // (so the marker characters stay visible) and keep the suffix too.
        out.push(s.slice(pendingOpenIdx))
      } else {
        out.push(s.slice(cursor))
      }
      break
    }
    if (pendingOpenIdx < 0) {
      // Open a pair.
      out.push(s.slice(cursor, next))
      pendingOpenIdx = next
      cursor = next + marker.length
      continue
    }
    // We have a pending open. Find the matching body until this close.
    // The body is everything between pendingOpen + marker.length and `next`.
    out.push(openPlaceholder)
    out.push(s.slice(pendingOpenIdx + marker.length, next))
    out.push(closePlaceholder)
    pendingOpenIdx = -1
    cursor = next + marker.length
  }

  return out.join('')
}

/**
 * Pair up single `*` markers for italics, being careful NOT to consume the
 * `*` characters that belong to a `**` we already turned into a placeholder
 * (or that an unpaired trailing `**` left behind). The unpaired-trailing
 * case is handled by leaving a literal `*` visible.
 */
function pairItalic(s: string, openPlaceholder: string, closePlaceholder: string): string {
  const out: string[] = []
  let cursor = 0
  let pendingOpenIdx = -1

  while (cursor <= s.length) {
    // Find the next single `*` that is NOT part of a `**` run.
    const next = findIsolatedStar(s, cursor)
    if (next < 0) {
      if (pendingOpenIdx >= 0) {
        out.push(s.slice(pendingOpenIdx))
      } else {
        out.push(s.slice(cursor))
      }
      break
    }
    if (pendingOpenIdx < 0) {
      out.push(s.slice(cursor, next))
      pendingOpenIdx = next
      cursor = next + 1
      continue
    }
    out.push(openPlaceholder)
    out.push(s.slice(pendingOpenIdx + 1, next))
    out.push(closePlaceholder)
    pendingOpenIdx = -1
    cursor = next + 1
  }

  return out.join('')
}

/** Find the next `*` that is not part of a `**` run, starting from `from`. */
function findIsolatedStar(s: string, from: number): number {
  for (let i = from; i < s.length; i++) {
    if (s[i] !== '*') continue
    const prev = i > 0 ? s[i - 1] : ''
    const next = i + 1 < s.length ? s[i + 1] : ''
    if (prev === '*' || next === '*') {
      // Either we're the second star of `**` (prev is *), or the first star
      // of `**` (next is *). Skip this one and the paired one to avoid
      // eating the wrong character.
      if (prev === '*') {
        // We just saw the open star; jump past both.
        i += 1
      } else {
        // next is *; jump past both.
        i += 1
      }
      continue
    }
    return i
  }
  return -1
}

function renderBlock(block: string): string {
  const trimmed = block.trim()
  if (!trimmed) return ''

  // Horizontal rule.
  if (/^-{3,}\s*$/.test(trimmed)) return '<hr/>'

  // Unordered list: every line starts with `- ` or `* `.
  if (/^([-*])\s+/m.test(trimmed) && trimmed.split('\n').every((l) => /^([-*])\s+/.test(l.trim()) || l.trim() === '')) {
    const items = trimmed
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => /^[-*]\s+/.test(l))
      .map((l) => l.replace(/^[-*]\s+/, ''))
      .map((l) => `<li>${applyInline(escapeHtml(l))}</li>`)
      .join('')
    return `<ul>${items}</ul>`
  }

  // Ordered list: every line starts with `\d+\. `.
  if (/^\d+\.\s+/m.test(trimmed) && trimmed.split('\n').every((l) => /^\d+\.\s+/.test(l.trim()) || l.trim() === '')) {
    const items = trimmed
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => /^\d+\.\s+/.test(l))
      .map((l) => l.replace(/^\d+\.\s+/, ''))
      .map((l) => `<li>${applyInline(escapeHtml(l))}</li>`)
      .join('')
    return `<ol>${items}</ol>`
  }

  // Paragraph: single newlines become <br/> inside a paragraph.
  const withBreaks = trimmed
    .split('\n')
    .map((line) => applyInline(escapeHtml(line)))
    .join('<br/>')
  return `<p>${withBreaks}</p>`
}

function formatInlineMarkdown(text: string): string {
  if (!text) return ''
  // Normalize CRLF.
  const normalized = text.replace(/\r\n?/g, '\n')
  // Split on blank lines; keep consecutive non-blank lines together.
  const blocks = normalized
    .split(/\n{2,}/)
    .map((b) => renderBlock(b))
    .filter(Boolean)
  return blocks.join('')
}

export function InlineMarkdown({
  text,
  className,
}: {
  text: string
  className?: string
}) {
  const html = useMemo(() => formatInlineMarkdown(text), [text])
  return (
    <div
      className={className}
      // Pre-escaped + tagged by formatInlineMarkdown; no user HTML reaches here.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
