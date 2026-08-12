import { beforeEach, describe, expect, it, vi } from 'vitest'

const { callOpenAIMessages } = vi.hoisted(() => ({
  callOpenAIMessages: vi.fn(),
}))

vi.mock('../shared/services/llm/transport', () => ({
  callGemini: vi.fn(),
  callOpenAIMessages,
}))

import { generateText } from '../shared/services/llm/business/_service'

describe('generateText JSON fallback', () => {
  beforeEach(() => {
    callOpenAIMessages.mockReset()
  })

  it('retries the original JSON task without web tools when a tool envelope is returned', async () => {
    callOpenAIMessages
      .mockResolvedValueOnce(
        '["Paris opening hours"]<｜DSML｜><｜invoke begin｜><｜DSML｜><｜tool_calls｜>',
      )
      .mockResolvedValueOnce('{"places":[],"day":{"day":2,"stops":[]}}')

    const result = await generateText('system', 'user', {
      strict: true,
      task: 'itineraryDayGenerate',
      json: true,
      webSearch: 'auto',
    })

    expect(result).toBe('{"places":[],"day":{"day":2,"stops":[]}}')
    expect(callOpenAIMessages).toHaveBeenCalledTimes(2)
    expect(callOpenAIMessages.mock.calls[0]?.[1]?.webSearch).toBe('auto')
    expect(callOpenAIMessages.mock.calls[1]?.[1]?.webSearch).toBe(false)
  })
})
