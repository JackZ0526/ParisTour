import React, { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'
import { useEnterExit } from '../hooks/useEnterExit'
import { useSheetDragDismiss } from '../hooks/useSheetDragDismiss'
import { glassBackdropSurfaceClass } from '../styles/glassCapsule'

export interface BottomSheetProps {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  className?: string
  overlayZIndex?: number
  overlayClassName?: string
  hideBackdrop?: boolean
  closeOnBackdrop?: boolean
  showHandle?: boolean
  ariaLabel?: string
  ariaLabelledBy?: string
  containerProps?: Record<string, unknown>
}

/**
 * Unified Bottom Sheet container for modal dialogs across the application.
 *
 * Architecture:
 * - Outer motion.div: Handles 420ms iOS quintic slide-up entrance and exit transitions
 *   via useEnterExit('sheet-bottom').
 * - Inner motion.div: Handles real-time pull-down gesture displacement (dragY), velocity
 *   physics, and rubberband overscroll suppression without style collision.
 * - Backdrop: Fades independently via useEnterExit('fade').
 */
export function BottomSheet({
  open,
  onClose,
  children,
  className = '',
  overlayZIndex = 2000,
  overlayClassName = '',
  hideBackdrop = false,
  closeOnBackdrop = true,
  showHandle = true,
  ariaLabel,
  ariaLabelledBy,
  containerProps,
}: BottomSheetProps) {
  useBodyScrollLock(open)
  const sheet = useEnterExit('sheet-responsive')
  const backdrop = useEnterExit('fade')
  const { sheetRef, dragY } = useSheetDragDismiss<HTMLDivElement>({ open, onClose })

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            aria-label="关闭"
            initial={backdrop.initial}
            animate={backdrop.animate}
            exit={backdrop.exit}
            transition={backdrop.transition}
            style={{ zIndex: overlayZIndex }}
            className={`fixed inset-0 cursor-default ${glassBackdropSurfaceClass} ${
              hideBackdrop ? 'pointer-events-none invisible' : ''
            } ${overlayClassName}`}
            onClick={() => {
              if (closeOnBackdrop) onClose()
            }}
          />
          <div
            className="pointer-events-none fixed inset-0 flex items-end justify-center p-0 sm:items-center sm:p-4"
            style={{ zIndex: overlayZIndex + 1 }}
            {...containerProps}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={ariaLabel}
              aria-labelledby={ariaLabelledBy}
              initial={sheet.initial}
              animate={sheet.animate}
              exit={sheet.exit}
              transition={sheet.transition}
              className="pointer-events-auto relative z-10 flex w-full justify-center"
            >
              <motion.div
                ref={sheetRef}
                style={{ y: dragY }}
                className={`relative w-full [touch-action:pan-y] [overscroll-behavior-y:contain] ${className}`}
              >
                {showHandle && (
                  <div
                    className="flex sm:hidden w-full shrink-0 justify-center pt-2.5 pb-1 select-none pointer-events-none"
                    aria-hidden="true"
                  >
                    <div className="h-1 w-10 rounded-full bg-[var(--stone)]/35" />
                  </div>
                )}
                {children}
              </motion.div>

              {/* Mobile Overscroll Bleed Skirt: Prevents dark backdrop from leaking when rubber-band pulling up */}
              <motion.div
                style={{ y: dragY }}
                aria-hidden="true"
                className="pointer-events-none absolute -bottom-[400px] inset-x-0 h-[400px] bg-white/95 backdrop-blur-2xl sm:hidden"
              />
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  )
}
