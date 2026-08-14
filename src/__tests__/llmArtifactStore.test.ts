import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ackArtifactCloudDiff,
  clearLlmArtifacts,
  flushLlmArtifactsToStorage,
  getLlmArtifact,
  hasArtifactCloudDiff,
  peekArtifactCloudDiff,
  removeLlmArtifact,
  resetLlmArtifactStoreForTests,
  saveLlmArtifacts,
  setLlmArtifact,
} from '../shared/services/llm/llmArtifactStore'

const STORAGE_KEY = 'paris-tour-llm-artifacts-v1'

function stubLocalStorage() {
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) || null,
    setItem: (key: string, value: string) => {
      storage.set(key, value)
    },
    removeItem: (key: string) => {
      storage.delete(key)
    },
    clear: () => storage.clear(),
  })
}

describe('llmArtifactStore', () => {
  beforeEach(() => {
    stubLocalStorage()
    resetLlmArtifactStoreForTests()
  })

  it('reads a write from memory before localStorage is flushed', () => {
    setLlmArtifact('k', { hello: 'world' })
    expect(getLlmArtifact<{ hello: string }>('k')).toEqual({ hello: 'world' })
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('flushes the in-memory map to localStorage on demand', () => {
    setLlmArtifact('k', { hello: 'world' })
    flushLlmArtifactsToStorage()
    const raw = localStorage.getItem(STORAGE_KEY)
    expect(raw).toBeTruthy()
    expect(JSON.parse(raw || '')).toMatchObject({
      k: { value: { hello: 'world' } },
    })
  })

  it('tracks upserts and deletes for cloud patches', () => {
    setLlmArtifact('keep', { n: 1 })
    setLlmArtifact('gone', { n: 2 })
    expect(hasArtifactCloudDiff()).toBe(true)
    expect(Object.keys(peekArtifactCloudDiff().upserts).sort()).toEqual(['gone', 'keep'])

    removeLlmArtifact('gone')
    const diff = peekArtifactCloudDiff()
    expect(Object.keys(diff.upserts)).toEqual(['keep'])
    expect(diff.deletes).toEqual(['gone'])
  })

  it('does not treat a cloud hydrate as a local edit', () => {
    setLlmArtifact('local', { n: 1 })
    saveLlmArtifacts({
      fromCloud: { value: { n: 2 }, generatedAt: 1 },
    })
    expect(hasArtifactCloudDiff()).toBe(false)
    expect(getLlmArtifact<{ n: number }>('fromCloud')).toEqual({ n: 2 })
    expect(getLlmArtifact('local')).toBeUndefined()
  })

  it('keeps a key pending when it changes after the patch was sent', () => {
    setLlmArtifact('k', { n: 1 })
    const sent = peekArtifactCloudDiff()
    setLlmArtifact('k', { n: 2 })
    ackArtifactCloudDiff(sent)
    expect(hasArtifactCloudDiff()).toBe(true)
    expect(peekArtifactCloudDiff().upserts.k?.value).toEqual({ n: 2 })
  })

  it('records a full clear as deletes', () => {
    setLlmArtifact('a', { n: 1 })
    setLlmArtifact('b', { n: 2 })
    saveLlmArtifacts({
      a: { value: { n: 1 }, generatedAt: 1 },
      b: { value: { n: 2 }, generatedAt: 1 },
    })
    clearLlmArtifacts()
    const diff = peekArtifactCloudDiff()
    expect(diff.deletes.sort()).toEqual(['a', 'b'])
    expect(diff.upserts).toEqual({})
  })
})
