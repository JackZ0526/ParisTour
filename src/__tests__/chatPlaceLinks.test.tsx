import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { InlineMarkdown } from '../features/chat/components/InlineMarkdown'
import { linkChatPlaces } from '../features/chat/components/chatPlaceLinks'
import { chatPlaceLocalName, findKnownChatPlace, parseChatPlaceReferences } from '../features/chat/services/chatPlaceReferences'
import type { Place } from '../types'

const places = [
  { name: 'Café de Flore', label: '花神咖啡馆', type: 'cafe' as const },
  { name: "Musée d'Orsay", label: '奥赛博物馆', type: 'attraction' as const },
]

describe('chat place links', () => {
  it('links several recommended names and Chinese aliases inside formatted lists', () => {
    const html = renderToStaticMarkup(<InlineMarkdown text={'1. **花神咖啡馆**（Café de Flore）\n2. **奥赛博物馆**'} places={places} onPlaceClick={() => {}} />)
    expect(html).toContain('<ol>')
    expect(html.match(/data-chat-place="0"/g)).toHaveLength(2)
    expect(html.match(/data-chat-place="1"/g)).toHaveLength(1)
    expect(html).toContain('<strong><button')
  })

  it('keeps user bubbles and inline code as ordinary text', () => {
    const user = renderToStaticMarkup(<InlineMarkdown text="花神咖啡馆" places={places} />)
    const code = renderToStaticMarkup(<InlineMarkdown text="`花神咖啡馆`" places={places} onPlaceClick={() => {}} />)
    expect(user).not.toContain('data-chat-place')
    expect(code).not.toContain('data-chat-place')
  })

  it('escapes place labels and never creates links from arbitrary HTML or URLs', () => {
    const html = renderToStaticMarkup(<InlineMarkdown text={'**<img src=x onerror=alert(1)>** [outside](javascript:alert(1))'} places={[{ name: '<img src=x onerror=alert(1)>' }]} onPlaceClick={() => {}} />)
    expect(html).not.toContain('<img')
    expect(html).not.toContain('href=')
    expect(html).toContain('&lt;img')
    expect(html).toContain('data-chat-place="0"')
  })

  it('prefers longer names and avoids matching a Latin name inside another word', () => {
    const html = linkChatPlaces('<p>Petit Palais / Palais / Palaisian</p>', [{ name: 'Palais' }, { name: 'Petit Palais' }])
    expect(html.match(/data-chat-place="1"/g)).toHaveLength(1)
    expect(html.match(/data-chat-place="0"/g)).toHaveLength(1)
    expect(html).toContain(' / Palaisian</p>')
  })

  it('does not link text inside generated HTML attributes', () => {
    expect(linkChatPlaces('<p title="Café de Flore">hello</p>', places)).toBe('<p title="Café de Flore">hello</p>')
  })

  it('handles apostrophes, ampersands and accented names', () => {
    const html = renderToStaticMarkup(<InlineMarkdown text="Musée d'Orsay et Café A & B" places={[...places, { name: 'Café A & B' }]} onPlaceClick={() => {}} />)
    expect(html.match(/data-chat-place=/g)).toHaveLength(2)
    expect(html).toContain('Café A &amp; B</button>')
  })

  it('uses distinct branch labels instead of linking an ambiguous shared name', () => {
    const html = linkChatPlaces('<p>Café X / Café X (North) / Café X (South)</p>', [
      { name: 'Café X', label: 'Café X (North)', address: '1 Rue A' },
      { name: 'Café X', label: 'Café X (South)', address: '99 Rue B' },
    ])
    expect(html.startsWith('<p>Café X / ')).toBe(true)
    expect(html.match(/data-chat-place="0"/g)).toHaveLength(1)
    expect(html.match(/data-chat-place="1"/g)).toHaveLength(1)
  })
})

it('accepts concrete mentioned venues while rejecting generic, hidden or duplicate references', () => {
  expect(parseChatPlaceReferences([
    ...places, places[0], { name: '餐厅' }, { name: 'Not mentioned' }, { name: 123 }, null,
  ], '花神咖啡馆和奥赛博物馆。')).toEqual(places)
})

it('uses an existing place only when its branch address is compatible', () => {
  const known = { name: 'Café X', nameLocal: '咖啡店 X', googleAddress: '1 Rue A, Paris' } as Place
  expect(findKnownChatPlace({ name: 'Café X', address: '1 Rue A' }, [known])).toBe(known)
  expect(findKnownChatPlace({ name: 'Café X', address: '99 Rue B' }, [known])).toBeUndefined()
})

it('passes a clean Chinese alias to the detail header while retaining its canonical search name', () => {
  expect(chatPlaceLocalName({ name: "Musée de l'Orangerie", label: "橘园美术馆（Musée de l'Orangerie）" })).toBe('橘园美术馆')
  expect(chatPlaceLocalName({ name: 'Café X', label: 'Café X (North)' })).toBeUndefined()
})
