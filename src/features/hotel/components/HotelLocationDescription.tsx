import { HotelTranslatedText } from './hotelTranslation'

export function HotelLocationDescription({ text }: { text: string }) {
  return (
    <HotelTranslatedText
      text={text}
      loadingLabel="正在翻译酒店简介…"
    />
  )
}
