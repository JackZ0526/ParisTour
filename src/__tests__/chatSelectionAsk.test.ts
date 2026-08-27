import { describe, expect, it } from 'vitest'
import {
  ASK_ABOUT_MAX_EXCERPT,
  askAboutHistoryContent,
  buildAskAboutSendMessage,
  fillAskAboutPrompt,
  fillAskAboutWithQuestion,
  normalizeAskExcerpt,
  positionToolbarAbove,
  previewAskExcerpt,
} from '../features/chat/components/chatSelectionAsk'
import { setLocale, translate } from '../shared/i18n/i18nStore'

describe('chat selection ask helpers', () => {
  it('trims and preserves line breaks in the excerpt', () => {
    expect(normalizeAskExcerpt('  下面这个  \n  景点  ')).toBe('下面这个\n景点')
    expect(normalizeAskExcerpt('\u00a0\u00a0')).toBe('')
  })

  it('caps a very long excerpt', () => {
    const long = '甲'.repeat(ASK_ABOUT_MAX_EXCERPT + 40)
    const out = normalizeAskExcerpt(long)
    expect(out.endsWith('…')).toBe(true)
    expect(out.length).toBe(ASK_ABOUT_MAX_EXCERPT + 1)
  })

  it('fills the i18n prompt without interpolating braces inside the excerpt', () => {
    const template = '请解释或展开一下这段内容：\n\n「{excerpt}」'
    expect(fillAskAboutPrompt(template, '第 {day} 天')).toBe(
      '请解释或展开一下这段内容：\n\n「第 {day} 天」',
    )
  })

  it('places the toolbar above the selection when there is room', () => {
    const pos = positionToolbarAbove(
      { top: 120, left: 80, width: 40, height: 18 },
      { width: 100, height: 32 },
      { width: 400, height: 700 },
    )
    expect(pos.placed).toBe('above')
    expect(pos.top).toBe(120 - 32 - 8)
    expect(pos.left).toBe(80 + 20 - 50)
  })

  it('flips below when the selection is too close to the top', () => {
    const pos = positionToolbarAbove(
      { top: 4, left: 80, width: 40, height: 18 },
      { width: 100, height: 32 },
      { width: 400, height: 700 },
    )
    expect(pos.placed).toBe('below')
    expect(pos.top).toBe(4 + 18 + 8)
  })

  it('clamps horizontally so the toolbar stays in the viewport', () => {
    const pos = positionToolbarAbove(
      { top: 200, left: 2, width: 10, height: 16 },
      { width: 120, height: 32 },
      { width: 200, height: 400 },
      { padding: 8 },
    )
    expect(pos.left).toBe(8)
  })

  it('builds locale follow-up prompts around the selected excerpt', () => {
    setLocale('zh-CN')
    expect(fillAskAboutPrompt(translate('chat.askAboutPrompt'), '下面这个')).toBe(
      '请解释或展开一下这段内容：\n\n「下面这个」',
    )
    setLocale('en')
    expect(fillAskAboutPrompt(translate('chat.askAboutPrompt'), 'this one below')).toBe(
      'Please explain or expand on this excerpt:\n\n“this one below”',
    )
  })

  it('does not interpolate braces inside excerpt or question', () => {
    expect(
      fillAskAboutWithQuestion(
        '关于这段内容：\n\n「{excerpt}」\n\n{question}',
        '第 {day} 天',
        '为什么叫 {name}？',
      ),
    ).toBe('关于这段内容：\n\n「第 {day} 天」\n\n为什么叫 {name}？')
  })

  it('sends an explain prompt when the quote has no typed question', () => {
    expect(
      buildAskAboutSendMessage({
        excerpt: '  17-20m²  ',
        question: '   ',
        explainTemplate: '解释：「{excerpt}」',
        withQuestionTemplate: '关于「{excerpt}」\n{question}',
      }),
    ).toBe('解释：「17-20m²」')
  })

  it('combines quote and typed question for send', () => {
    expect(
      buildAskAboutSendMessage({
        excerpt: '如果你想把',
        question: '这是什么意思？',
        explainTemplate: '解释：「{excerpt}」',
        withQuestionTemplate: '关于「{excerpt}」\n{question}',
      }),
    ).toBe('关于「如果你想把」\n这是什么意思？')
  })

  it('truncates the composer quote preview on one line', () => {
    expect(previewAskExcerpt('如果你想把\n行程改掉', 6)).toBe('如果你想把…')
    expect(previewAskExcerpt('短句', 36)).toBe('短句')
  })

  it('keeps quote and question separate for later history flattening', () => {
    expect(askAboutHistoryContent('Edith 的法式餐厅', '这家餐厅如何')).toBe(
      'Edith 的法式餐厅\n这家餐厅如何',
    )
    expect(askAboutHistoryContent('Edith 的法式餐厅', '  ')).toBe('Edith 的法式餐厅')
    expect(askAboutHistoryContent(undefined, '随便问问')).toBe('随便问问')
  })
})
