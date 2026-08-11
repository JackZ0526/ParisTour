import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  listTripSnapshotBackups,
  restoreTripSnapshotBackup,
  type TripSnapshotBackup,
} from '../services/tripCloud'
import { CloseIconButton } from '../../../components/CloseIconButton'

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

export function BackupDialog({ tripId, open, onClose, onRestored }: Props) {
  const [backups, setBackups] = useState<TripSnapshotBackup[]>([])
  const [loading, setLoading] = useState(false)
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError(null)
    void listTripSnapshotBackups(tripId)
      .then((list) => {
        if (!cancelled) setBackups(list)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '读取存档备份失败')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, tripId])

  if (!open) return null

  async function restore(backup: TripSnapshotBackup) {
    const ok = window.confirm(
      `恢复 ${formatBackupTime(backup.createdAt)} 的版本？当前内容会先自动备份，因此可以撤销这次恢复。`,
    )
    if (!ok) return
    setRestoringId(backup.id)
    setError(null)
    try {
      await restoreTripSnapshotBackup(tripId, backup.id)
      onRestored()
    } catch (err) {
      setError(err instanceof Error ? err.message : '恢复存档失败')
      setRestoringId(null)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[2050] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4">
      <button
        type="button"
        aria-label="关闭存档备份"
        className="absolute inset-0"
        onClick={onClose}
      />
      <section className="relative z-10 max-h-[85vh] w-full overflow-y-auto rounded-t-3xl bg-[var(--paper)] p-5 shadow-2xl sm:max-w-2xl sm:rounded-3xl sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl text-[var(--ink)]">存档备份</h2>
            <p className="mt-1 text-sm text-[var(--stone)]">
              每次保存前自动保留旧版本，最多 5 份。出错时可以从这里恢复。
            </p>
          </div>
          <CloseIconButton onClick={onClose} />
        </div>

        {error && (
          <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>
        )}

        <div className="mt-5 space-y-3">
          {loading ? (
            <p className="rounded-2xl bg-[var(--mist)]/60 px-4 py-6 text-center text-sm text-[var(--stone)]">
              正在读取备份…
            </p>
          ) : backups.length ? (
            backups.map((backup, index) => (
              <article
                key={backup.id}
                className="rounded-2xl border border-[var(--stone)]/20 bg-white/70 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[var(--ink)]">
                      {index === 0 ? '最近备份' : `备份 ${index + 1}`} ·{' '}
                      {formatBackupTime(backup.createdAt)}
                    </p>
                    <p className="mt-1 text-sm text-[var(--stone)]">
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
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--ink)] text-[var(--paper)] disabled:opacity-50"
                  >
                    {restoringId === backup.id ? (
                      <svg
                        className="animate-spin"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        aria-hidden
                      >
                        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                      </svg>
                    ) : (
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                        <path d="M3 3v5h5" />
                      </svg>
                    )}
                  </button>
                </div>
              </article>
            ))
          ) : (
            <p className="rounded-2xl border border-dashed border-[var(--stone)]/30 px-4 py-6 text-center text-sm text-[var(--stone)]">
              还没有历史备份。下次保存时会自动创建。
            </p>
          )}
        </div>
      </section>
    </div>,
    document.body,
  )
}
