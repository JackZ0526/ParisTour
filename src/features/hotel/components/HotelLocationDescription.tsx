import { HotelTranslatedText } from './hotelTranslation'

export function HotelLocationDescription({
  text,
  className,
}: {
  text: string
  className?: string
}) {
  return (
    <HotelTranslatedText
      text={text}
      loadingLabel="正在翻译酒店简介…"
      className={className}
      layout="hotelLocation"
    />
  )
}
