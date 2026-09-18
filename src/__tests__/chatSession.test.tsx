import 'fake-indexeddb/auto'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useChatSession } from '../features/chat/hooks/useChatSession'

type Handle = { current?: ReturnType<typeof useChatSession> }
let renderers: ReactTestRenderer[] = []
let keyNumber = 0
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const store = new Map<string, string>()
  vi.stubGlobal('sessionStorage', { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => store.set(key, value), removeItem: (key: string) => store.delete(key) })
  vi.stubGlobal('window', new EventTarget())
  vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }))
})
afterEach(async () => {
  await act(async () => { renderers.forEach(r => r.unmount()) })
  renderers = []
  vi.unstubAllGlobals()
})
function Harness({ sessionKey, handle }: { sessionKey: string; handle: Handle }) {
  handle.current = useChatSession(sessionKey)
  return null
}
async function mount(sessionKey: string) {
  const handle: Handle = {}
  let renderer!: ReactTestRenderer
  await act(async () => { renderer = create(<Harness sessionKey={sessionKey} handle={handle} />) })
  renderers.push(renderer)
  for (let n = 0; n < 30 && !handle.current?.ready; n++) {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)) })
  }
  expect(handle.current?.ready).toBe(true)
  return { handle, renderer }
}
async function flush() { await act(async () => { window.dispatchEvent(new Event('pagehide')); await new Promise(r => setTimeout(r, 20)) }) }
it('does not let closing an untouched stale tab overwrite a newer draft', async () => {
  const key = `idle-tab-${++keyNumber}`
  const first = await mount(key)
  const stale = await mount(key)
  await act(async () => { first.handle.current!.setInput('new draft') })
  await flush()
  await act(async () => { stale.renderer.unmount(); await new Promise(r => setTimeout(r, 20)) })
  const reopened = await mount(key)
  expect(reopened.handle.current!.input).toBe('new draft')
})
it('isolates accounts/trips and restores text, quote, image and history', async () => {
  const key = `session-${++keyNumber}`
  const first = await mount(key)
  await act(async () => {
    first.handle.current!.setInput('question')
    first.handle.current!.setAskQuote({ text: 'quote', context: 'source' })
    first.handle.current!.setAttachedImages(['data:image/png;base64,test'])
    first.handle.current!.setHistory([{ role: 'user', content: 'previous' }])
  })
  await flush()
  const other = await mount(key + '-other-trip')
  expect(other.handle.current!.history).toEqual([])
  expect(other.handle.current!.input).toBe('')
  const reopened = await mount(key)
  expect(reopened.handle.current).toMatchObject({ input: 'question', askQuote: { text: 'quote', context: 'source' }, attachedImages: ['data:image/png;base64,test'], history: [{ role: 'user', content: 'previous' }] })
})
it('rejects an edited stale tab without overwriting the saved session', async () => {
  const key = `conflict-${++keyNumber}`
  const first = await mount(key)
  const stale = await mount(key)
  await act(async () => { first.handle.current!.setInput('winner') })
  await flush()
  await act(async () => { stale.handle.current!.setInput('keep me locally') })
  await flush()
  expect(stale.handle.current!.storageConflict).toBe(true)
  expect(stale.handle.current!.input).toBe('keep me locally')
  const reopened = await mount(key)
  expect(reopened.handle.current!.input).toBe('winner')
})
it('awaits the newest draft before invoking an application update', async () => {
  const { offerAppUpdate, getAppUpdate } = await import('../shared/services/appUpdate')
  const { readChatSession } = await import('../features/chat/services/chatSessionStore')
  const key = `update-${++keyNumber}`
  const first = await mount(key)
  await act(async () => { first.handle.current!.setInput('typed just before update') })
  const activate = vi.fn(async () => {
    expect((await readChatSession(key)).input).toBe('typed just before update')
  })
  offerAppUpdate(activate)
  await act(async () => { await getAppUpdate()!() })
  expect(activate).toHaveBeenCalledTimes(1)
})
it('does not activate an update if another tab prevents saving the draft', async () => {
  const { offerAppUpdate, getAppUpdate } = await import('../shared/services/appUpdate')
  const key = `update-conflict-${++keyNumber}`
  const first = await mount(key)
  const stale = await mount(key)
  await act(async () => { first.handle.current!.setInput('winner') })
  await flush()
  await act(async () => { stale.handle.current!.setInput('unsaved draft') })
  const activate = vi.fn(async () => {})
  offerAppUpdate(activate)
  await act(async () => { await expect(getAppUpdate()!()).rejects.toThrow('Another tab') })
  expect(activate).not.toHaveBeenCalled()
})
it('recovers a synchronous unload journal when the last IndexedDB write never committed', async () => {
  const key = `unload-${++keyNumber}`
  sessionStorage.setItem(`paris-tour-chat-recovery:${key}`, JSON.stringify({ revision: 0, sequence: 2, writer: 'previous-document', value: {
    history: [], input: 'last keystroke', quote: { text: 'excerpt', context: 'source' }, images: [],
  } }))
  const reopened = await mount(key)
  expect(reopened.handle.current!.input).toBe('last keystroke')
  expect(reopened.handle.current!.askQuote?.text).toBe('excerpt')
})
it('recovers a newer journal after an older write from the same document committed during unload', async () => {
  const { writeChatSession, emptyChatSession } = await import('../features/chat/services/chatSessionStore')
  const key = `inflight-${++keyNumber}`
  await writeChatSession(key, { ...emptyChatSession(), input: 'older' }, 0, { writer: 'old-document', sequence: 1 })
  sessionStorage.setItem(`paris-tour-chat-recovery:${key}`, JSON.stringify({ revision: 0, sequence: 2, writer: 'old-document', value: { ...emptyChatSession(), input: 'newest' } }))
  expect((await mount(key)).handle.current!.input).toBe('newest')
})
it('allows refresh to resolve a recovery journal conflict after the user copies their draft', async () => {
  const { writeChatSession, emptyChatSession } = await import('../features/chat/services/chatSessionStore')
  const key = `resolve-conflict-${++keyNumber}`
  await writeChatSession(key, { ...emptyChatSession(), input: 'other tab saved' }, 0, { writer: 'other-document', sequence: 1 })
  sessionStorage.setItem(`paris-tour-chat-recovery:${key}`, JSON.stringify({ revision: 0, sequence: 2, writer: 'previous-document', value: { ...emptyChatSession(), input: 'copy this unsaved draft' } }))
  const first = await mount(key)
  expect(first.handle.current).toMatchObject({ storageConflict: true, input: 'copy this unsaved draft' })
  await act(async () => { first.renderer.unmount() })
  const reopened = await mount(key)
  expect(reopened.handle.current).toMatchObject({ storageConflict: false, input: 'other tab saved' })
})
