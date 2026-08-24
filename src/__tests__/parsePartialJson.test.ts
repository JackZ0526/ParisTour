import { describe, it, expect } from 'vitest'
import { parsePartialJson } from '../shared/services/llm/stream'

describe('parsePartialJson', () => {
  it('parses valid complete JSON as-is', () => {
    const raw = '{"days":[{"day":1,"title":"Arrival","theme":"Settle in"}]}'
    expect(parsePartialJson(raw)).toEqual({
      days: [{ day: 1, title: 'Arrival', theme: 'Settle in' }],
    })
  })

  it('parses partial JSON when stream is interrupted inside a string', () => {
    const raw = '{"days":[{"day":1,"title":"Arrival in Par'
    expect(parsePartialJson(raw)).toEqual({
      days: [{ day: 1, title: 'Arrival in Par' }],
    })
  })

  it('parses partial JSON when stream is interrupted after key colon', () => {
    const raw = '{"days":[{"day":1,"title":'
    expect(parsePartialJson(raw)).toEqual({
      days: [{ day: 1, title: '' }],
    })
  })

  it('parses partial JSON when stream ends after a comma', () => {
    const raw = '{"days":[{"day":1,"title":"Arrival",'
    expect(parsePartialJson(raw)).toEqual({
      days: [{ day: 1, title: 'Arrival' }],
    })
  })

  it('parses nested stops array while stops are streaming', () => {
    const raw =
      '{"days":[{"day":1,"title":"Arrival","stops":[{"placeKey":"hotel-selected","note":"Check in and rest",'
    expect(parsePartialJson(raw)).toEqual({
      days: [
        {
          day: 1,
          title: 'Arrival',
          stops: [{ placeKey: 'hotel-selected', note: 'Check in and rest' }],
        },
      ],
    })
  })

  it('handles markdown code block wrappers from LLM output', () => {
    const raw =
      '```json\n{"days":[{"day":1,"title":"Arrival","summary":"First day in Paris'
    expect(parsePartialJson(raw)).toEqual({
      days: [{ day: 1, title: 'Arrival', summary: 'First day in Paris' }],
    })
  })

  it('handles trailing escaped characters safely', () => {
    const raw = '{"days":[{"day":1,"title":"Arrival in Paris\\n'
    const res = parsePartialJson<{ days: Array<{ title: string }> }>(raw)
    expect(res?.days[0]?.title).toBe('Arrival in Paris\n')
  })

  it('returns null for empty or unrecoverable text', () => {
    expect(parsePartialJson('')).toBeNull()
    expect(parsePartialJson('   ')).toBeNull()
    expect(parsePartialJson('invalid non-json')).toBeNull()
  })
})
