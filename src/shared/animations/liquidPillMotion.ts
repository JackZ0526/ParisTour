import { useCallback, useEffect, useRef } from 'react'
import {
  useAnimationFrame,
  useMotionValue,
  useSpring,
  useTransform,
} from 'framer-motion'

export type LiquidPillEdge = 'left' | 'right' | null

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

export type LiquidPillChainGeometry = {
  scaleX: number
  strain: number
}

export type LiquidPillChainSettleSample = {
  frameDelta: number
  head: number
  body: number
  tail: number
  bodyVelocity: number
  tailVelocity: number
}

/** Layout movement alone cannot create a new one-shot interaction. */
export function isNewLiquidPillInteractionToken(
  token: number,
  lastSeenToken: number,
): boolean {
  return token > 0 && token !== lastSeenToken
}

/** Whether a one-shot soft-body response has returned to visual rest. */
export function isLiquidPillChainSettled({
  frameDelta,
  head,
  body,
  tail,
  bodyVelocity,
  tailVelocity,
}: LiquidPillChainSettleSample): boolean {
  return (
    Math.abs(frameDelta) < 0.02 &&
    Math.abs(head - body) < 0.08 &&
    Math.abs(body - tail) < 0.08 &&
    Math.abs(bodyVelocity) < 4 &&
    Math.abs(tailVelocity) < 4
  )
}

/**
 * Turn a head/body/tail chain into the pill's horizontal material geometry.
 * Positive strain means the tail is behind and the body stretches; negative
 * strain means the tail has caught the stopped head and compresses the body.
 */
export function resolveLiquidPillChainGeometry(
  head: number,
  body: number,
  tail: number,
  pillWidth: number,
  direction: number,
  strength = 1,
): LiquidPillChainGeometry {
  if (direction === 0) return { scaleX: 1, strain: 0 }

  const trailingPosition = body * 0.35 + tail * 0.65
  const normalizedLag =
    (Math.sign(direction) * (head - trailingPosition)) /
    Math.max(1, pillWidth)
  // The capsule resists tension more than compression: modest travel should
  // elongate visibly without every one-step move reaching the fast-move cap,
  // while an inertial tail can still produce a clear collision squash.
  const materialResponse = normalizedLag >= 0 ? 0.28 : 0.72
  const rawStrain = normalizedLag * materialResponse * strength
  // Soft saturation preserves speed differences throughout the useful range;
  // a hard clamp made medium and fast gestures look mechanically identical.
  const undampedStrain = 0.16 * Math.tanh(rawStrain / 0.16)
  const strain =
    Math.sign(undampedStrain) *
    Math.max(0, Math.abs(undampedStrain) - 0.0015)

  return {
    scaleX: clamp(1 + strain, 0.84, 1.16),
    strain,
  }
}

export function resolveLiquidPillOrigin(
  edge: LiquidPillEdge,
  direction: number,
): number {
  if (edge === 'left') return 0
  if (edge === 'right') return 1
  if (direction > 0) return 1
  if (direction < 0) return 0
  return 0.5
}

type LiquidPillChainOptions = {
  edge: LiquidPillEdge
  interactionToken: number
  onInteractionSettled: (token: number) => void
  reduceMotion: boolean
  strength: number
}

/**
 * Continuous one-dimensional soft-body chain.
 *
 * The visually leading node follows the shared-layout pill every frame. The
 * body follows the head, and the tail follows the body. Movement therefore
 * creates extension immediately; when the head stops, the tail's retained
 * velocity naturally creates compression and recovery without a completion
 * callback or a separately scheduled impact animation.
 */
