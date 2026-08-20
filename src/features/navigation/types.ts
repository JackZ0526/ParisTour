export type AppTab = 'itinerary' | 'logistics' | 'profile'

export interface NavTabItem {
  id: AppTab
  label: string
  iconName: 'calendar' | 'luggage' | 'user'
  badge?: string | number
}
