import { getLocale, type Locale } from '../../../shared/i18n'
import { stopCardIntroCopy } from '../../../shared/i18n/copy/stopCardIntro'
import type { Place } from '../../../types'

export const STOP_CARD_INTRO_MAX_ZH = 80
export const STOP_CARD_INTRO_MAX_EN = 220
export const STOP_CARD_INTRO_MAX_WORDS = 40

function identity(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase().replace(/[\p{P}\p{Z}\s]/gu, '')
}

export function isItineraryOperationCopy(text: string): boolean {
  return /顺路插入|按行程路线|加到.*末尾|加到当天|用于替换|计划加入第|按最顺路|按当天节奏|作为第\s*\d+\s*天|已(?:经)?(?:加入|添加|删除|替换|修改)|确认(?:加入|添加|替换)|\b(?:added|inserted|removed|replaced)\s+(?:to|from|on|in)\s+(?:day|the itinerary)|\b(?:insert|add|replace).*(?:itinerary|day\s*\d)|confirm (?:adding|replacement)/i.test(text)
}

function isMetadata(text: string, address?: string): boolean {
  if (address && identity(text) === identity(address)) return true
  return /^(?:地址|住址|电话|网址|营业时间|开放时间|评分|价格|address|location|tel(?:ephone)?|phone|website|opening hours|rating|price)\s*[:：]/i.test(text)
    || /^\s*\d+[\w/-]*\s+.*\b(?:av(?:enue)?|rue|road|rd|street|st|boulevard|blvd|lane|ln|quai|place|square|sq|drive|dr|route)\b/i.test(text)
    || /^(?:(?:法国|巴黎|中国|上海|北京|香港|台湾|台北).*)?[\p{Script=Han}\d\s]{2,}(?:路|街|道|巷)\s*\d+\s*[号號]/u.test(text)
    || /^\d{5,6}\s+[\p{L}\s,.-]+$/u.test(text)
    || /^(?:rue|avenue|boulevard|quai|road|street)\b.*\b\d{5}\b/i.test(text)
    || /^(?:Google|Tripadvisor)\s*[★⭐]?\s*\d/i.test(text)
    || /^(?:[€$£￥]\s*\d|\d{1,2}[:h]\d{2}\s*[-–—]|-?\d{1,2}\.\d+\s*,\s*-?\d{1,3}\.\d+)/.test(text)
    || /^(?:https?:\/\/|www\.|\+?\d[\d\s()-]{6,}$)/i.test(text)
}

function isCardDetailSentence(text: string): boolean {
  return /(?:评分|rating)\s*[:：]?[\s★⭐]*\d|\d(?:\.\d)?\s*(?:stars?\b|星)|\b\d{1,2}:\d{2}\b|[€$£￥]\s*\d|(?:地址|address|电话|phone|营业时间|opening hours)\s*[:：]/i.test(text)
}

/** Shared write/display boundary. Never accept addresses as descriptive copy. */
export function normalizeStopCardIntro(raw: string | null | undefined, options: { locale?: Locale; placeName?: string; address?: string } = {}): string {
  const locale = options.locale ?? getLocale()
  if (typeof raw !== 'string' || !raw) return ''
  if (/^\s*[{[]/.test(raw)) return ''
  const lines = raw.replace(/```[\s\S]*?```/g, '').replace(/<[^>]*>/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`#]+/g, '').split(/\n+/).map(line => line.replace(/^\s*(?:[-•>]\s+|\d+[.)]\s+)/, '').trim())
    .filter(line => line && !isMetadata(line, options.address) && !isItineraryOperationCopy(line))
  const text = lines.join(' ').replace(/https?:\/\/\S+/gi, '').replace(/^(?:简介|介绍|亮点|description|intro|highlights?)\s*[:：]\s*/i, '').replace(/\s+/g, ' ').trim()
  if (!text || isMetadata(text, options.address) || isItineraryOperationCopy(text)) return ''
  if (/^(?:暂无|待补充|自定|无简介|unknown|n\/?a\b|no description|description unavailable)/i.test(text)) return ''
  if (options.placeName && identity(text) === identity(options.placeName)) return ''
  if ([...text].length < 6) return ''

  const language = /\p{Script=Han}/u.test(text) ? 'zh-CN' : 'en'
  const max = language === 'en' ? STOP_CARD_INTRO_MAX_EN : STOP_CARD_INTRO_MAX_ZH
  const fits = (value: string) => [...value].length <= max && (language !== 'en' || value.split(/\s+/).length <= STOP_CARD_INTRO_MAX_WORDS)
  const sentences = [...new Intl.Segmenter(locale, { granularity: 'sentence' }).segment(text)].map(part => part.segment.trim())
  let intro = ''
  let count = 0
  for (const sentence of sentences) {
    if (count >= 2) break
    if (isMetadata(sentence, options.address) || isCardDetailSentence(sentence) || isItineraryOperationCopy(sentence)) continue
    const next = intro ? `${intro}${language === 'en' ? ' ' : ''}${sentence}` : sentence
    if (fits(next)) { intro = next; count++; continue }
    if (intro) break
    // Legacy detail paragraphs often contain an overlong opening sentence.
    // Prefer complete clauses; only fall back to an explicit excerpt if needed.
    let clause = ''
    for (const part of sentence.split(/[,，;；:：]/)) {
      const nextClause = clause ? `${clause}${language === 'en' ? ', ' : '，'}${part.trim()}` : part.trim()
      const complete = nextClause.replace(/[.!?。！？]+$/, '') + (language === 'en' ? '.' : '。')
      if (!fits(complete)) break
      clause = nextClause
    }
    if (clause) return clause.replace(/[.!?。！？]+$/, '') + (language === 'en' ? '.' : '。')
    const chars = [...sentence].slice(0, max - 1).join('')
    const excerpt = language === 'en' ? chars.replace(/\s+\S*$/, '').split(/\s+/).slice(0, STOP_CARD_INTRO_MAX_WORDS).join(' ') : chars
    return `${excerpt.replace(/[\s,，;；:：.!?。！？]+$/, '')}…`
  }
  return intro
}

export function stopCardIntro(note: string | undefined, place: Pick<Place, 'name' | 'description' | 'googleAddress'>, locale: Locale, cachedIntro?: string): string {
  for (const text of [note, place.description, cachedIntro]) {
    const intro = normalizeStopCardIntro(text, { locale, placeName: place.name, address: place.googleAddress })
    if (intro) return intro
  }
  return stopCardIntroCopy('missing', undefined, locale)
}
