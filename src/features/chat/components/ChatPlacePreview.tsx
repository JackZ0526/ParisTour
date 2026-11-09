import { useEffect, useState } from 'react'
import type { Coordinates, Place } from '../../../types'
import { fetchGooglePlaceDetails, type GooglePlaceDetails } from '../../map/services/googlePlaceDetails'
import { GooglePlacePage } from '../../place/components/GooglePlacePage'
import { chatPlaceLocalName, type ChatPlaceReference } from '../services/chatPlaceReferences'
import { chatPlacesCopy } from '../../../shared/i18n/copy/chatPlaces'
import { useTranslation } from '../../../shared/i18n'

export function ChatPlacePreview({ reference, knownPlace, destination, searchLocation, onClose }: {
  reference: ChatPlaceReference
  knownPlace?: Place
  destination: string
  searchLocation?: Coordinates
  onClose: () => void
}) {
  const { locale } = useTranslation()
  const [details, setDetails] = useState<GooglePlaceDetails | null>(null)
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>(knownPlace ? 'ready' : 'loading')
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    if (knownPlace) return
    let cancelled = false
    setPhase('loading')
    const query = [reference.name, reference.address, destination].filter(Boolean).join(' ')
    void fetchGooglePlaceDetails(query, searchLocation, { recoverPhotos: false })
      .then(result => {
        if (cancelled) return
        setDetails(result)
        setPhase(result ? 'ready' : 'error')
      })
      .catch(() => { if (!cancelled) setPhase('error') })
    return () => { cancelled = true }
  }, [reference.name, reference.address, destination, searchLocation, knownPlace, retry])

  return <GooglePlacePage
    open
    name={details?.name || knownPlace?.name || reference.name}
    nameLocal={knownPlace?.nameLocal || chatPlaceLocalName(reference)}
    placeType={knownPlace?.type || reference.type || 'attraction'}
    googlePlaceId={details?.id || knownPlace?.googlePlaceId}
    tripadvisorContentId={knownPlace?.tripadvisorContentId}
    googleAddress={details?.address || knownPlace?.googleAddress || reference.address}
    googleRating={details?.rating ?? knownPlace?.googleRating}
    googleRatingCount={details?.userRatingCount ?? knownPlace?.googleUserRatingCount}
    googleRatingHint={knownPlace?.ratingHint}
    location={details?.location || knownPlace?.location}
    fallbackImage={knownPlace?.image}
    detailsOverride={details}
    skipProviderLookup={!knownPlace && phase !== 'ready'}
    showMap={false}
    overlayZIndex={2500}
    providerDetails={phase !== 'ready' ? <div role="status" className="rounded-xl bg-[var(--mist)]/50 px-3 py-2 text-sm text-[var(--stone)]">
      {chatPlacesCopy(phase === 'loading' ? 'loading' : 'unavailable', undefined, locale)}
      {phase === 'error' && <button type="button" className="ml-2 underline underline-offset-2" onClick={() => setRetry(n => n + 1)}>{chatPlacesCopy('retry', undefined, locale)}</button>}
    </div> : undefined}
    onClose={onClose}
  />
}
