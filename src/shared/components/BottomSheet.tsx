import React, { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'
import { useEnterExit } from '../hooks/useEnterExit'
import { useSheetDragDismiss } from '../hooks/useSheetDragDismiss'

export interface BottomSheetProps {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  className?: string
  overlayZIndex?: number
  overlayClassName?: string
  hideBackdrop?: boolean
  closeOnBackdrop?: boolean
  ariaLabel?: string
  ariaLabelledBy?: string
  containerProps?: Record<string, unknown>
}

/**
 * Unified Bottom Sheet container for modal dialogs across the application.
 *
 * Encapsulates:
 * - Portal mounting to document.body
 * - AnimatePresence exit coordination
 * - useBodyScrollLock non-destructive scroll locking
 * - useEnterExit('sheet-bottom') and ('fade') transition presets
 * - useSheetDragDismiss full-surface pull-down-to-dismiss gesture
 * - Escape key dismissal
 * - Backdrop click dismissal
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
  ariaLabel,
  ariaLabelledBy,
  containerProps,
}: BottomSheetProps) {
  useBodyScrollLock(open)
  const sheet = useEnterExit('sheet-bottom')
  const backdrop = useEnterExit('fade')
  const { sheetRef, backdropOpacity, dragProps } = useSheetDragDismiss<HTMLDivElement>({ onClose })

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
            style={{
              zIndex: overlayZIndex,
              opacity: backdropOpacity,
            }}
            className={`fixed inset-0 cursor-default bg-black/45 ${
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
              ref={sheetRef}
              role="dialog"
              aria-modal="true"
              aria-label={ariaLabel}
              aria-labelledby={ariaLabelledBy}
              initial={sheet.initial}
              animate={sheet.animate}
              exit={sheet.exit}
              transition={sheet.transition}
              {...dragProps}
              className={`pointer-events-auto relative z-10 w-full [touch-action:pan-y] [overscroll-behavior-y:contain] ${className}`}
            >
              {children}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  )
}
