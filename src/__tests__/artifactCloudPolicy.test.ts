import { describe, expect, it } from 'vitest'
import { isCloudSyncedArtifactKey } from '../shared/services/llm/artifactCloudPolicy'

describe('artifactCloudPolicy', () => {
  it('allowlists LLM copy that should roam across devices', () => {
    expect(isCloudSyncedArtifactKey('place-detail:v3:zh-CN:louvre')).toBe(true)
    expect(isCloudSyncedArtifactKey('hotel-detail:v5:zh-CN:booking:1')).toBe(true)
    expect(isCloudSyncedArtifactKey('recommend:v2:zh-CN:day:1')).toBe(true)
    expect(isCloudSyncedArtifactKey('translations:zh')).toBe(true)
    expect(isCloudSyncedArtifactKey('place-names:zh')).toBe(true)
    expect(isCloudSyncedArtifactKey('itinerary:locale-copy:v1:abc:en')).toBe(true)
  })

  it('keeps third-party API caches local', () => {
    expect(isCloudSyncedArtifactKey('rapid-google-place:v4:id:abc')).toBe(false)
    expect(isCloudSyncedArtifactKey('tripadvisor-gallery:v18:x')).toBe(false)
    expect(isCloudSyncedArtifactKey('booking-hotel-photos:v3:1')).toBe(false)
    expect(isCloudSyncedArtifactKey('wikimedia-place-photo:v3:x')).toBe(false)
    expect(isCloudSyncedArtifactKey('place-website-photos:v10:https://x')).toBe(false)
    expect(isCloudSyncedArtifactKey('google-place-photo:abc')).toBe(false)
    expect(isCloudSyncedArtifactKey('destinations:popular')).toBe(false)
  })
})
