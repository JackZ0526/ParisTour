import { useCallback, useEffect, useId, useState, type FormEvent } from 'react'
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion'
import {
  AlertCircle,
  CheckCircle2,
  LoaderCircle,
  Mail,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react'
import {
  getCachedTripShares,
  listTripShares,
  removeTripShare,
  sendShareInviteEmail,
  sharesAreEqual,
  updateTripShareRole,
  upsertTripShare,
  type TripShareRole,
  type TripShareRow,
} from '../services/tripCloud'
import {
  batchLoadProfileAvatars,
} from '../../auth/services/avatarPreferenceCloud'
import {
  batchLoadProfileNicknames,
} from '../../auth/services/nicknamePreferenceCloud'
import { getUserAvatar, setUserAvatar, type UserAvatar } from '../../auth/services/avatarStore'
import { getUserNickname, setUserNickname } from '../../auth/services/nicknameStore'
import { getSupabase, isCloudSyncEnabled } from '../../../shared/lib/supabase'
import { UserAvatarView } from '../../../shared/components/UserAvatarView'
import { BottomSheet } from '../../../shared/components/BottomSheet'
import { CloseIconButton } from '../../../shared/components/CloseIconButton'
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog'
import { glassModalSurfaceClass } from '../../../shared/styles/glassCapsule'
import { useTranslation } from '../../../shared/i18n'

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
  const { t } = useTranslation()
  const [hasInteracted, setHasInteracted] = useState(false)

  return (
    <LayoutGroup id={`role-toggle-${name}`}>
      <div
        className="relative inline-flex rounded-full border border-white/80 dark:border-white/10 bg-white/60 dark:bg-white/10 p-1 shadow-sm backdrop-blur-xl"
        role="group"
        aria-label={t('app.roleGroupAria')}
      >
        {(
          [
            { id: 'viewer', label: t('auth.roleViewer') },
            { id: 'editor', label: t('auth.roleEditor') },
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
                if (active || disabled) return
                setHasInteracted(true)
                onChange(opt.id)
              }}
              className={`relative isolate min-w-[3.75rem] sm:min-w-[4rem] rounded-full px-3 py-1 text-xs font-medium transition-colors outline-none cursor-pointer ${
                active
                  ? 'text-[var(--paper)] dark:text-white'
                  : 'text-[var(--stone)] hover:text-[var(--ink)] dark:text-zinc-400 dark:hover:text-zinc-100'
              } disabled:cursor-default`}
            >
              {active && (
                <motion.div
                  layoutId={`role-toggle-pill-${name}`}
                  layoutDependency={value}
                  className="absolute inset-0 rounded-full bg-[var(--ink)] dark:bg-[var(--copper)] shadow-[0_2px_8px_rgba(0,0,0,0.18),inset_0_1px_1px_rgba(255,255,255,0.25)] dark:shadow-[0_2px_10px_rgba(212,131,84,0.35)]"
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
    </LayoutGroup>
  )
}

export function ShareDialog({ tripId, open, onClose }: Props) {
  const { t, locale } = useTranslation()
  const titleId = useId()
  const [shares, setShares] = useState<TripShareRow[]>(() => getCachedTripShares(tripId) || [])
  const [companionAvatars, setCompanionAvatars] = useState<Record<string, UserAvatar>>({})
  const [companionNicknames, setCompanionNicknames] = useState<Record<string, string>>({})
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<TripShareRole>('viewer')
  const [loadingList, setLoadingList] = useState(false)
  const [inviteBusy, setInviteBusy] = useState(false)
  const [updatingRoleId, setUpdatingRoleId] = useState<string | null>(null)
  const [removeBusy, setRemoveBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const reload = useCallback(async (showLoading = true) => {
    if (showLoading) setLoadingList(true)
    setError(null)
    try {
      const list = await listTripShares(tripId)
      setShares((prev) => (sharesAreEqual(prev, list) ? prev : list))
      const emails = list.map((s) => s.invitee_email)
      if (emails.length) {
        void batchLoadProfileAvatars(emails).then((avatars) => {
          setCompanionAvatars((prev) => ({ ...prev, ...avatars }))
        })
        void batchLoadProfileNicknames(emails).then((nicknames) => {
          setCompanionNicknames((prev) => ({ ...prev, ...nicknames }))
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('cloud.membersLoadFailed'))
    } finally {
      if (showLoading) setLoadingList(false)
    }
  }, [tripId, locale])

  useEffect(() => {
    if (!open) return
    const cached = getCachedTripShares(tripId)
    if (cached) {
      setShares(cached)
      const emails = cached.map((s) => s.invitee_email)
      const localAvatars: Record<string, UserAvatar> = {}
      const localNicknames: Record<string, string> = {}
      for (const e of emails) {
        localAvatars[e.toLowerCase()] = getUserAvatar(e)
        const n = getUserNickname(e)
        if (n) localNicknames[e.toLowerCase()] = n
      }
      setCompanionAvatars(localAvatars)
      setCompanionNicknames(localNicknames)
      void reload(false)
    } else {
      void reload(true)
    }
    setEmail('')
    setRole('viewer')
    setError(null)
    setInfo(null)
  }, [open, tripId, reload])

  // Live Realtime updates for companion avatars & nicknames while dialog is open
  useEffect(() => {
    if (!open || !isCloudSyncEnabled()) return
    const sb = getSupabase()
    const channel = sb
      .channel(`profiles-live-${tripId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles' },
        (payload) => {
          const row = payload.new as { email?: string; display_name?: string; avatar_url?: string }
          if (row?.email) {
            const norm = row.email.trim().toLowerCase()
            if (row.display_name !== undefined) {
              const cleanNick = row.display_name?.trim() || ''
              setCompanionNicknames((prev) => ({ ...prev, [norm]: cleanNick }))
              setUserNickname(cleanNick, norm)
            }
            if (row.avatar_url !== undefined) {
              const avatar: UserAvatar = row.avatar_url
                ? { type: 'image', value: row.avatar_url }
                : { type: 'initial', value: norm.charAt(0).toUpperCase() }
              setCompanionAvatars((prev) => ({ ...prev, [norm]: avatar }))
              setUserAvatar(avatar, norm)
            }
          }
        },
      )
      .subscribe()

    return () => {
      void sb.removeChannel(channel)
    }
  }, [open, tripId])

  async function onAdd(e: FormEvent) {
    e.preventDefault()
    const target = email.trim().toLowerCase()
    if (!target) return
    setInviteBusy(true)
    setError(null)
    setInfo(null)
    try {
      await upsertTripShare(tripId, target, role)
      setEmail('')
      await reload(false)
      const mail = await sendShareInviteEmail(tripId, target, role)
      if (mail.sent) {
        setInfo(t('cloud.memberAddedWithInvite', { target }))
      } else {
        setInfo(t('cloud.memberAddedNoInvite', { target }))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('cloud.memberAddFailed'))
    } finally {
      setInviteBusy(false)
    }
  }

  const [pendingRemoveShare, setPendingRemoveShare] = useState<TripShareRow | null>(null)

  async function executeRemove() {
    if (!pendingRemoveShare) return
    const shareId = pendingRemoveShare.id
    setRemoveBusy(true)
    setError(null)
    setInfo(null)
    try {
      await removeTripShare(shareId)
      setShares((current) => current.filter((share) => share.id !== shareId))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('cloud.memberRemoveFailed'))
    } finally {
      setRemoveBusy(false)
      setPendingRemoveShare(null)
    }
  }

  async function onRoleChange(shareId: string, next: TripShareRole) {
    const previous = shares.find((share) => share.id === shareId)?.role
    if (!previous || previous === next || updatingRoleId) return

    setUpdatingRoleId(shareId)
    setShares((current) =>
      current.map((share) =>
        share.id === shareId ? { ...share, role: next } : share,
      ),
    )
    setError(null)
    setInfo(null)
    try {
      await updateTripShareRole(shareId, next)
    } catch (err) {
      setShares((current) =>
        current.map((share) =>
          share.id === shareId ? { ...share, role: previous } : share,
        ),
      )
      setError(err instanceof Error ? err.message : t('cloud.permissionUpdateFailed'))
    } finally {
      setUpdatingRoleId(null)
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
            <h2 id={titleId} className="font-display text-2xl sm:text-3xl font-semibold text-[var(--ink)] tracking-tight">
              {t('cloud.shareTitle')}
            </h2>
            <p className="mt-1 text-xs sm:text-sm text-[var(--stone)] leading-relaxed">
              {t('cloud.shareSubtitle')}
            </p>
          </div>
          <CloseIconButton onClick={onClose} className="hidden sm:flex" />
        </div>
      </header>

      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
        {/* Error Alert */}
        {error && (
          <div className="flex items-start gap-2.5 rounded-2xl border border-red-200/80 dark:border-red-900/40 bg-red-50/70 dark:bg-red-950/30 p-3 text-xs text-red-900 dark:text-red-300 shadow-sm backdrop-blur-md">
            <AlertCircle size={15} strokeWidth={1.8} className="mt-0.5 shrink-0 text-red-600 dark:text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Success Info Alert */}
        {info && (
          <div className="flex items-start gap-2.5 rounded-2xl border border-emerald-200/80 dark:border-emerald-900/40 bg-emerald-50/70 dark:bg-emerald-950/30 p-3 text-xs text-emerald-900 dark:text-emerald-300 shadow-sm backdrop-blur-md">
            <CheckCircle2 size={15} strokeWidth={1.8} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>{info}</span>
          </div>
        )}

        {/* Invite Form Card */}
        <form onSubmit={onAdd} className="rounded-2xl border border-white/80 dark:border-white/10 bg-white/50 dark:bg-white/5 p-4 shadow-sm backdrop-blur-md space-y-3">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-[var(--ink)]">
            <UserPlus size={14} className="text-[var(--copper)]" />
            <span>{t('cloud.inviteMember')}</span>
          </label>
          <div className="relative w-full">
            <Mail size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--stone)] dark:text-zinc-400" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="partner@example.com"
              className="w-full rounded-2xl border border-white/90 dark:border-white/10 bg-white/85 dark:bg-white/5 pl-9 pr-3 py-2.5 text-xs sm:text-sm text-[var(--ink)] dark:text-zinc-100 placeholder:text-[var(--stone)]/60 dark:placeholder:text-zinc-500 shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)] outline-none transition focus:border-[var(--copper)] focus:bg-white dark:focus:bg-white/10 backdrop-blur-md"
            />
          </div>
          <div className="flex items-center justify-between gap-2 pt-0.5">
            <RoleToggle value={role} onChange={setRole} disabled={inviteBusy} name="newRole" />
            <button
              type="submit"
              disabled={inviteBusy || !email.trim()}
              aria-busy={inviteBusy}
              className="group relative isolate inline-flex w-28 shrink-0 items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-[#b36b3c] to-[#9a542b] dark:from-[var(--copper)] dark:to-[#9a542b] py-2 text-xs sm:text-sm font-semibold text-white shadow-[0_4px_14px_rgba(179,107,60,0.28),inset_0_1px_1px_rgba(255,255,255,0.4)] dark:shadow-[0_4px_14px_rgba(212,131,84,0.3)] transition-[filter,opacity,transform] hover:brightness-105 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <span aria-hidden className="pointer-events-none absolute inset-x-2 top-0 h-[1px] rounded-full bg-gradient-to-r from-transparent via-white/80 dark:via-white/30 to-transparent" />
              {inviteBusy ? (
                <LoaderCircle size={14} strokeWidth={2.2} className="animate-spin" />
              ) : (
                <UserPlus size={14} strokeWidth={2.2} />
              )}
              <span>{inviteBusy ? t('common.loading') : t('cloud.sendInvite')}</span>
            </button>
          </div>
        </form>

        {/* Collaborators List Section */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs sm:text-sm font-semibold text-[var(--ink)] flex items-center gap-1.5">
              <Users size={14} className="text-[var(--sage)]" />
              <span>{t('auth.roleCollaborator')}</span>
            </h3>
            <span className="text-xs text-[var(--stone)] dark:text-zinc-400">
              {loadingList ? t('common.loading') : `${shares.length}`}
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
                      className="flex items-center justify-between rounded-2xl border border-white/80 dark:border-white/10 bg-white/40 dark:bg-white/5 p-3.5 shadow-2xs"
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
                  className="rounded-2xl border border-dashed border-[var(--copper)]/25 dark:border-white/10 bg-white/40 dark:bg-white/5 px-4 py-8 text-center backdrop-blur-sm space-y-2"
                >
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--copper)]/10 text-[var(--copper)] shadow-inner">
                    <Users size={20} strokeWidth={1.8} />
                  </div>
                  <p className="text-sm font-medium text-[var(--ink)]">{t('cloud.shareTitle')}</p>
                  <p className="text-xs text-[var(--stone)] dark:text-zinc-400 max-w-xs mx-auto">
                    {t('cloud.shareSubtitle')}
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
                  {shares.map((s) => {
                    const normEmail = s.invitee_email.toLowerCase()
                    const compAvatar = companionAvatars[normEmail]
                    const compNickname = companionNicknames[normEmail]

                    return (
                      <li
                        key={s.id}
                        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-white/80 dark:border-white/10 bg-white/65 dark:bg-[#18201c]/80 p-3.5 shadow-2xs backdrop-blur-md transition-all hover:bg-white/90 dark:hover:bg-[#202b26] hover:shadow-xs"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <UserAvatarView
                            avatar={compAvatar}
                            email={s.invitee_email}
                            name={compNickname}
                            size="md"
                            shape="squircle"
                            className="shrink-0"
                          />
                          <div className="min-w-0">
                            <p className="truncate text-xs sm:text-sm font-semibold text-[var(--ink)]">
                              {compNickname ? (
                                <>
                                  <span>{compNickname}</span>
                                  <span className="font-normal text-[var(--stone)] dark:text-zinc-400 text-[11px] sm:text-xs ml-1">
                                    ({s.invitee_email})
                                  </span>
                                </>
                              ) : (
                                s.invitee_email
                              )}
                            </p>
                            <p className="text-[11px] text-[var(--stone)] dark:text-zinc-400">
                              {s.role === 'editor' ? t('auth.roleEditor') : t('auth.roleViewer')}
                            </p>
                          </div>
                        </div>
                      <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-black/5 dark:border-white/10">
                        <RoleToggle
                          name={`role-${s.id}`}
                          value={s.role}
                          disabled={updatingRoleId !== null || removeBusy}
                          onChange={(next) => void onRoleChange(s.id, next)}
                        />
                        <button
                          type="button"
                          disabled={updatingRoleId !== null || removeBusy}
                          onClick={() => setPendingRemoveShare(s)}
                          className="inline-flex items-center gap-1 rounded-full border border-red-200/60 dark:border-red-800/40 bg-red-50/50 dark:bg-red-950/40 hover:bg-red-100/80 dark:hover:bg-red-900/50 px-2.5 py-1 text-xs font-medium text-red-600/90 dark:text-red-300 transition-colors disabled:cursor-default cursor-pointer active:scale-95"
                        >
                          <Trash2 size={12} />
                          <span>{t('common.delete')}</span>
                        </button>
                      </div>
                    </li>
                  )
                })}
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
        busy={removeBusy}
        title={t('cloud.removeMember')}
        description={`${pendingRemoveShare?.invitee_email || ''}`}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        tone="danger"
        icon="trash"
      />
    </BottomSheet>
  )
}
