import { uiCopy } from '../../../shared/i18n/copy/ui'
import { HotelTranslatedText } from './hotelTranslation'

export function HotelLocationDescription({
  text,
  className,
  showShimmer = true,
  onPendingChange,
}: {
  text: string
  className?: string
  showShimmer?: boolean
  onPendingChange?: (pending: boolean) => void
}) {
  return (
    <HotelTranslatedText
      text={text}
      loadingLabel={uiCopy('mcb89c595cb', undefined)}
      className={className}
      layout="hotelLocation"
      showShimmer={showShimmer}
      onPendingChange={onPendingChange}
    />
  )
}
