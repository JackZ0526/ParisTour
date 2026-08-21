import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertCircle,
  Archive,
  History,
  LoaderCircle,
  RotateCcw,
  Sparkles,
} from 'lucide-react'
import {
  listTripSnapshotBackups,
  restoreTripSnapshotBackup,
  type TripSnapshotBackup,
} from '../services/tripCloud'
import { BottomSheet } from '../../../shared/components/BottomSheet'
import { CloseIconButton } from '../../../shared/components/CloseIconButton'
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog'
import {
  glassCardSurfaceClass,
  glassModalSurfaceClass,
} from '../../../shared/styles/glassCapsule'

interface Props {
  tripId: string
  open: boolean
  onClose: () => void
  onRestored: () => void
}

function backupSummary(backup: TripSnapshotBackup): string {
  const snapshot = backup.snapshot
  const days = snapshot.itinerary?.days?.length || 0
  const stops =
    snapshot.itinerary?.days?.reduce(
      (sum, day) => sum + (day.stops?.length || 0),
      0,
    ) || 0
  const parts: string[] = []
  if (snapshot.dates?.startDate && snapshot.dates?.endDate) {
    parts.push(`${snapshot.dates.startDate} → ${snapshot.dates.endDate}`)
  }
  const outbound = snapshot.flights?.outbound?.flightNumber
  const inbound = snapshot.flights?.returnFlight?.flightNumber
  if (outbound || inbound) parts.push([outbound, inbound].filter(Boolean).join(' / '))
  if (snapshot.hotel?.selected?.name) parts.push(snapshot.hotel.selected.name)
  if (days) parts.push(`${days} 天 · ${stops} 个行程点`)
  return parts.length ? parts.join(' · ') : '空行程或初始化存档'
}

function formatBackupTime(value: string): string {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date)
}

function BackupListSkeleton() {
  return (
    <div className="space-y-2.5" aria-hidden="true">
      {Array.from({ length: 3 }, (_, i) => (
        <div
          key={i}
          className={`flex items-center justify-between rounded-2xl ${glassCardSurfaceClass} p-3.5`}
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="h-9 w-9 shrink-0 rounded-xl day-tab-shimmer bg-[var(--mist)]/80" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="h-4 w-44 rounded-full day-tab-shimmer bg-[var(--mist)]" />
              <div className="h-3 w-3/4 rounded-full day-tab-shimmer bg-[var(--mist)]/70" />
            </div>
          </div>
          <div className="h-8 w-16 rounded-full day-tab-shimmer bg-[var(--mist)]/60" />
        </div>
      ))}
    </div>
  )
}

