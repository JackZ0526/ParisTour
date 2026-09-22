import type { Locale } from './types'
import { createCopy } from './copyFactory'
const text = createCopy({ en: 'English', 'zh-CN': 'Simplified Chinese', translate: 'The source content is in {p0}; translate it into {p1}.' }, { en: '英文', 'zh-CN': '简体中文', translate: '源文为{p0}，请翻译为{p1}。' })
export function translationDirection(source: Locale, target: Locale) {
  return text('translate', { p0: text(source, undefined, target), p1: text(target, undefined, target) }, target)
}
