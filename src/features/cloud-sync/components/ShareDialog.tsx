import { useCallback, useEffect, useId, useState, type FormEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertCircle,
  CheckCircle2,
  Mail,
  Share2,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react'
import {
  listTripShares,
  removeTripShare,
  sendShareInviteEmail,
  updateTripShareRole,
  upsertTripShare,
  type TripShareRole,
  type TripShareRow,
} from '../services/tripCloud'
import { BottomSheet } from '../../../shared/components/BottomSheet'
import { CloseIconButton } from '../../../shared/components/CloseIconButton'
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog'
import { glassModalSurfaceClass } from '../../../shared/styles/glassCapsule'

type Props = {
  tripId: string
  open: boolean
  onClose: () => void
}

function RoleToggle({
  value,
  onChange,
  disabled,
  name,
}: {
  value: TripShareRole
  onChange: (role: TripShareRole) => void
  disabled?: boolean
  name: string
}) {
  const [hasInteracted, setHasInteracted] = useState(false)

  return (
    <div
      className="relative inline-flex rounded-full border border-white/80 bg-white/60 p-1 shadow-sm backdrop-blur-xl"
      role="group"
      aria-label="权限"
    >
      {(
        [
          { id: 'viewer', label: '只读' },
          { id: 'editor', label: '可编辑' },
        ] as const
      ).map((opt) => {
        const active = value === opt.id
        return (
          <button
            key={opt.id}
            type="button"
            name={name}
            disabled={disabled}
            aria-pressed={active}
            onClick={() => {
              setHasInteracted(true)
              onChange(opt.id)
            }}
            className={`relative isolate min-w-[3.75rem] sm:min-w-[4rem] rounded-full px-3 py-1 text-xs font-medium transition-colors outline-none cursor-pointer ${
              active
                ? 'text-[var(--paper)]'
                : 'text-[var(--stone)] hover:text-[var(--ink)]'
            } disabled:opacity-50`}
          >
            {active && (
              <motion.div
                layoutId={`role-toggle-pill-${name}`}
                className="absolute inset-0 rounded-full bg-[var(--ink)] shadow-[0_2px_8px_rgba(0,0,0,0.18),inset_0_1px_1px_rgba(255,255,255,0.25)]"
                animate={
                  hasInteracted
                    ? {
                        scaleX: [1, 1.12, 0.96, 1],
                        scaleY: [1, 0.9, 1.03, 1],
                      }
                    : undefined
                }
                transition={{
                  layout: { type: 'spring', stiffness: 420, damping: 28, mass: 0.8 },
                  scaleX: { duration: 0.3, ease: [0.22, 1, 0.36, 1] },
                  scaleY: { duration: 0.3, ease: [0.22, 1, 0.36, 1] },
                }}
              />
            )}
            <span className="relative z-10">{opt.label}</span>
          </button>
        )
      })}
    </div>
  )
}

export function ShareDialog({ tripId, open, onClose }: Props) {
  const titleId = useId()
  const [shares, setShares] = useState<TripShareRow[]>([])
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<TripShareRole>('viewer')
  const [loadingList, setLoadingList] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoadingList(true)
    setError(null)
    try {
      const list = await listTripShares(tripId)
      setShares(list)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载成员失败')
    } finally {
      setLoadingList(false)
    }
  }, [tripId])

  useEffect(() => {
    if (!open) return
    void reload()
    setEmail('')
    setRole('viewer')
    setError(null)
    setInfo(null)
  }, [open, reload])

  async function onAdd(e: FormEvent) {
    e.preventDefault()
    const target = email.trim().toLowerCase()
    if (!target) return
    setBusy(true)
    setError(null)
    setInfo(null)
    try {
      await upsertTripShare(tripId, target, role)
      setEmail('')
      await reload()
      const sent = await sendShareInviteEmail(tripId, target, role)
      if (sent) {
        setInfo(`已添加 ${target}，并已发送邀请邮件。`)
      } else {
        setInfo(`已添加 ${target}。受邀人可直接用此邮箱登录查看。`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '添加成员失败')
    } finally {
      setBusy(false)
    }
  }

  const [pendingRemoveShare, setPendingRemoveShare] = useState<TripShareRow | null>(null)

  async function executeRemove() {
    if (!pendingRemoveShare) return
    const shareId = pendingRemoveShare.id
    setBusy(true)
    setError(null)
    setInfo(null)
    try {
      await removeTripShare(shareId)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : '移除成员失败')
    } finally {
      setBusy(false)
      setPendingRemoveShare(null)
    }
  }

  async function onRoleChange(shareId: string, next: TripShareRole) {
    setBusy(true)
    setError(null)
    setInfo(null)
    try {
      await updateTripShareRole(shareId, next)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : '修改权限失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      overlayZIndex={2000}
      ariaLabelledBy={titleId}
      className={`flex max-h-[min(88vh,100dvh)] max-w-lg flex-col overflow-hidden rounded-t-3xl ${glassModalSurfaceClass} sm:rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.12),inset_0_1px_2px_rgba(255,255,255,1)]`}
    >
      {/* Header Section */}
      <header className="relative shrink-0 border-b border-[var(--mist)]/60 px-5 pb-4 pt-3 sm:pt-5 sm:px-6">
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-[var(--copper)]/25 bg-[var(--copper)]/10 px-2.5 py-0.5 text-[10px] sm:text-[11px] font-semibold tracking-[0.18em] uppercase text-[var(--copper)] mb-2">
              <Sparkles size={11} strokeWidth={2.2} />
              <span>PARIS TOUR · 协作中心</span>
            </div>
            <h2 id={titleId} className="font-display text-2xl sm:text-3xl font-semibold text-[var(--ink)] tracking-tight">
              分享与协作
            </h2>
            <p className="mt-1 text-xs sm:text-sm text-[var(--stone)] leading-relaxed">
              邀请旅伴一起查看或编辑行程；所有改动将通过云端实时安全同步。
            </p>
          </div>
          <CloseIconButton onClick={onClose} className="hidden sm:flex" />
        </div>
      </header>

      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
        {/* Error Alert */}
        {error && (
          <div className="flex items-start gap-2.5 rounded-2xl border border-red-200/80 bg-red-50/70 p-3 text-xs text-red-900 shadow-sm backdrop-blur-md">
            <AlertCircle size={15} strokeWidth={1.8} className="mt-0.5 shrink-0 text-red-600" />
            <span>{error}</span>
          </div>
        )}

        {/* Success Info Alert */}
        {info && (
          <div className="flex items-start gap-2.5 rounded-2xl border border-emerald-200/80 bg-emerald-50/70 p-3 text-xs text-emerald-900 shadow-sm backdrop-blur-md">
            <CheckCircle2 size={15} strokeWidth={1.8} className="mt-0.5 shrink-0 text-emerald-600" />
            <span>{info}</span>
          </div>
        )}

        {/* Invite Form Card */}
        <form onSubmit={onAdd} className="rounded-2xl border border-white/80 bg-white/50 p-4 shadow-sm backdrop-blur-md space-y-3">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-[var(--ink)]">
            <UserPlus size={14} className="text-[var(--copper)]" />
            <span>邀请新成员</span>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1 min-w-[160px]">
              <Mail size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--stone)]" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="partner@example.com"
                className="w-full rounded-2xl border border-white/90 bg-white/80 pl-9 pr-3 py-2 text-xs sm:text-sm text-[var(--ink)] shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)] outline-none transition focus:border-[var(--copper)] focus:bg-white backdrop-blur-md"
              />
            </div>
            <RoleToggle value={role} onChange={setRole} disabled={busy} name="newRole" />
            <button
              type="submit"
              disabled={busy || !email.trim()}
              className="group relative isolate inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#b36b3c] to-[#9a542b] px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-[0_4px_14px_rgba(179,107,60,0.28),inset_0_1px_1px_rgba(255,255,255,0.4)] transition-all hover:brightness-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <span aria-hidden className="pointer-events-none absolute inset-x-2 top-0 h-[1px] rounded-full bg-gradient-to-r from-transparent via-white/80 to-transparent" />
              <Share2 size={13} strokeWidth={2.2} />
              <span>{busy ? '发送中…' : '发送邀请'}</span>
            </button>
          </div>
        </form>

        {/* Collaborators List Section */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs sm:text-sm font-semibold text-[var(--ink)] flex items-center gap-1.5">
              <Users size={14} className="text-[var(--sage)]" />
              <span>已加入旅伴</span>
            </h3>
            <span className="text-xs text-[var(--stone)]">
              {loadingList ? '加载中…' : `共 ${shares.length} 人`}
            </span>
          </div>

          <motion.div layout="position">
            <AnimatePresence mode="wait" initial={false}>
              {loadingList ? (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="space-y-2"
                  aria-hidden="true"
                >
                  {[1, 2].map((i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-2xl border border-white/80 bg-white/40 p-3.5 shadow-2xs"
                    >
                      <div className="space-y-1.5">
                        <div className="h-3.5 w-40 rounded-full day-tab-shimmer bg-[var(--mist)]" />
                        <div className="h-3 w-28 rounded-full day-tab-shimmer bg-[var(--mist)]/70" />
                      </div>
                      <div className="h-7 w-28 rounded-full day-tab-shimmer bg-[var(--mist)]/60" />
                    </div>
                  ))}
                </motion.div>
              ) : shares.length === 0 ? (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="rounded-2xl border border-dashed border-[var(--copper)]/25 bg-white/40 px-4 py-8 text-center backdrop-blur-sm space-y-2"
                >
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--copper)]/10 text-[var(--copper)] shadow-inner">
                    <Users size={20} strokeWidth={1.8} />
                  </div>
                  <p className="text-sm font-medium text-[var(--ink)]">暂无共享协作者</p>
                  <p className="text-xs text-[var(--stone)] max-w-xs mx-auto">
                    在上方输入同伴邮箱，即可一键邀请旅伴实时同步并共同规划巴黎之旅
                  </p>
                </motion.div>
              ) : (
                <motion.ul
                  key="list"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="space-y-2.5"
                >
                  {shares.map((s) => (
                    <li
                      key={s.id}
                      className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-white/80 bg-white/65 p-3.5 shadow-2xs backdrop-blur-md transition-all hover:bg-white/90 hover:shadow-xs"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--sage)]/15 font-display text-sm font-semibold text-[var(--sage)] shadow-inner">
                          {s.invitee_email.slice(0, 1).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-xs sm:text-sm font-medium text-[var(--ink)]">
                            {s.invitee_email}
                          </p>
                          <p className="text-[11px] text-[var(--stone)]">
                            {s.role === 'editor' ? '✨ 可共同编辑行程内容' : '👁️ 仅查看，不可修改'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-black/5">
                        <RoleToggle
                          name={`role-${s.id}`}
                          value={s.role}
                          disabled={busy}
                          onChange={(next) => void onRoleChange(s.id, next)}
                        />
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setPendingRemoveShare(s)}
                          className="inline-flex items-center gap-1 rounded-full border border-red-200/60 bg-red-50/50 hover:bg-red-100/80 px-2.5 py-1 text-xs font-medium text-red-600/90 transition-colors disabled:opacity-50 cursor-pointer active:scale-95"
                        >
                          <Trash2 size={12} />
                          <span>移除</span>
                        </button>
                      </div>
                    </li>
                  ))}
                </motion.ul>
              )}
            </AnimatePresence>
          </motion.div>
        </section>
      </div>

      <ConfirmDialog
        open={Boolean(pendingRemoveShare)}
        onClose={() => setPendingRemoveShare(null)}
        onConfirm={executeRemove}
        title="移除协作者"
        description={`确定移除「${pendingRemoveShare?.invitee_email || '该成员'}」对当前行程的协作权限吗？`}
        confirmText="移除"
        tone="danger"
        icon="trash"
      />
    </BottomSheet>
  )
}
