import { useEffect, useState } from 'react'
import type { Target, Transition } from 'framer-motion'
import { useReducedMotion } from './useReducedMotion'

const SM_QUERY = '(min-width: 640px)'

export function useIsDesktop(defaultValue = false): boolean {
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return defaultValue
    return window.matchMedia(SM_QUERY).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia(SM_QUERY)
    setIsDesktop(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  return isDesktop
}

/**
 * Enter/exit transition presets for modal-like overlays.
 *
 * Picking a preset:
 *   - `sheet-responsive` → desktop: centered modal (fade + scale); mobile: iOS bottom sheet (slide)
 *   - `sheet-bottom`     → iOS-style bottom-anchored sheet (380ms easeOutQuint)
 *   - `sheet-center`     → centered dialog (200ms fade + scale)
 *   - `popover`          → floating panel anchored to a trigger (220ms fade + slide)
 *   - `fade`             → generic backdrop / overlay (180ms)
 *
 * Use:
 *   const sheet = useEnterExit('sheet-responsive')
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
export type EnterExitPreset =
  | 'sheet-responsive'
  | 'sheet-bottom'
  | 'sheet-center'
  | 'popover'
  | 'fade'

export interface EnterExitSpec {
  initial: Target
  animate: Target
  exit: Target
  transition: Transition
}

const PRESETS: Record<Exclude<EnterExitPreset, 'sheet-responsive'>, EnterExitSpec> = {
  'sheet-bottom': {
    initial: { y: '100%' },
    animate: { y: 0 },
    exit: { y: '100%' },
    transition: { duration: 0.38, ease: [0.22, 1, 0.36, 1] },
  },
  'sheet-center': {
    initial: { opacity: 0, scale: 0.96, y: 8 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.96, y: 6 },
    transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] },
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
  const isDesktop = useIsDesktop()

  const effectivePreset =
    preset === 'sheet-responsive'
      ? isDesktop
        ? 'sheet-center'
        : 'sheet-bottom'
      : preset

  const spec = PRESETS[effectivePreset]
  if (reduce) {
    return { ...spec, transition: REDUCED }
  }
  return spec
}
