import { lazy, Suspense } from 'react'
import type { ComponentProps } from 'react'

const TripChatPanel = lazy(() =>
  import('./TripChatPanel').then((m) => ({ default: m.TripChatPanel })),
)

export type TripChatPanelProps = ComponentProps<typeof TripChatPanel>

/**
 * Defers loading the heavy chat/LLM bundle until first render. The static
 * module is ~80kb gzipped and would otherwise ship in the initial chunk
 * even when the user never opens the chat.
 */
export function TripChatPanelLazy(props: TripChatPanelProps) {
  return (
    <Suspense fallback={null}>
      <TripChatPanel {...props} />
    </Suspense>
  )
}