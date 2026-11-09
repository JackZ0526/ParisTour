import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ChatPlacePreview } from '../features/chat/components/ChatPlacePreview'
import { fetchGooglePlaceDetails } from '../features/map/services/googlePlaceDetails'
import type { Place } from '../types'

vi.mock('../features/map/services/googlePlaceDetails', () => ({ fetchGooglePlaceDetails: vi.fn() }))
vi.mock('../features/place/components/GooglePlacePage', () => ({
  GooglePlacePage: (props: { name: string; providerDetails: unknown; onClose: () => void }) =>
    createElement('section', { 'data-place': props.name }, props.providerDetails as never, createElement('button', { onClick: props.onClose }, 'close')),
}))
vi.mock('../shared/i18n', () => ({ useTranslation: () => ({ locale: 'en' }) }))
let view: ReactTestRenderer | undefined
beforeEach(() => {
  vi.mocked(fetchGooglePlaceDetails).mockReset()
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})
afterEach(async () => { if (view) await act(async () => view?.unmount()); view = undefined })

it('looks up only the opened venue with its destination and address, then shows the resolved identity', async () => {
  vi.mocked(fetchGooglePlaceDetails).mockResolvedValue({ id: 'verified-id', name: 'Café Verified', query: '', photos: [], reviews: [] })
  await act(async () => { view = create(<ChatPlacePreview reference={{ name: 'Café X', address: '1 Rue A' }} destination="Lyon" onClose={() => {}} />) })
  expect(fetchGooglePlaceDetails).toHaveBeenCalledTimes(1)
  expect(fetchGooglePlaceDetails).toHaveBeenCalledWith('Café X 1 Rue A Lyon', undefined, { recoverPhotos: false })
  expect(view!.root.findByType('section').props['data-place']).toBe('Café Verified')
})

it('reuses a known itinerary place without an extra search or itinerary write', async () => {
  const onClose = vi.fn()
  const known = { id: 'existing', name: 'Boot Café', type: 'cafe', location: { lat: 48, lng: 2 } } as Place
  await act(async () => { view = create(<ChatPlacePreview reference={{ name: 'Boot Café' }} knownPlace={known} destination="Paris" onClose={onClose} />) })
  expect(fetchGooglePlaceDetails).not.toHaveBeenCalled()
  await act(async () => view!.root.findByType('button').props.onClick())
  expect(onClose).toHaveBeenCalledTimes(1)
  expect(known.id).toBe('existing')
})

it('offers retry when the venue cannot be found and recovers without closing the dialog', async () => {
  vi.mocked(fetchGooglePlaceDetails).mockResolvedValueOnce(null)
    .mockResolvedValueOnce({ name: 'Café Found', query: '', photos: [], reviews: [] })
  const onClose = vi.fn()
  await act(async () => { view = create(<ChatPlacePreview reference={{ name: 'Café X' }} destination="Paris" onClose={onClose} />) })
  const retry = view!.root.findAllByType('button').find(button => button.children.includes('Try again'))!
  expect(retry).toBeDefined()
  await act(async () => retry.props.onClick())
  expect(view!.root.findByType('section').props['data-place']).toBe('Café Found')
  expect(onClose).not.toHaveBeenCalled()
})
