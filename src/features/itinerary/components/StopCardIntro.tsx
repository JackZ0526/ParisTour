import type { Place } from '../../../types'
import { useTranslation } from '../../../shared/i18n'
import { peekPlaceDetailCopy, placeDetailKeysFromPlace } from '../../place/services/placeDetailMemo'
import { stopCardIntro } from '../utils/stopCardIntro'

/** Every timeline state shares the same content contract and three-line limit. */
export function StopCardIntro({ note, place }: { note?: string; place: Place }) {
  const { locale } = useTranslation()
  const cached = peekPlaceDetailCopy(...placeDetailKeysFromPlace(place, locale))
  return <p data-stop-intro className="mt-1.5 line-clamp-3 break-words text-sm leading-relaxed text-[var(--stone)]">
    {stopCardIntro(note, place, locale, cached?.intro)}
  </p>
}
