const CHANNEL_NAME = 'paris-tour-sync-v2-outbox'

type OutboxMessage = { type: 'outbox'; tripId: string }

let sharedChannel: BroadcastChannel | null = null

function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null
  if (!sharedChannel) sharedChannel = new BroadcastChannel(CHANNEL_NAME)
  return sharedChannel
}

export function notifyOutboxChanged(tripId: string): void {
  try {
    getChannel()?.postMessage({ type: 'outbox', tripId } satisfies OutboxMessage)
  } catch {
    /* BroadcastChannel may be unavailable */
  }
}

export function subscribeOutboxBroadcast(
  tripId: string,
  onSignal: () => void,
): () => void {
  const channel = getChannel()
  if (!channel) return () => {}
  const handleMessage = (event: MessageEvent<OutboxMessage>) => {
    if (event.data?.type === 'outbox' && event.data.tripId === tripId) onSignal()
  }
  channel.addEventListener('message', handleMessage as EventListener)
  return () => channel.removeEventListener('message', handleMessage as EventListener)
}

export function requestUploaderLease(
  tripId: string,
  onLeadership: () => void,
): { release: () => void } {
  const abort = new AbortController()
  let released = false
  const lockName = `paris-tour-mutation-uploader:${tripId}`

  const acquire = async () => {
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined
    if (locks?.request) {
      try {
        await locks.request(lockName, { signal: abort.signal }, async () => {
          onLeadership()
          await new Promise<void>((resolve) => {
            abort.signal.addEventListener('abort', () => resolve(), { once: true })
          })
        })
        return
      } catch {
        if (abort.signal.aborted) return
      }
    }
    if (!abort.signal.aborted) onLeadership()
  }

  void acquire()

  return {
    release: () => {
      if (released) return
      released = true
      abort.abort()
    },
  }
}
