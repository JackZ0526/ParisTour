import { beforeEach, describe, expect, it } from 'vitest'
import { setLlmArtifact, resetLlmArtifactStoreForTests } from '../shared/services/llm/llmArtifactStore'
import {
  peekCachedPlaceWebsitePhotos,
  resetPlaceWebsitePhotosForTests,
  websiteCacheKeys,
} from '../features/place/services/placeWebsitePhotos'

describe('place website photo cache', () => {
  beforeEach(() => {
    resetLlmArtifactStoreForTests()
    resetPlaceWebsitePhotosForTests()
  })

  it('treats www and trailing-slash website URLs as the same cache', () => {
    setLlmArtifact(
      websiteCacheKeys('https://www.rest-maxan.com/')[0],
      { photos: ['https://cdn.example/maxan.jpg'] },
      { silent: true },
    )

    expect(
      peekCachedPlaceWebsitePhotos({ website: 'https://rest-maxan.com' }).photos,
    ).toEqual(['https://cdn.example/maxan.jpg'])
  })

  it('finds official-site photos from a cached official URL even when Google has none', () => {
    setLlmArtifact(
      'place-official-website:v1:Parallel Coffee|平行咖啡|',
      { website: 'https://parallelcoffee.fr/' },
      { silent: true },
    )
    setLlmArtifact(
      websiteCacheKeys('https://parallelcoffee.fr/')[0],
      { photos: ['https://cdn.example/parallel.jpg'] },
      { silent: true },
    )

    expect(
      peekCachedPlaceWebsitePhotos({
        name: 'Parallel Coffee',
        nameLocal: '平行咖啡',
      }).photos,
    ).toEqual(['https://cdn.example/parallel.jpg'])
  })
})
