import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
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
import { LoaderCircle, RotateCcw } from 'lucide-react'

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

const SKELETON_SUBTITLE_WIDTHS = ['w-4/5', 'w-3/4', 'w-5/6', 'w-2/3', 'w-4/5']

function BackupListSkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: 5 }, (_, i) => (
        <div
          key={i}
          className={`rounded-2xl ${glassCardSurfaceClass} p-4`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-4 w-44 rounded-full day-tab-shimmer" />
              <div
                className={`h-3.5 rounded-full day-tab-shimmer ${
                  SKELETON_SUBTITLE_WIDTHS[i % SKELETON_SUBTITLE_WIDTHS.length]
                }`}
              />
            </div>
            <div className="h-9 w-9 shrink-0 rounded-full day-tab-shimmer" />
          </div>
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
      className={`max-h-[min(85dvh,85vh)] max-w-2xl overflow-y-auto rounded-t-3xl ${glassModalSurfaceClass} px-5 pb-5 pt-1 sm:rounded-3xl sm:p-7`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl text-[var(--ink)]">存档备份</h2>
          <p className="mt-1 text-sm text-[var(--stone)]">
            每次保存前自动保留旧版本，最多 5 份。出错时可以从这里恢复。
          </p>
        </div>
        <CloseIconButton onClick={onClose} className="hidden sm:flex" />
      </div>

      {error && (
        <p className="mt-4 rounded-xl bg-red-50/80 border border-red-200/60 px-4 py-3 text-sm text-red-800 backdrop-blur-sm">{error}</p>
      )}

      <motion.div
        layout
        transition={{ layout: { duration: 0.28, ease: [0.22, 1, 0.36, 1] } }}
        className="mt-5 space-y-3"
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
              className="space-y-3"
            >
              {backups.map((backup, index) => (
                <article
                  key={backup.id}
                  className={`rounded-2xl ${glassCardSurfaceClass} p-4 transition hover:bg-white/90 hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)]`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium leading-5 text-[var(--ink)]">
                        {index === 0 ? '最近备份' : `备份 ${index + 1}`} ·{' '}
                        {formatBackupTime(backup.createdAt)}
                      </p>
                      <p className="mt-1 truncate text-sm leading-5 text-[var(--stone)]">
                        {backupSummary(backup)}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={Boolean(restoringId)}
                      onClick={() => void restore(backup)}
                      aria-label="恢复此版本"
                      aria-busy={restoringId === backup.id || undefined}
                      title={
                        restoringId === backup.id ? '正在恢复…' : '恢复此版本'
                      }
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--ink)] text-[var(--paper)] shadow-sm transition hover:opacity-90 active:scale-95 disabled:opacity-50"
                    >
                      {restoringId === backup.id ? (
                        <LoaderCircle
                          className="animate-spin"
                          size={16}
                          strokeWidth={2}
                          aria-hidden
                        />
                      ) : (
                        <RotateCcw
                          size={16}
                          strokeWidth={2}
                          aria-hidden
                        />
                      )}
                    </button>
                  </div>
                </article>
              ))}
            </motion.div>
          ) : (
            <motion.p
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="rounded-2xl border border-dashed border-[var(--stone)]/30 bg-white/40 px-4 py-6 text-center text-sm text-[var(--stone)] backdrop-blur-md"
            >
              还没有历史备份。下次保存时会自动创建。
            </motion.p>
          )}
        </AnimatePresence>
      </motion.div>

      <ConfirmDialog
        open={Boolean(pendingRestoreBackup)}
        onClose={() => setPendingRestoreBackup(null)}
        onConfirm={executeRestore}
        title="恢复云端存档"
        description={`确定恢复此备份（${pendingRestoreBackup ? formatBackupTime(pendingRestoreBackup.createdAt) : ''}）吗？当前未保存的本地改动将被覆盖。`}
        confirmText="恢复备份"
        tone="warning"
        icon="history"
      />
    </BottomSheet>
  )
}
