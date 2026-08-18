import type { Target, Transition } from 'framer-motion'
import { useReducedMotion } from './useReducedMotion'

/**
 * Enter/exit transition presets for modal-like overlays.
 *
 * Picking a preset:
 *   - `sheet-bottom`  → iOS-style bottom-anchored sheet (420ms easeOutQuint)
 *   - `sheet-center`  → centered dialog (220ms fade + scale)
 *   - `popover`       → floating panel anchored to a trigger (220ms fade + slide)
 *   - `fade`          → generic backdrop / overlay (180ms)
 *
 * Use:
 *   const sheet = useEnterExit('sheet-bottom')
 *   return (
 *     <AnimatePresence>
 *       {open && (
 *         <motion.div
 *           initial={sheet.initial}
 *           animate={sheet.animate}
 *           exit={sheet.exit}
 *           transition={sheet.transition}
 *         >{children}</motion.div>
 *       )}
 *     </AnimatePresence>
 *   )
 *
 * The duration is collapsed to 0.01ms when the user prefers reduced motion
 * (via `useReducedMotion`), so the animation fires `onAnimationComplete`
 * but is visually instant.
 */
export type EnterExitPreset = 'sheet-bottom' | 'sheet-center' | 'popover' | 'fade'

export interface EnterExitSpec {
  initial: Target
  animate: Target
  exit: Target
  transition: Transition
}

const PRESETS: Record<EnterExitPreset, EnterExitSpec> = {
  'sheet-bottom': {
    initial: { y: '100%' },
    animate: { y: 0 },
    exit: { y: '100%' },
    transition: { duration: 0.42, ease: [0.22, 1, 0.36, 1] },
  },
  'sheet-center': {
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.95 },
    transition: { duration: 0.22, ease: 'easeOut' },
  },
  'popover': {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 4 },
    transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] },
  },
  'fade': {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: 0.18, ease: 'easeOut' },
  },
}

const REDUCED: Transition = { duration: 0.01 }

export function useEnterExit(preset: EnterExitPreset): EnterExitSpec {
  const reduce = useReducedMotion()
  const spec = PRESETS[preset]
  if (reduce) {
    return { ...spec, transition: REDUCED }
  }
  return spec
}