export function useLiquidPillChain({
  edge,
  interactionToken,
  onInteractionSettled,
  reduceMotion,
  strength,
}: LiquidPillChainOptions) {
  const outerRef = useRef<HTMLSpanElement>(null)
  const initializedRef = useRef(false)
  const previousPositionRef = useRef<number | null>(null)
  const currentInteractionToken = interactionToken
  const activeTokenRef = useRef<number | null>(
    currentInteractionToken > 0 ? currentInteractionToken : null,
  )
  const lastSeenTokenRef = useRef(0)
  const movementSeenRef = useRef(false)
  const activeFramesRef = useRef(0)
  const quietFramesRef = useRef(0)
  const onInteractionSettledRef = useRef(onInteractionSettled)

  const headPosition = useMotionValue(0)
  const bodyPosition = useSpring(headPosition, {
    stiffness: 640,
    damping: 34,
    mass: 0.45,
    restSpeed: 0.001,
    restDelta: 0.001,
  })
  const tailPosition = useSpring(bodyPosition, {
    stiffness: 520,
    damping: 16,
    mass: 0.58,
    restSpeed: 0.001,
    restDelta: 0.001,
  })
  const pillWidth = useMotionValue(1)
  const direction = useMotionValue(edge === 'left' ? -1 : edge === 'right' ? 1 : 0)
  const physicsActive = useMotionValue(currentInteractionToken > 0 ? 1 : 0)

  const materialScaleX = useTransform(() => {
    if (reduceMotion || physicsActive.get() === 0) return 1
    return resolveLiquidPillChainGeometry(
      headPosition.get(),
      bodyPosition.get(),
      tailPosition.get(),
      pillWidth.get(),
      direction.get(),
      strength,
    ).scaleX
  })
  const materialOriginX = useTransform(() =>
    resolveLiquidPillOrigin(edge, direction.get()),
  )

  onInteractionSettledRef.current = onInteractionSettled

  const resetInteractionWindow = useCallback(() => {
    movementSeenRef.current = false
    activeFramesRef.current = 0
    quietFramesRef.current = 0
  }, [])

  useEffect(() => {
    if (
      isNewLiquidPillInteractionToken(
        currentInteractionToken,
        lastSeenTokenRef.current,
      )
    ) {
      lastSeenTokenRef.current = currentInteractionToken
      activeTokenRef.current = currentInteractionToken
      resetInteractionWindow()
      if (reduceMotion) {
        activeTokenRef.current = null
        physicsActive.set(0)
        onInteractionSettledRef.current?.(currentInteractionToken)
      } else {
        physicsActive.set(1)
      }
      return
    }

    if (currentInteractionToken <= 0 || reduceMotion) {
      activeTokenRef.current = null
      physicsActive.set(0)
    }
  }, [
    currentInteractionToken,
    physicsActive,
    reduceMotion,
    resetInteractionWindow,
  ])

  const readHeadPosition = useCallback(
    (rect: DOMRect) => {
      if (edge === 'left') return rect.left
      if (edge === 'right') return rect.right
      return rect.left + rect.width / 2
    },
    [edge],
  )

  const initializeAtCurrentPosition = useCallback(() => {
    const outer = outerRef.current
    if (!outer) return

    const rect = outer.getBoundingClientRect()
    const position = readHeadPosition(rect)
    const computedWidth = Number.parseFloat(getComputedStyle(outer).width)

    headPosition.set(position)
    bodyPosition.jump(position)
    tailPosition.jump(position)
    pillWidth.set(Number.isFinite(computedWidth) ? computedWidth : rect.width)
    direction.set(edge === 'left' ? -1 : edge === 'right' ? 1 : 0)
    previousPositionRef.current = position
    initializedRef.current = true
  }, [bodyPosition, direction, edge, headPosition, pillWidth, readHeadPosition, tailPosition])

  useAnimationFrame(() => {
    const outer = outerRef.current
    if (!outer) return

    const rect = outer.getBoundingClientRect()
    const position = readHeadPosition(rect)

    if (!initializedRef.current) {
      initializeAtCurrentPosition()
      return
    }

    const previousPosition = previousPositionRef.current
    const delta = previousPosition == null ? 0 : position - previousPosition

    if (reduceMotion || physicsActive.get() === 0) {
      headPosition.set(position)
      bodyPosition.jump(position)
      tailPosition.jump(position)
      previousPositionRef.current = position
      return
    }

    if (Math.abs(delta) > 0.1) {
      movementSeenRef.current = true
      const nextDirection = Math.sign(delta)
      if (!edge) direction.set(nextDirection)
    }

    // This is the only continuously driven node. Body and tail retain their
    // own velocities because they are springs attached to the node ahead.
    headPosition.set(position)
    previousPositionRef.current = position

    activeFramesRef.current += 1
    const settled = isLiquidPillChainSettled({
      frameDelta: delta,
      head: position,
      body: bodyPosition.get(),
      tail: tailPosition.get(),
      bodyVelocity: bodyPosition.getVelocity(),
      tailVelocity: tailPosition.getVelocity(),
    })

    // Give the shared-layout tween time to start before accepting visual rest.
    // Once the response has settled, consume this exact interaction token.
    if (settled && (movementSeenRef.current || activeFramesRef.current >= 8)) {
      quietFramesRef.current += 1
      if (quietFramesRef.current >= 4) {
        const completedToken = activeTokenRef.current
        activeTokenRef.current = null
        physicsActive.set(0)
        headPosition.set(position)
        bodyPosition.jump(position)
        tailPosition.jump(position)
        if (completedToken !== null) {
          onInteractionSettledRef.current?.(completedToken)
        }
      }
    } else {
      quietFramesRef.current = 0
    }
  })

  return {
    outerRef,
    materialOriginX,
    materialScaleX,
    onLayoutAnimationStart: initializeAtCurrentPosition,
  }
}
