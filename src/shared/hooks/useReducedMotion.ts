import { useEffect, useState } from 'react'

/**
 * Returns `true` when the user has `prefers-reduced-motion: reduce` set
 * (macOS Accessibility → Display → Reduce motion; iOS / Windows Settings
 * → Accessibility; or any browser / OS combination honouring the media
 * query).
 *
 * Subscribes to live `change` events, so the value flips when the user
 * toggles the system setting at runtime. Returns `false` during SSR or
 * when `matchMedia` is unavailable.
 *
 * Use this to gate non-essential motion:
 *   const reduce = useReducedMotion()
 *   return (
 *     <div style={{ transitionDuration: reduce ? '0.01ms' : '220ms' }} />
 *   )
 *
 * Note: `motion.*` components from framer-motion do NOT auto-respect
 * this hook (their built-in `useReducedMotion` only reads once on mount).
 * Either gate your JS animations manually, or wrap the tree in
 * `<MotionConfig reducedMotion="user">`.
 */
export function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState<boolean>(getInitial)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mql = window.matchMedia(QUERY)
    const onChange = (event: MediaQueryListEvent) => setReduce(event.matches)
    setReduce(mql.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])
  return reduce
}

/**
 * Returns a duration (ms) that respects the user's reduce-motion
 * preference. By default reduce-motion collapses duration to 0.01ms (so
 * CSS transitions / spring animations still fire `onTransitionEnd` and
 * `onAnimationComplete`, but visually complete instantly).
 *
 * Use for CSS transition / animation durations that aren't already
 * gated by a `@media (prefers-reduced-motion: reduce)` rule.
 *   const dur = useMotionDuration(220)
 *   <div style={{ transitionDuration: `${dur}ms` }} />
 */
export function useMotionDuration(durationMs: number, reduceMs = 0.01): number {
  const reduce = useReducedMotion()
  return reduce ? reduceMs : durationMs
}

const QUERY = '(prefers-reduced-motion: reduce)'

function getInitial(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia(QUERY).matches
}