export function BackupDialog({ tripId, open, onClose, onRestored }: Props) {
  const [backups, setBackups] = useState<TripSnapshotBackup[]>([])
  const [loading, setLoading] = useState(false)
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let active = true
    setLoading(true)
    setError(null)
    listTripSnapshotBackups(tripId)
      .then((data) => {
        if (active) setBackups(data)
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : '加载备份失败')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [open, tripId])

  const [pendingRestoreBackup, setPendingRestoreBackup] = useState<TripSnapshotBackup | null>(null)

  async function executeRestore() {
    if (!pendingRestoreBackup || restoringId) return
    const backup = pendingRestoreBackup
    setRestoringId(backup.id)
    setError(null)
    try {
      await restoreTripSnapshotBackup(tripId, backup.id)
      onRestored()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : '恢复存档失败')
      setRestoringId(null)
    } finally {
      setPendingRestoreBackup(null)
    }
  }

  function restore(backup: TripSnapshotBackup) {
    if (restoringId) return
    setPendingRestoreBackup(backup)
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      overlayZIndex={2050}
      className={`flex max-h-[min(85dvh,85vh)] max-w-2xl flex-col overflow-hidden rounded-t-3xl ${glassModalSurfaceClass} sm:rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.12),inset_0_1px_2px_rgba(255,255,255,1)]`}
    >
      {/* Header Section */}
      <header className="relative shrink-0 border-b border-[var(--mist)]/60 px-5 pb-4 pt-3 sm:pt-5 sm:px-6">
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl sm:text-3xl font-semibold text-[var(--ink)] tracking-tight">
              存档备份
            </h2>
            <p className="mt-1 text-xs sm:text-sm text-[var(--stone)] leading-relaxed">
              自动保留最近 5 份快照，可随时一键回退恢复。
            </p>
          </div>
          <CloseIconButton onClick={onClose} className="hidden sm:flex" />
        </div>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5 sm:px-6">
        {/* Error Alert */}
        {error && (
          <div className="flex items-start gap-2.5 rounded-2xl border border-red-200/80 bg-red-50/70 p-3 text-xs text-red-900 shadow-sm backdrop-blur-md">
            <AlertCircle size={15} strokeWidth={1.8} className="mt-0.5 shrink-0 text-red-600" />
            <span>{error}</span>
          </div>
        )}

        <motion.div
          layout
          transition={{ layout: { duration: 0.28, ease: [0.22, 1, 0.36, 1] } }}
          className="space-y-3"
        >
          <AnimatePresence mode="wait" initial={false}>
            {loading ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <BackupListSkeleton />
              </motion.div>
            ) : backups.length ? (
              <motion.div
                key="list"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="space-y-2"
              >
                {backups.map((backup, index) => {
                  const isLatest = index === 0
                  const isRestoringThis = restoringId === backup.id

                  return (
                    <article
                      key={backup.id}
                      className={`flex items-center justify-between gap-3 rounded-2xl border border-white/80 bg-white/65 p-3 sm:p-3.5 shadow-2xs backdrop-blur-md transition-all hover:bg-white/95 hover:shadow-xs ${
                        isLatest ? 'border-[var(--copper)]/30 bg-white/80' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                        <div
                          className={`flex h-8.5 w-8.5 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl font-display text-sm font-semibold shadow-inner ${
                            isLatest
                              ? 'bg-[var(--copper)]/15 text-[var(--copper)]'
                              : 'bg-[var(--sage)]/15 text-[var(--sage)]'
                          }`}
                        >
                          {isLatest ? (
                            <Sparkles size={15} strokeWidth={2.2} />
                          ) : (
                            <History size={15} strokeWidth={2} />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs sm:text-sm font-semibold text-[var(--ink)]">
                              {isLatest ? '最新快照' : `快照 #${backups.length - index}`}
                            </span>
                            {isLatest && (
                              <span className="rounded-full bg-[var(--copper)]/15 px-1.5 py-0.2 text-[9.5px] font-bold text-[var(--copper)]">
                                当前
                              </span>
                            )}
                            <span className="text-[11px] text-[var(--stone)] truncate">
                              · {formatBackupTime(backup.createdAt)}
                            </span>
                          </div>
                          <p className="mt-0.5 truncate text-[11px] sm:text-xs text-[var(--stone)]/85">
                            {backupSummary(backup)}
                          </p>
                        </div>
                      </div>

                      <div className="shrink-0">
                        <button
                          type="button"
                          disabled={Boolean(restoringId)}
                          onClick={() => void restore(backup)}
                          aria-label="恢复此版本"
                          aria-busy={isRestoringThis || undefined}
                          title={isRestoringThis ? '正在恢复…' : '恢复此版本'}
                          className="group relative isolate inline-flex items-center gap-1 rounded-full border border-[var(--copper)]/35 bg-white/90 px-3 py-1.5 text-xs font-semibold text-[var(--copper)] shadow-2xs backdrop-blur-sm transition-all hover:bg-[var(--copper)] hover:text-white active:scale-95 disabled:opacity-50 cursor-pointer"
                        >
                          {isRestoringThis ? (
                            <LoaderCircle
                              className="animate-spin"
                              size={12}
                              strokeWidth={2.2}
                              aria-hidden
                            />
                          ) : (
                            <RotateCcw
                              size={12}
                              strokeWidth={2.2}
                              className="transition-transform group-hover:-rotate-45"
                              aria-hidden
                            />
                          )}
                          <span>{isRestoringThis ? '恢复中…' : '恢复'}</span>
                        </button>
                      </div>
                    </article>
                  )
                })}
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="rounded-2xl border border-dashed border-[var(--copper)]/25 bg-white/40 px-4 py-8 text-center backdrop-blur-sm space-y-2"
              >
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--copper)]/10 text-[var(--copper)] shadow-inner">
                  <Archive size={20} strokeWidth={1.8} />
                </div>
                <p className="text-sm font-medium text-[var(--ink)]">暂无历史快照存档</p>
                <p className="text-xs text-[var(--stone)] max-w-xs mx-auto">
                  当您对行程进行修改并自动保存时，系统将自动保留版本快照供您随时回溯。
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      <ConfirmDialog
        open={Boolean(pendingRestoreBackup)}
        onClose={() => setPendingRestoreBackup(null)}
        onConfirm={executeRestore}
        title="恢复云端存档"
        description={`确定恢复此快照（${pendingRestoreBackup ? formatBackupTime(pendingRestoreBackup.createdAt) : ''}）吗？当前未保存的本地改动将被覆盖。`}
        confirmText="恢复备份"
        tone="warning"
        icon="history"
      />
    </BottomSheet>
  )
}
