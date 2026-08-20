import { useCallback, useEffect, useId, useState, type FormEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
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
  return (
    <div
      className="inline-flex rounded-full border border-white/80 bg-white/55 p-1 shadow-sm backdrop-blur-md"
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
            onClick={() => onChange(opt.id)}
            className={`min-w-[4rem] rounded-full px-3 py-1 text-xs font-medium transition ${
              active
                ? 'bg-[var(--ink)] text-[var(--paper)] shadow-sm'
                : 'text-[var(--stone)] hover:text-[var(--ink)]'
            } disabled:opacity-50`}
          >
            {opt.label}
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
      className={`flex max-h-[min(88vh,100dvh)] max-w-lg flex-col overflow-hidden rounded-t-3xl ${glassModalSurfaceClass} sm:rounded-3xl`}
    >
      <header className="relative shrink-0 border-b border-[var(--mist)] px-5 pb-4 pt-2 sm:pt-5 sm:px-6">
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="font-display text-2xl text-[var(--ink)]">
              分享与协作
            </h2>
            <p className="mt-1 text-sm text-[var(--stone)]">
              邀请旅伴一起查看或编辑行程；修改会实时同步到云端。
            </p>
          </div>
          <CloseIconButton onClick={onClose} className="hidden sm:flex" />
        </div>
      </header>

      <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-6">
        {error && (
          <p className="rounded-xl bg-red-50/80 border border-red-200/60 px-4 py-3 text-sm text-red-800 backdrop-blur-sm">{error}</p>
        )}
        {info && (
          <p className="rounded-xl bg-emerald-50/80 border border-emerald-200/60 px-4 py-3 text-sm text-emerald-900 backdrop-blur-sm">{info}</p>
        )}

        <form onSubmit={onAdd} className="space-y-3">
          <label className="block text-xs font-medium text-[var(--stone)]">
            邀请新成员
            <div className="mt-1.5 flex flex-wrap gap-2">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="partner@example.com"
                className="min-w-0 flex-1 rounded-xl border border-white/80 bg-white/70 px-3 py-2 text-sm text-[var(--ink)] shadow-[inset_0_1px_1px_rgba(255,255,255,1)] outline-none transition focus:border-[var(--sage)] backdrop-blur-md"
              />
              <RoleToggle value={role} onChange={setRole} disabled={busy} name="newRole" />
              <button
                type="submit"
                disabled={busy || !email.trim()}
                className="rounded-xl bg-[var(--ink)] px-4 py-2 text-sm font-medium text-[var(--paper)] shadow-sm transition hover:bg-[var(--ink)]/90 disabled:opacity-50"
              >
                {busy ? '处理中…' : '发送邀请'}
              </button>
            </div>
          </label>
        </form>

        <section>
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-medium text-[var(--ink)]">已分享</h3>
            <span className="text-xs text-[var(--stone)]">
              {loadingList ? '加载中…' : `${shares.length} 人`}
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
                  className="divide-y divide-[var(--mist)] border-y border-[var(--mist)]"
                  aria-hidden="true"
                >
                  {[1, 2].map((i) => (
                    <div
                      key={i}
                      className="flex flex-col gap-3 py-3.5 sm:flex-row sm:items-center sm:justify-between px-1"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex h-5 items-center">
                          <div className="h-3.5 w-40 rounded-full day-tab-shimmer bg-[var(--mist)]" />
                        </div>
                        <div className="mt-0.5 flex h-4 items-center">
                          <div className="h-3 w-28 rounded-full day-tab-shimmer bg-[var(--mist)]/70" />
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-36 rounded-lg day-tab-shimmer bg-[var(--mist)]/60" />
                        <div className="h-7 w-9 rounded-md day-tab-shimmer bg-[var(--mist)]/40" />
                      </div>
                    </div>
                  ))}
                </motion.div>
              ) : shares.length === 0 ? (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="border border-dashed border-[var(--mist)] px-4 py-8 text-center"
                >
                  <p className="text-sm text-[var(--stone)]">还没有共享对象</p>
                  <p className="mt-1 text-xs text-[var(--stone)]/80">
                    上方输入邮箱即可邀请同伴一起看行程
                  </p>
                </motion.div>
              ) : (
                <motion.ul
                  key="list"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="divide-y divide-[var(--mist)] border-y border-[var(--mist)]"
                >
                  {shares.map((s) => (
                    <li
                      key={s.id}
                      className="flex flex-col gap-3 py-3.5 sm:flex-row sm:items-center sm:justify-between transition hover:bg-[var(--mist)]/20 px-1 rounded-lg"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-[var(--ink)]">
                          {s.invitee_email}
                        </p>
                        <p className="mt-0.5 text-xs text-[var(--stone)]">
                          {s.role === 'editor' ? '可编辑行程内容' : '仅查看，不可修改'}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
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
                          className="px-2 py-1.5 text-xs text-[var(--copper)] transition hover:underline disabled:opacity-50"
                        >
                          移除
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
