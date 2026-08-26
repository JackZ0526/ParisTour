import { describe, expect, it, vi } from 'vitest'
import { createAsyncInvalidationQueue } from '../features/cloud-sync/services/asyncInvalidationQueue'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('createAsyncInvalidationQueue', () => {
  it('never loses an applied notification when another event arrives mid-pull', async () => {
    const first = deferred<boolean>()
    const second = deferred<boolean>()
    const reconcile = vi
      .fn<() => Promise<boolean>>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const onApplied = vi.fn()
    const queue = createAsyncInvalidationQueue({ reconcile, onApplied })

    queue.request()
    queue.request()
    expect(reconcile).toHaveBeenCalledTimes(1)

    first.resolve(true)
    await Promise.resolve()
    await Promise.resolve()

    expect(onApplied).toHaveBeenCalledTimes(1)
    expect(reconcile).toHaveBeenCalledTimes(2)

    second.resolve(false)
    await Promise.resolve()
    await Promise.resolve()
    expect(onApplied).toHaveBeenCalledTimes(1)
  })

  it('does not notify after disposal', async () => {
    const pending = deferred<boolean>()
    const onApplied = vi.fn()
    const queue = createAsyncInvalidationQueue({
      reconcile: () => pending.promise,
      onApplied,
    })

    queue.request()
    queue.dispose()
    pending.resolve(true)
    await Promise.resolve()
    await Promise.resolve()

    expect(onApplied).not.toHaveBeenCalled()
  })
})
