import { useCallback, useEffect, useRef, useState, type SetStateAction } from 'react'
import { registerBeforeAppUpdate } from '../../../shared/services/appUpdate'
import { ChatSessionConflict, emptyChatSession, readChatSession, writeChatSession, type ChatSession } from '../services/chatSessionStore'

const documentWriter = crypto.randomUUID()
type Recovery = { revision: number; sequence: number; writer: string; value: ChatSession; partial?: boolean }

/** Local-device history and drafts; parent keys this hook by account and trip. */
export function useChatSession(key: string) {
  const recoveryKey = `paris-tour-chat-recovery:${key}`
  const [session, setSession] = useState<ChatSession>(emptyChatSession)
  const [ready, setReady] = useState(false)
  const [storageFailed, setStorageFailed] = useState(false)
  const [storageConflict, setStorageConflict] = useState(false)
  const latest = useRef({ key, value: session })
  const revision = useRef(0)
  const dirty = useRef(0)
  const saved = useRef(0)
  const queue = useRef(Promise.resolve())
  const blocked = useRef(false)
  latest.current = { key, value: session }

  useEffect(() => {
    let active = true
    setReady(false)
    readChatSession(key).then(({ revision: version, writer, sequence, ...value }) => {
      if (!active) return
      revision.current = version
      dirty.current = saved.current = 0
      blocked.current = false
      try {
        const raw = sessionStorage.getItem(recoveryKey)
        if (raw) {
          const recovery = JSON.parse(raw) as Recovery
          if (recovery.revision === version || (recovery.writer === writer && recovery.sequence > (sequence ?? 0))) {
            value = { ...value, ...recovery.value }
            dirty.current = 1
            if (recovery.partial) setStorageFailed(true)
          } else if (recovery.writer !== writer) {
            // Keep this tab's unsaved text available to copy; never overwrite the other tab.
            value = { ...value, ...recovery.value }
            blocked.current = true
            setStorageConflict(true)
            sessionStorage.removeItem(recoveryKey)
          } else sessionStorage.removeItem(recoveryKey)
        }
      } catch { /* A recovery journal is optional when browser storage is restricted. */ }
      setSession(value)
    }).catch(() => { if (active) setStorageFailed(true) })
      .finally(() => { if (active) setReady(true) })
    return () => { active = false }
  }, [key, recoveryKey])

  const update = useCallback(<K extends keyof ChatSession>(field: K, action: SetStateAction<ChatSession[K]>) => {
    dirty.current++
    setSession(previous => ({ ...previous, [field]: typeof action === 'function'
      ? (action as (value: ChatSession[K]) => ChatSession[K])(previous[field]) : action }))
  }, [])
  const setHistory = useCallback((value: SetStateAction<ChatSession['history']>) => update('history', value), [update])
  const setInput = useCallback((value: SetStateAction<string>) => update('input', value), [update])
  const setAskQuote = useCallback((value: SetStateAction<ChatSession['quote']>) => update('quote', value), [update])
  const setAttachedImages = useCallback((value: SetStateAction<string[]>) => update('images', value), [update])

  const save = useCallback((): Promise<void> => {
    if (!ready || latest.current.key !== key) return Promise.resolve()
    const sequence = dirty.current
    const snapshot = latest.current.value
    const work = queue.current.then(async () => {
      if (sequence <= saved.current) return
      if (blocked.current) throw new ChatSessionConflict('Another tab updated this chat')
      try {
        revision.current = await writeChatSession(key, snapshot, revision.current, { writer: documentWriter, sequence })
        saved.current = sequence
        if (dirty.current === sequence) {
          try { sessionStorage.removeItem(recoveryKey) } catch { /* storage disabled */ }
        }
        setStorageFailed(false)
      } catch (error) {
        if (error instanceof ChatSessionConflict) {
          blocked.current = true
          setStorageConflict(true)
          try { sessionStorage.removeItem(recoveryKey) } catch { /* storage disabled */ }
        }
        else setStorageFailed(true)
        throw error
      }
    })
    queue.current = work.catch(() => {})
    return work
  }, [key, ready, recoveryKey])
  useEffect(() => {
    const timer = setTimeout(() => {
      void save().catch(() => {})
    }, 500)
    return () => clearTimeout(timer)
  }, [save, session])
  useEffect(() => {
    const flush = () => {
      if (ready && !blocked.current && latest.current.key === key && dirty.current > saved.current) {
        const recovery: Recovery = { revision: revision.current, sequence: dirty.current, writer: documentWriter, value: latest.current.value }
        // A synchronous, per-tab journal survives unload before IndexedDB commits.
        // Large images may exceed sessionStorage; preserve text/quote and report that limitation.
        try { sessionStorage.setItem(recoveryKey, JSON.stringify(recovery)) }
        catch {
          try { sessionStorage.setItem(recoveryKey, JSON.stringify({ ...recovery,
            value: { input: recovery.value.input, quote: recovery.value.quote }, partial: true })) }
          catch { /* The UI already reports unavailable durable storage. */ }
        }
      }
      void save().catch(() => {})
    }
    const onHidden = () => { if (document.visibilityState === 'hidden') flush() }
    document.addEventListener('visibilitychange', onHidden)
    window.addEventListener('pagehide', flush)
    const unregister = registerBeforeAppUpdate(save)
    return () => {
      document.removeEventListener('visibilitychange', onHidden)
      window.removeEventListener('pagehide', flush)
      unregister()
      flush()
    }
  }, [save, ready, key, recoveryKey])
  return { history: session.history, input: session.input, askQuote: session.quote, attachedImages: session.images,
    setHistory, setInput, setAskQuote, setAttachedImages, ready, storageFailed, storageConflict }
}
