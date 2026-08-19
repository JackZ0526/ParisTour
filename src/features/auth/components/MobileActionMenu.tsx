import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Archive, LogOut, Share2, Trash2 } from 'lucide-react'

interface MobileActionMenuProps {
  hasActiveTrip: boolean
  canShare: boolean
  canClear: boolean
  onBackup: () => void
  onShare: () => void
  onClearAll: () => void
  onSignOut: () => void
}

const MORPH_SPRING = { type: 'spring' as const, stiffness: 420, damping: 28, mass: 0.8 }
const MENU_WIDTH = 176

export function MobileActionMenu({
  hasActiveTrip,
  canShare,
  canClear,
  onBackup,
  onShare,
  onClearAll,
  onSignOut,
}: MobileActionMenuProps) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Calculate items count to determine exact target height
  const itemsCount = useMemo(() => {
    let count = 1 // signOut is always present
    if (hasActiveTrip) count++
    if (canShare) count++
    if (canClear) count++
    return count
  }, [hasActiveTrip, canShare, canClear])

  // Height formula: 16px (p-2 padding) + count * 40px (each item) + (count - 1) * 4px (gap-1)
  const targetHeight = 16 + itemsCount * 40 + (itemsCount - 1) * 4

  // Close on click outside
  useEffect(() => {
    if (!open) return
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchstart', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <div className="relative h-8 w-8 sm:hidden">
      <motion.div
        ref={menuRef}
        role={open ? 'dialog' : 'button'}
        tabIndex={open ? -1 : 0}
        aria-label={open ? '更多操作菜单' : '更多操作'}
        aria-expanded={open}
        onClick={open ? undefined : () => setOpen(true)}
        onKeyDown={
          open
            ? undefined
            : (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  setOpen(true)
                }
              }
        }
        whileTap={open ? undefined : { scale: 0.92 }}
        initial={false}
        animate={{
          width: open ? MENU_WIDTH : 32,
          height: open ? targetHeight : 32,
          borderRadius: open ? 20 : 9999,
          backgroundColor: open ? 'var(--paper)' : 'rgba(255, 252, 247, 0.65)',
        }}
        transition={{
          width: { ...MORPH_SPRING, delay: open ? 0 : 0.18 },
          height: { ...MORPH_SPRING, delay: open ? 0.18 : 0 },
          borderRadius: { duration: 0.22, ease: [0.22, 1, 0.36, 1] },
          backgroundColor: { duration: 0.18, ease: 'easeOut' },
        }}
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          transformOrigin: 'top right',
          zIndex: 35,
          boxShadow: open
            ? '0 16px 36px rgba(28, 36, 32, 0.14), 0 2px 6px rgba(28, 36, 32, 0.06)'
            : 'none',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
        className="overflow-hidden border border-[var(--stone)]/30 text-[var(--stone)]"
      >
        <AnimatePresence mode="wait" initial={false}>
          {!open ? (
            <motion.div
              key="closed-icon"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="flex h-8 w-8 cursor-pointer items-center justify-center text-[var(--stone)] select-none"
            >
              <span aria-hidden className="text-base leading-none">⋯</span>
            </motion.div>
          ) : (
            <motion.div
              key="open-content"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2, delay: 0.16, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col gap-1 p-2 w-full select-none"
            >
              {hasActiveTrip && (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    onBackup()
                  }}
                  className="flex h-10 items-center gap-2 rounded-xl px-3 text-left text-sm text-[var(--ink)] hover:bg-[var(--mist)] focus-visible:bg-[var(--mist)] transition-colors"
                >
                  <Archive size={16} strokeWidth={1.8} aria-hidden />
                  <span>存档</span>
                </button>
              )}
              {canShare && (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    onShare()
                  }}
                  className="flex h-10 items-center gap-2 rounded-xl px-3 text-left text-sm text-[var(--ink)] hover:bg-[var(--mist)] focus-visible:bg-[var(--mist)] transition-colors"
                >
                  <Share2 size={16} strokeWidth={1.8} aria-hidden />
                  <span>分享</span>
                </button>
              )}
              {canClear && (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    onClearAll()
                  }}
                  className="flex h-10 items-center gap-2 rounded-xl px-3 text-left text-sm text-[var(--ink)] hover:bg-[var(--mist)] focus-visible:bg-[var(--mist)] transition-colors"
                >
                  <Trash2 size={16} strokeWidth={1.8} aria-hidden />
                  <span>清空全部</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  onSignOut()
                }}
                className="flex h-10 items-center gap-2 rounded-xl px-3 text-left text-sm text-[var(--ink)] hover:bg-[var(--mist)] focus-visible:bg-[var(--mist)] transition-colors"
              >
                <LogOut size={16} strokeWidth={1.8} aria-hidden />
                <span>登出</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
