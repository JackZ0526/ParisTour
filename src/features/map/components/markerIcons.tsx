import { House as LucideHouse, Plane as LucidePlane } from 'lucide-react'

export function HouseIcon({ size = 14 }: { size?: number }) {
  return <LucideHouse size={size} strokeWidth={2} aria-hidden />
}

export function PlaneIcon({ size = 14 }: { size?: number }) {
  return <LucidePlane size={size} strokeWidth={2} aria-hidden />
}
