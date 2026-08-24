import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ackArtifactCloudDiff,
  clearLlmArtifacts,
  flushLlmArtifactsToStorage,
  getLlmArtifact,
  hasArtifactCloudDiff,
  mergeCloudArtifacts,
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
    setLlmArtifact('place-detail:keep', { n: 1 })
    setLlmArtifact('place-detail:gone', { n: 2 })
    expect(hasArtifactCloudDiff()).toBe(true)
    expect(Object.keys(peekArtifactCloudDiff().upserts).sort()).toEqual([
      'place-detail:gone',
      'place-detail:keep',
    ])

    removeLlmArtifact('place-detail:gone')
    const diff = peekArtifactCloudDiff()
    expect(Object.keys(diff.upserts)).toEqual(['place-detail:keep'])
    expect(diff.deletes).toEqual(['place-detail:gone'])
  })

  it('does not queue third-party API caches for cloud sync', () => {
    setLlmArtifact('rapid-google-place:v4:id:abc', { photos: ['x'] })
    setLlmArtifact('tripadvisor-gallery:v18:1', { urls: ['y'] })
    expect(hasArtifactCloudDiff()).toBe(false)
    expect(getLlmArtifact('rapid-google-place:v4:id:abc')).toEqual({ photos: ['x'] })
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

  it('merges cloud copy without wiping local API caches', () => {
    setLlmArtifact('rapid-google-place:v4:id:abc', { photos: ['x'] })
    mergeCloudArtifacts({
      upserts: {
        'place-detail:v3:zh-CN:louvre': { value: { intro: 'hi' }, generatedAt: 9 },
      },
      silent: true,
    })
    expect(getLlmArtifact('rapid-google-place:v4:id:abc')).toEqual({ photos: ['x'] })
    expect(getLlmArtifact('place-detail:v3:zh-CN:louvre')).toEqual({ intro: 'hi' })
    expect(hasArtifactCloudDiff()).toBe(false)
  })

  it('keeps a key pending when it changes after the patch was sent', () => {
    setLlmArtifact('place-detail:k', { n: 1 })
    const sent = peekArtifactCloudDiff()
    setLlmArtifact('place-detail:k', { n: 2 })
    ackArtifactCloudDiff(sent)
    expect(hasArtifactCloudDiff()).toBe(true)
    expect(peekArtifactCloudDiff().upserts['place-detail:k']?.value).toEqual({ n: 2 })
  })

  it('records a full clear as deletes', () => {
    setLlmArtifact('place-detail:a', { n: 1 })
    setLlmArtifact('place-detail:b', { n: 2 })
    saveLlmArtifacts({
      'place-detail:a': { value: { n: 1 }, generatedAt: 1 },
      'place-detail:b': { value: { n: 2 }, generatedAt: 1 },
    })
    clearLlmArtifacts()
    const diff = peekArtifactCloudDiff()
    expect(diff.deletes.sort()).toEqual(['place-detail:a', 'place-detail:b'])
    expect(diff.upserts).toEqual({})
  })
})
