import { useCallback, useRef, useState } from 'react'

type LiquidPillInteraction<T> = {
  target: T
  token: number
}

/**
 * Creates one-shot, target-bound activation tokens for a liquid pill.
 * Passive selection or layout changes receive token 0 and cannot start physics.
 */
export function useLiquidPillInteraction<T>() {
  const sequenceRef = useRef(0)
  const [interaction, setInteraction] = useState<LiquidPillInteraction<T> | null>(null)

  const activate = useCallback((target: T) => {
    sequenceRef.current += 1
    setInteraction({ target, token: sequenceRef.current })
  }, [])

  const tokenFor = useCallback(
    (target: T) =>
      interaction && Object.is(interaction.target, target) ? interaction.token : 0,
    [interaction],
  )

  const onInteractionSettled = useCallback((token: number) => {
    setInteraction((current) => (current?.token === token ? null : current))
  }, [])

  const clear = useCallback(() => {
    setInteraction(null)
  }, [])

  return { activate, tokenFor, onInteractionSettled, clear }
}
