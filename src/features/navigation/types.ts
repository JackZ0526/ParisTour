export type AppTab = 'itinerary' | 'logistics' | 'assistant'

export interface NavTabItem {
  id: AppTab
  label: string
  iconName: 'calendar' | 'luggage' | 'sparkles'
  badge?: string | number
}
