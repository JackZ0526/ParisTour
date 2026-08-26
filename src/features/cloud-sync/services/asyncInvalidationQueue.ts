/**
 * Coalesces bursty invalidations into serialized reconciliation passes.
 * If another invalidation arrives while a pass is running, exactly one trailing
 * pass is guaranteed. Nothing is cancelled, so a successful pass can always
 * notify the UI that persisted state changed.
 */
export function createAsyncInvalidationQueue(options: {
  reconcile: () => Promise<boolean>
  onApplied: () => void
  onError?: (error: unknown) => void
}) {
  let disposed = false
  let running = false
  let requested = false

  const request = () => {
    if (disposed) return
    requested = true
    if (running) return
    running = true

    void (async () => {
      try {
        while (!disposed && requested) {
          requested = false
          const applied = await options.reconcile()
          if (!disposed && applied) options.onApplied()
        }
      } catch (error) {
        options.onError?.(error)
      } finally {
        running = false
        if (!disposed && requested) request()
      }
    })()
  }

  return {
    request,
    dispose() {
      disposed = true
      requested = false
    },
  }
}
