import { expect, it } from 'vitest'
import { budgetChatHistory } from '../features/chat/services/chatHistoryBudget'
it('keeps the most recent turns under a character budget without changing source history', () => {
  const history = [{ role: 'user' as const, content: 'old message' }, { role: 'assistant' as const, content: 'recent' }]
  expect(budgetChatHistory(history, 6)).toEqual([history[1]])
  expect(history).toHaveLength(2)
})
it('limits historical image turns while keeping recent attachments', () => {
  const history = Array.from({ length: 5 }, (_, n) => ({ role: 'user' as const, content: String(n), images: [`image-${n}`] }))
  const bounded = budgetChatHistory(history)
  expect(bounded.filter(t => t.images)).toHaveLength(2)
  expect(bounded.at(-1)?.images).toEqual(['image-4'])
  expect(bounded[0].content).toContain('omitted')
})
