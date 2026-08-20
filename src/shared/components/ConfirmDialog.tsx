import { useEffect, useId } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, History, RotateCcw, Sparkles, Trash2, X } from 'lucide-react'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'
import { useEnterExit } from '../hooks/useEnterExit'
import { glassModalSurfaceClass } from '../styles/glassCapsule'

export interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void | Promise<void>
  title: string
  description?: React.ReactNode
  confirmText?: string
  cancelText?: string
  tone?: 'danger' | 'warning' | 'sage' | 'neutral'
  icon?: 'trash' | 'alert' | 'refresh' | 'history' | 'reset'
  busy?: boolean
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = '确定',
  cancelText = '取消',
  tone = 'danger',
  icon = 'trash',
  busy = false,
}: ConfirmDialogProps) {
  const titleId = useId()
  const descId = useId()
  useBodyScrollLock(open)

  const backdrop = useEnterExit('fade')

  const dialogAnim = {
    initial: { opacity: 0, scale: 0.93, y: 14 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.93, y: 8 },
    transition: { duration: 0.22, ease: [0.16, 1, 0.3, 1] as const },
  }

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose, busy])

  if (typeof document === 'undefined') return null

  function renderIcon() {
    switch (icon) {
      case 'trash':
        return <Trash2 size={18} strokeWidth={1.8} className="text-[#b8433e]" />
      case 'alert':
        return <AlertTriangle size={18} strokeWidth={1.8} className="text-[var(--copper)]" />
      case 'refresh':
        return <Sparkles size={18} strokeWidth={1.8} className="text-[var(--sage)]" />
      case 'history':
        return <History size={18} strokeWidth={1.8} className="text-purple-800" />
      case 'reset':
        return <RotateCcw size={18} strokeWidth={1.8} className="text-[var(--copper)]" />
      default:
        return <AlertTriangle size={18} strokeWidth={1.8} className="text-[#b8433e]" />
    }
  }

  function iconWrapperTone() {
    switch (tone) {
      case 'danger':
        return 'bg-[#b8433e]/10 border-[#b8433e]/20 text-[#b8433e]'
      case 'warning':
        return 'bg-[var(--copper)]/10 border-[var(--copper)]/25 text-[var(--copper)]'
      case 'sage':
        return 'bg-[var(--sage)]/10 border-[var(--sage)]/25 text-[var(--sage)]'
      case 'neutral':
      default:
        return 'bg-black/5 border-black/10 text-[var(--stone)]'
    }
  }

  function confirmButtonClasses() {
    switch (tone) {
      case 'danger':
        return 'bg-[#b8433e] hover:bg-[#a53a35] text-white shadow-[0_4px_14px_rgba(184,67,62,0.3)]'
      case 'warning':
        return 'bg-[var(--copper)] hover:opacity-95 text-white shadow-[0_4px_14px_rgba(181,106,60,0.3)]'
      case 'sage':
        return 'bg-[var(--sage)] hover:opacity-95 text-white shadow-[0_4px_14px_rgba(74,99,86,0.3)]'
      case 'neutral':
      default:
        return 'bg-[var(--ink)] hover:opacity-90 text-white shadow-sm'
    }
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={backdrop.initial}
            animate={backdrop.animate}
            exit={backdrop.exit}
            transition={backdrop.transition}
            style={{ zIndex: 2100 }}
            className="fixed inset-0 bg-black/45 backdrop-blur-xs"
            onClick={() => {
              if (!busy) onClose()
            }}
          />

          {/* Dialog Container: Centered on desktop, shifted down by 7vh on mobile to hit the golden ergonomic sweet spot */}
          <div
            className="fixed inset-0 flex items-center justify-center p-4 sm:p-4 pointer-events-none"
            style={{ zIndex: 2101 }}
          >
            <motion.div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby={titleId}
              aria-describedby={description ? descId : undefined}
              initial={dialogAnim.initial}
              animate={dialogAnim.animate}
              exit={dialogAnim.exit}
              transition={dialogAnim.transition}
              className={`pointer-events-auto translate-y-[7vh] sm:translate-y-0 flex w-full max-w-[min(100%,25rem)] flex-col overflow-hidden rounded-3xl ${glassModalSurfaceClass} p-5 sm:p-6 shadow-[0_25px_60px_rgba(0,0,0,0.16),0_4px_20px_rgba(0,0,0,0.04)]`}
            >
              {/* Header */}
              <div className="flex items-start gap-3.5">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${iconWrapperTone()} shadow-xs backdrop-blur-md`}
                >
                  {renderIcon()}
                </div>
                <div className="flex-1 pt-0.5 min-w-0">
                  <h3 id={titleId} className="font-display text-lg sm:text-xl font-semibold text-[var(--ink)] tracking-tight">
                    {title}
                  </h3>
                  {description && (
                    <div id={descId} className="mt-1.5 text-xs sm:text-sm text-[var(--stone)] leading-relaxed">
                      {description}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  aria-label="关闭"
                  disabled={busy}
                  onClick={onClose}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--stone)]/80 transition-colors hover:bg-black/5 hover:text-[var(--ink)] active:scale-95"
                >
                  <X size={15} />
                </button>
              </div>

              {/* Action Buttons: Unified Symmetrical Frosted Capsules */}
              <div className="mt-6 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  disabled={busy}
                  onClick={onClose}
                  className="min-h-[38px] rounded-full border border-black/8 bg-white/70 px-4.5 py-2 text-xs sm:text-sm font-medium text-[var(--stone)] shadow-xs backdrop-blur-md transition-all hover:bg-white hover:text-[var(--ink)] active:scale-95 disabled:opacity-50"
                >
                  {cancelText}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    await onConfirm()
                    onClose()
                  }}
                  className={`min-h-[38px] rounded-full px-5 py-2 text-xs sm:text-sm font-medium transition-all active:scale-95 disabled:opacity-50 ${confirmButtonClasses()}`}
                >
                  {busy ? '执行中…' : confirmText}
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  )
}
