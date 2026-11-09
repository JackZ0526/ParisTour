import { beforeEach, describe, expect, it, vi } from 'vitest'
import { explicitDaysFromMessage, pinActionsToCurrentDay, replyClaimsItineraryApplied, sendTripChatMessageStream, type TripChatContext } from '../features/chat/services/tripChat'
import { openaiChat, openaiChatStream } from '../shared/services/llm/llm'
import { tryJevRoute } from '../shared/services/llm/jev-router'
import { PENDING_HOTEL } from '../features/hotel/constants/hotels'
import { itinerary } from '../features/itinerary/constants/itinerary'
vi.mock('../shared/services/llm/jev-router', () => ({ tryJevRoute: vi.fn() }))
vi.mock('../shared/services/llm/llm', async (original) => ({ ...await original<typeof import('../shared/services/llm/llm')>(), openaiChat: vi.fn(), openaiChatStream: vi.fn() }))
const ctx: TripChatContext = { hotel: PENDING_HOTEL, hotelCandidates: [], days: itinerary, currentDay: 3, customPlaces: {}, destination: 'Paris' }
beforeEach(() => { vi.clearAllMocks(); vi.mocked(openaiChat).mockReset(); vi.mocked(openaiChatStream).mockReset(); vi.mocked(tryJevRoute).mockResolvedValue({ intent: 'mutate', needsWeb: false, reasoningEffort: 'low' }) })
function send(userMessage: string, raw: unknown, history: Array<{ role: 'assistant'; content: string }> = []) {
  vi.mocked(openaiChatStream).mockResolvedValueOnce(JSON.stringify(raw))
  return sendTripChatMessageStream({ ctx, userMessage, history, webSearch: false })
}
describe('operation planning and scope', () => {
  it.each(['清空第1–6天', '清空第一到第六天', 'clear days 1-6'])('recognizes ranges: %s', message => { expect(explicitDaysFromMessage(message, 7)).toEqual([1, 2, 3, 4, 5, 6]) })
  it('recognizes lists and all days while rejecting invalid ranges', () => {
    expect(explicitDaysFromMessage('第1、3、5天', 7)).toEqual([1, 3, 5])
    expect(explicitDaysFromMessage('所有天', 6)).toEqual([1, 2, 3, 4, 5, 6])
    expect(explicitDaysFromMessage('第1-99天', 7)).toEqual([])
  })
  it('defaults to today, confines explicit edits and preserves multi-day actions', () => {
    expect(pinActionsToCurrentDay([{ type: 'remove_place', day: 6, placeName: 'A' }], '删除A', 3)).toEqual([{ type: 'remove_place', day: 3, placeName: 'A' }])
    expect(pinActionsToCurrentDay([{ type: 'remove_place', day: 6, placeName: 'A' }], '删除第2天A', 3)).toEqual([{ type: 'remove_place', day: 2, placeName: 'A' }])
    expect(pinActionsToCurrentDay([{ type: 'remove_place', day: 6, placeName: 'A' }], '清空第1–6天', 3)).toEqual([{ type: 'remove_place', day: 6, placeName: 'A' }])
  })
  it('executes the accepted option scope without silently pinning it to today or including another option', async () => {
    const result = await send('按方案1执行', { reply: '收到', actions: [{ type: 'clear_places', days: [1,2,3,4,5,6], placeTypes: ['cafe','restaurant','attraction'] }] }, [{ role: 'assistant', content: '方案1：清空第1–6天，保留酒店及交通。方案2：只清空第7天。' }])
    expect(result.actions).toEqual([{ type: 'clear_places', days: [1,2,3,4,5,6], placeTypes: ['cafe','restaurant','attraction'] }])
  })
  it('preserves the selected option when the preceding proposal uses a plain numbered list', async () => {
    const result = await send('按方案2执行', { reply: '收到', actions: [{ type: 'clear_places', days: [7], placeTypes: ['cafe'] }] }, [{ role: 'assistant', content: '1. 清空第1–6天活动。2. 只清空第7天咖啡馆。' }])
    expect(result.actions).toEqual([{ type: 'clear_places', days: [7], placeTypes: ['cafe'] }])
  })
  it('rejects invalid targets and protected bulk categories instead of broadening deletion', async () => {
    const result = await send('删除第1–6天活动', { reply: '无法执行', actions: [{ type: 'clear_places', days: [99], placeTypes: ['cafe'] }, { type: 'clear_places', placeTypes: ['hotel'] }, { type: 'remove_place', day: 99, placeName: 'A' }, { type: 'unknown' }, { type: 'clear_places', days: [1] }] })
    expect(result).toMatchObject({ actions: [], rejectedActions: 5 })
  })
  it('replans once when a mutation reply falsely claims completion, withholding it from the UI', async () => {
    const onReplyDelta = vi.fn()
    vi.mocked(openaiChatStream).mockImplementationOnce(async (_messages, options) => { options?.onDelta?.('{"reply":"已经全部清空了"}', '{"reply":"已经全部清空了"}'); return '{"reply":"已经全部清空了","actions":[]}' })
    vi.mocked(openaiChat).mockResolvedValueOnce('{"reply":"执行清理","actions":[{"type":"clear_places","days":[1,2],"placeTypes":["cafe"]}]}')
    const result = await sendTripChatMessageStream({ ctx, userMessage: '清空第1–2天咖啡馆', history: [], webSearch: false, onReplyDelta })
    expect(result.actions).toHaveLength(1)
    expect(openaiChat).toHaveBeenCalledTimes(1)
    expect(onReplyDelta).not.toHaveBeenCalled()
  })
  it('does not retry indefinitely or leak success when replanning fails', async () => {
    vi.mocked(openaiChat).mockRejectedValueOnce(new Error('offline'))
    const result = await send('清空第1–6天', { reply: '删除了，清理后只剩酒店', actions: [] })
    expect(result.actions).toEqual([])
    expect(openaiChat).toHaveBeenCalledTimes(1)
  })
  it('recognizes deletion claims in Chinese and English', () => {
    for (const text of ['已经清空', '都删掉了', '清理后只剩酒店', 'Deleted all cafes.', '已更新行程']) expect(replyClaimsItineraryApplied(text)).toBe(true)
  })
})
