import { poolCopy } from '../i18n/copy/asyncPool'
/** Workers publish each result immediately, instead of waiting for a whole batch. */
export async function runPool<T, R>(items: readonly T[], concurrency: number, work: (item: T) => Promise<R>, publish: (result: R, item: T) => void | Promise<void> = () => {}) {
  const results: R[] = new Array(items.length)
  let next = 0
  let failed = false
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, async () => {
    while (!failed && next < items.length) {
      const index = next++
      const item = items[index]
      try {
        const result = await work(item)
        results[index] = result
        if (!failed) await publish(result, item)
      } catch (error) {
        failed = true
        throw error
      }
    }
  }))
  return results
}

/** Serialize only publication; overlapping plans are regenerated against the latest published state. */
export async function runConflictSafePool<T, R>(items: readonly T[], concurrency: number, work: (item: T) => Promise<R>, conflicts: (result: R, item: T) => boolean, publish: (result: R, item: T) => void) {
  let publication = Promise.resolve()
  await runPool(items, concurrency, work, async (initial, item) => {
    publication = publication.then(async () => {
      let result = initial
      for (let retry = 0; conflicts(result, item); retry++) {
        if (retry >= 2) throw new Error(poolCopy('conflict'))
        result = await work(item)
      }
      publish(result, item)
    })
    await publication
  })
}
