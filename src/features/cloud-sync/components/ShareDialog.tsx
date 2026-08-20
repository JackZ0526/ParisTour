import { useCallback, useEffect, useId, useState, type FormEvent } from 'react'
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
      className="inline-flex rounded-lg border border-[var(--mist)] bg-[var(--mist)]/40 p-0.5"
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
            className={`min-w-[4.5rem] rounded-md px-3 py-1.5 text-xs font-medium transition ${
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
  const [busy, setBusy] = useState(false)
  const [loadingList, setLoadingList] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoadingList(true)
    try {
      const rows = await listTripShares(tripId)
      setShares(rows)
    } finally {
      setLoadingList(false)
    }
  }, [tripId])

  useEffect(() => {
    if (!open) return
    setError(null)
    setInfo(null)
    void reload().catch((err) => {
      setError(err instanceof Error ? err.message : '加载共享列表失败')
    })
  }, [open, reload])

  async function onAdd(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setInfo(null)
    const invitee = email.trim().toLowerCase()
    try {
      await upsertTripShare(tripId, invitee, role)
      setEmail('')
      await reload()
      try {
        const mail = await sendShareInviteEmail(tripId, invitee, role)
        if (mail.sent) {
          setInfo(`已发送邀请邮件到 ${invitee}（${mail.registered ? '登录' : '注册'}链接）。`)
        } else if (mail.warning) {
          setInfo(`${mail.warning}${mail.inviteUrl ? ` 链接：${mail.inviteUrl}` : ''}`)
        } else {
          setInfo('已添加分享；邀请邮件未能发送。')
        }
      } catch (mailErr) {
        setInfo(
          `已添加分享，但邮件发送失败：${
            mailErr instanceof Error ? mailErr.message : '未知错误'
          }`,
        )
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '添加失败')
    } finally {
      setBusy(false)
    }
  }

  async function onRoleChange(shareId: string, next: TripShareRole) {
    setBusy(true)
    setError(null)
    try {
      await updateTripShareRole(shareId, next)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新权限失败')
    } finally {
      setBusy(false)
    }
  }

  async function onRemove(shareId: string) {
    setBusy(true)
    setError(null)
    try {
      await removeTripShare(shareId)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : '移除失败')
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
      className="flex max-h-[min(88vh,100dvh)] max-w-lg flex-col overflow-hidden rounded-t-3xl bg-[var(--paper)] shadow-[var(--shadow)] sm:rounded-2xl"
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
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>
        )}
        {info && (
          <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{info}</p>
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
                className="min-w-0 flex-1 rounded-xl border border-[var(--mist)] bg-white/80 px-3 py-2 text-sm text-[var(--ink)] outline-none transition focus:border-[var(--sage)]"
              />
              <RoleToggle value={role} onChange={setRole} disabled={busy} name="newRole" />
              <button
                type="submit"
                disabled={busy || !email.trim()}
                className="rounded-xl bg-[var(--ink)] px-4 py-2 text-sm font-medium text-[var(--paper)] transition hover:bg-[var(--ink)]/90 disabled:opacity-50"
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

            {shares.length === 0 && !loadingList ? (
              <div className="border border-dashed border-[var(--mist)] px-4 py-8 text-center">
                <p className="text-sm text-[var(--stone)]">还没有共享对象</p>
                <p className="mt-1 text-xs text-[var(--stone)]/80">
                  上方输入邮箱即可邀请同伴一起看行程
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-[var(--mist)] border-y border-[var(--mist)]">
                {shares.map((s) => (
                  <li
                    key={s.id}
                    className="flex flex-col gap-3 py-3.5 sm:flex-row sm:items-center sm:justify-between"
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
                        onClick={() => void onRemove(s.id)}
                        className="px-2 py-1.5 text-xs text-[var(--copper)] transition hover:underline disabled:opacity-50"
                      >
                        移除
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
    </BottomSheet>
  )
}
