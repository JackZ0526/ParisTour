import type { DayPlan, Place, SelectedHotel } from '../../../types'
import { translate, type Locale } from '../../../shared/i18n'
import { isHotelSelected } from '../../hotel/constants/hotels'
import { getPlace } from '../../place/constants/places'
import type { TripChatViewingTarget } from './tripChat'

export type TripChatSuggestionTone = 'gold' | 'sage' | 'copper' | 'neutral'

export interface TripChatSuggestion {
  id: string
  label: string
  tone: TripChatSuggestionTone
}

interface BuildTripChatSuggestionsInput {
  hotel: SelectedHotel
  days: DayPlan[]
  currentDay: number
  customPlaces: Record<string, Place>
  viewing?: TripChatViewingTarget | null
  locale: Locale
}

function placesForDay(day: DayPlan | undefined, customPlaces: Record<string, Place>): Place[] {
  if (!day) return []
  return day.stops.flatMap((stop) => {
    try {
      const place = getPlace(stop.placeId, customPlaces)
      return place.type === 'hotel' || place.type === 'transport' ? [] : [place]
    } catch {
      return []
    }
  })
}

export function buildTripChatSuggestions({
  hotel,
  days,
  currentDay,
  customPlaces,
  viewing,
  locale,
}: BuildTripChatSuggestionsInput): TripChatSuggestion[] {
  const day = days.find((item) => item.day === currentDay) || days[currentDay - 1]
  const dayPlaces = placesForDay(day, customPlaces)
  const selectedHotel = isHotelSelected(hotel)
  const viewingPlace = viewing?.type === 'place' ? viewing : null
  const viewingHotel = viewing?.type === 'hotel' ? viewing : null
  const anchor = viewingPlace || dayPlaces[0] || null
  const suggestions: TripChatSuggestion[] = []

  const add = (id: string, label: string, tone: TripChatSuggestionTone) => {
    if (!label.trim() || suggestions.some((item) => item.id === id || item.label === label)) return
    suggestions.push({ id, label, tone })
  }

  if (viewingPlace) {
    add(
      `view-place:${viewingPlace.id}`,
      translate('chat.suggestPlaceNamed', { name: viewingPlace.name }, locale),
      'sage',
    )
  } else if (viewingHotel) {
    add(
      `view-hotel:${viewingHotel.id}`,
      translate('chat.suggestHotelNamed', { name: viewingHotel.name }, locale),
      'gold',
    )
  } else if (selectedHotel) {
    add(
      `hotel:${hotel.id}`,
      translate('chat.suggestHotelNamed', { name: hotel.name }, locale),
      'gold',
    )
  } else {
    add('choose-hotel', translate('chat.suggestChooseHotel', undefined, locale), 'gold')
  }

  if (selectedHotel && (!viewingHotel || viewingHotel.id !== hotel.id)) {
    add(
      `hotel:${hotel.id}`,
      translate('chat.suggestHotelNamed', { name: hotel.name }, locale),
      'gold',
    )
  }

  if (anchor) {
    add(
      `place:${anchor.id}`,
      translate('chat.suggestPlaceNamed', { name: anchor.name }, locale),
      'sage',
    )
    add(
      `after:${anchor.id}`,
      translate('chat.suggestAfterPlace', { name: anchor.name }, locale),
      'sage',
    )

    const types = new Set(dayPlaces.map((place) => place.type))
    if (!types.has('restaurant')) {
      add('add-restaurant', translate('chat.suggestAddRestaurant', undefined, locale), 'copper')
    } else if (!types.has('cafe')) {
      add('add-cafe', translate('chat.suggestAddCafe', undefined, locale), 'copper')
    } else if (!types.has('attraction')) {
      add('add-attraction', translate('chat.suggestAddAttraction', undefined, locale), 'copper')
    } else {
      add('add-place', translate('chat.suggestAddAnotherPlace', undefined, locale), 'copper')
    }

    if (dayPlaces.length >= 5) {
      const removable = dayPlaces.at(-1)
      if (removable) {
        add(
          `remove:${removable.id}`,
          translate('chat.suggestRemovePlace', { name: removable.name }, locale),
          'neutral',
        )
      }
    } else {
      add('optimize-day', translate('chat.suggestOptimizeDay', undefined, locale), 'neutral')
    }
  } else {
    if (selectedHotel) {
      add(
        `hotel-alternatives:${hotel.id}`,
        translate('chat.suggestHotelAlternativesNamed', { name: hotel.name }, locale),
        'gold',
      )
    }
    add('plan-day', translate('chat.suggestPlanDay', undefined, locale), 'sage')
    add('add-attraction', translate('chat.suggestAddAttraction', undefined, locale), 'sage')
    add('add-cafe', translate('chat.suggestAddCafe', undefined, locale), 'copper')
    add('add-restaurant', translate('chat.suggestAddRestaurant', undefined, locale), 'copper')
  }

  return suggestions.slice(0, 5)
}
