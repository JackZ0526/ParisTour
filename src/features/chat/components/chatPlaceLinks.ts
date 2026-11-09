import type { ChatPlaceReference } from '../services/chatPlaceReferences'

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/** Only decorate escaped text nodes, never markup, code or arbitrary model URLs. */
export function linkChatPlaces(html: string, references: readonly ChatPlaceReference[]): string {
  const aliases = new Map<string, number>()
  references.forEach((place, index) => {
    for (const name of [place.label, place.name]) {
      if (!name || name.trim().length < 2) continue
      const escaped = escapeHtml(name)
      const key = escaped.toLocaleLowerCase()
      const previous = aliases.get(key)
      if (previous === undefined) aliases.set(key, index)
      else if (previous >= 0 && previous !== index) {
        const other = references[previous]
        if (other.name.toLocaleLowerCase() !== place.name.toLocaleLowerCase() ||
          (other.address && place.address && other.address.toLocaleLowerCase() !== place.address.toLocaleLowerCase())) {
          // Shared chain names must not silently open the wrong branch.
          aliases.set(key, -1)
        }
      }
    }
  })
  for (const [name, index] of aliases) if (index < 0) aliases.delete(name)
  if (!aliases.size) return html
  const pattern = [...aliases.keys()].sort((a, b) => b.length - a.length)
    .map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  const matcher = new RegExp(pattern, 'giu')
  let inCode = false
  return html.split(/(<[^>]+>)/g).map(part => {
    if (part.startsWith('<')) {
      if (/^<code(?:\s|>)/.test(part)) inCode = true
      if (part === '</code>') inCode = false
      return part
    }
    if (inCode) return part
    return part.replace(matcher, (match, offset: number) => {
      const word = /[\p{Script=Latin}\p{N}]/u
      if ((word.test(match[0]) && word.test(part[offset - 1] || '')) ||
        (word.test(match.at(-1) || '') && word.test(part[offset + match.length] || ''))) return match
      const index = aliases.get(match.toLocaleLowerCase())!
      return `<button type="button" data-chat-place="${index}" class="chat-place-link">${match}</button>`
    })
  }).join('')
}
