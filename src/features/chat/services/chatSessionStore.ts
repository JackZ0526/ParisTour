import type { TripChatTurn } from './tripChat'
export type ChatQuote = { text: string; context: string } | null
export type ChatSession = { history: TripChatTurn[]; input: string; quote: ChatQuote; images: string[] }
export type StoredChatSession = ChatSession & { revision: number; writer?: string; sequence?: number }
export const emptyChatSession = (): ChatSession => ({ history: [], input: '', quote: null, images: [] })
export class ChatSessionConflict extends Error {}
let database: Promise<IDBDatabase> | undefined
function openDatabase(): Promise<IDBDatabase> {
  return database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('paris-tour-chat', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('sessions')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => { database = undefined; reject(request.error) }
  })
}
export async function readChatSession(key: string): Promise<StoredChatSession> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const request = db.transaction('sessions').objectStore('sessions').get(key)
    request.onsuccess = () => resolve({ ...emptyChatSession(), ...request.result, revision: request.result?.revision ?? 0 })
    request.onerror = () => reject(request.error)
  })
}
/** Compare and write in one transaction, so a stale tab cannot overwrite a newer revision. */
export async function writeChatSession(key: string, value: ChatSession, revision: number, stamp?: { writer: string; sequence: number }): Promise<number> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sessions', 'readwrite')
    const store = tx.objectStore('sessions')
    const read = store.get(key)
    let conflict = false
    read.onsuccess = () => {
      if ((read.result?.revision ?? 0) !== revision) {
        conflict = true
        tx.abort()
      } else store.put({ ...value, history: value.history.slice(-100), revision: revision + 1, ...stamp }, key)
    }
    tx.oncomplete = () => resolve(revision + 1)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(conflict ? new ChatSessionConflict('Another tab updated this chat') : tx.error)
  })
}
