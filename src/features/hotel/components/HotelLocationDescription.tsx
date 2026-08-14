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
      loadingLabel="正在翻译酒店简介…"
      className={className}
      layout="hotelLocation"
      showShimmer={showShimmer}
      onPendingChange={onPendingChange}
    />
  )
}
