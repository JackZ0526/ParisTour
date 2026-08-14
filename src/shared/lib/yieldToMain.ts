/** Yield so paint / CSS animations can run before a heavy JSON or localStorage job. */
export function yieldToMain(timeoutMs = 80): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (document.visibilityState === 'hidden') return Promise.resolve()
  return new Promise((resolve) => {
    const ric = window.requestIdleCallback
    if (typeof ric === 'function') {
      ric(() => resolve(), { timeout: timeoutMs })
      return
    }
    setTimeout(resolve, 0)
  })
}
