import { createContext, type KeyboardEvent, type PointerEvent } from 'react'

export const DayReorderContext = createContext<{
  disabled: boolean
  dragging: number | null
  over: number | null
  describedBy: string
  start: (event: PointerEvent<HTMLButtonElement>, day: number) => void
  keyDown: (event: KeyboardEvent<HTMLButtonElement>, day: number) => void
} | null>(null)
