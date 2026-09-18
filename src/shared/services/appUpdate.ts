let update: (() => Promise<void>) | null = null
const listeners = new Set<() => void>()
const beforeUpdate = new Set<() => Promise<void>>()
export function registerBeforeAppUpdate(save: () => Promise<void>) {
  beforeUpdate.add(save)
  return () => { beforeUpdate.delete(save) }
}
export function offerAppUpdate(callback: () => Promise<void>) {
  update = async () => {
    // Await actual IndexedDB commits before activating a worker that reloads the page.
    await Promise.all([...beforeUpdate].map(save => save()))
    await callback()
  }
  listeners.forEach((listener) => listener())
}
export const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
export const getAppUpdate = () => update
