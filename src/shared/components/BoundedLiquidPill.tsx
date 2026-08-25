import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import {
  useLiquidPillChain,
  type LiquidPillEdge,
} from '../animations/liquidPillMotion'
import { useReducedMotion } from '../hooks/useReducedMotion'

type BoundedLiquidPillProps = {
  layoutId: string
  layoutDependency?: string | number | boolean
  className: string
  children?: ReactNode
  interactionToken: number
  onInteractionSettled: (token: number) => void
  edge?: LiquidPillEdge
  deformationStrength?: number
}

/** Shared velocity-driven segmented-control indicator with bounded outer stops. */
export function BoundedLiquidPill({
  layoutId,
  layoutDependency,
  className,
  children,
  interactionToken,
  onInteractionSettled,
  edge = null,
  deformationStrength = 1,
}: BoundedLiquidPillProps) {
  const reduceMotion = useReducedMotion()
  const chain = useLiquidPillChain({
    edge,
    interactionToken,
    onInteractionSettled,
    reduceMotion,
    strength: deformationStrength,
  })

  return (
    <motion.span
      ref={chain.outerRef}
      aria-hidden
      data-liquid-pill-layout={layoutId}
      layoutId={layoutId}
      layoutDependency={layoutDependency}
      className="pointer-events-none absolute inset-0 z-0"
      onLayoutAnimationStart={chain.onLayoutAnimationStart}
      transition={{
        layout: reduceMotion
          ? { duration: 0 }
          // End with a zero slope so shared-layout scale/translation reaches
          // identity without a final-frame hard stop on subpixel geometry.
          : { type: 'tween', duration: 0.28, ease: [0.22, 0.75, 0.25, 1] },
      }}
    >
      <motion.span
        data-liquid-pill-surface
        data-liquid-pill-edge={edge ?? 'free'}
        className={`absolute inset-0 ${className}`}
        initial={false}
        style={{
          originX: chain.materialOriginX,
          originY: 0.5,
          scaleX: chain.materialScaleX,
        }}
      >
        {children}
      </motion.span>
    </motion.span>
  )
}
