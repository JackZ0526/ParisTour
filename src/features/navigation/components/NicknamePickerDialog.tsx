import { useEffect, useId, useState, type FormEvent } from 'react'
import { Check, Edit3, Loader2, Sparkles, X } from 'lucide-react'
import { BottomSheet } from '../../../shared/components/BottomSheet'
import { CloseIconButton } from '../../../shared/components/CloseIconButton'
import { glassModalSurfaceClass } from '../../../shared/styles/glassCapsule'
import { useUserNickname } from '../../auth/services/nicknameStore'
import { saveProfileNickname } from '../../auth/services/nicknamePreferenceCloud'
import { useAuth } from '../../auth/authContext'
import { useTranslation } from '../../../shared/i18n'

type Props = {
  open: boolean
  onClose: () => void
  email?: string | null
}

const MAX_NICKNAME_LENGTH = 24

export function NicknamePickerDialog({ open, onClose, email }: Props) {
  const { t, locale } = useTranslation()
  const titleId = useId()
  const { user } = useAuth()
  const { nickname, setNickname } = useUserNickname(email)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setDraft(nickname || '')
      setError(null)
    }
  }, [open, nickname])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const clean = draft.trim()
    if (clean.length > MAX_NICKNAME_LENGTH) {
      setError(
        locale === 'en'
          ? `Nickname cannot exceed ${MAX_NICKNAME_LENGTH} characters`
          : `昵称不能超过 ${MAX_NICKNAME_LENGTH} 个字符`,
      )
      return
    }

    setSaving(true)
    setError(null)
    try {
      setNickname(clean)
      if (user?.id) {
        await saveProfileNickname(user.id, clean)
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : (locale === 'en' ? 'Failed to save nickname' : '保存昵称失败'))
    } finally {
      setSaving(false)
    }
  }

  function handleClear() {
    setDraft('')
  }

  const defaultDisplayName = email ? email.split('@')[0] : (locale === 'en' ? 'Traveler' : '旅人')

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      overlayZIndex={2000}
      ariaLabelledBy={titleId}
      className={`flex max-h-[min(88vh,100dvh)] max-w-md flex-col overflow-hidden rounded-t-3xl ${glassModalSurfaceClass} sm:rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.12),inset_0_1px_2px_rgba(255,255,255,1)]`}
    >
      <header className="relative shrink-0 border-b border-[var(--mist)]/60 px-5 pb-4 pt-3 sm:pt-5 sm:px-6">
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <h2
              id={titleId}
              className="font-display text-2xl sm:text-3xl font-semibold text-[var(--ink)] tracking-tight flex items-center gap-2"
            >
              <Edit3 size={22} className="text-[var(--copper)]" />
              <span>{t('auth.editNickname')}</span>
            </h2>
            <p className="mt-1 text-xs sm:text-sm text-[var(--stone)] leading-relaxed">
              {t('auth.nicknamePlaceholder')}
            </p>
          </div>
          <CloseIconButton onClick={onClose} className="hidden sm:flex" />
        </div>
      </header>

      <form onSubmit={handleSubmit} className="flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
        {error && (
          <div className="rounded-2xl border border-red-200/80 dark:border-red-900/40 bg-red-50/70 dark:bg-red-950/30 p-3 text-xs text-red-900 dark:text-red-300 shadow-sm backdrop-blur-md">
            {error}
          </div>
        )}

        <div className="space-y-2">
          <label className="block text-xs font-semibold text-[var(--ink)]">
            {t('auth.nickname')}
          </label>
          <div className="relative">
            <input
              type="text"
              maxLength={MAX_NICKNAME_LENGTH}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t('auth.nicknamePlaceholder')}
              autoFocus
              className="w-full rounded-2xl border border-white/90 dark:border-white/10 bg-white/85 dark:bg-white/5 px-4 py-3 text-sm text-[var(--ink)] dark:text-zinc-100 placeholder:text-[var(--stone)]/60 dark:placeholder:text-zinc-500 shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)] outline-none transition focus:border-[var(--copper)] focus:bg-white dark:focus:bg-white/10 backdrop-blur-md pr-16"
            />
            {draft && (
              <button
                type="button"
                onClick={handleClear}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-[var(--stone)] hover:text-[var(--ink)] dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors"
                title={t('common.reset')}
              >
                <X size={16} />
              </button>
            )}
          </div>
          <div className="flex items-center justify-between px-1 text-[11px] text-[var(--stone)] dark:text-zinc-400">
            <span>
              {draft.length} / {MAX_NICKNAME_LENGTH}
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-white/80 dark:border-white/10 bg-white/50 dark:bg-white/5 p-4 shadow-sm backdrop-blur-md space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--ink)]">
            <Sparkles size={14} className="text-[var(--copper)]" />
            <span>{t('auth.nickname')}</span>
          </div>
          <div className="flex items-center gap-3 rounded-xl bg-white/60 dark:bg-white/5 p-3 border border-white/60 dark:border-white/5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--copper)]/20 to-[var(--sage)]/20 text-base font-bold text-[var(--copper)]">
              {(draft.trim() || defaultDisplayName).charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[var(--ink)]">
                {draft.trim() || defaultDisplayName}
              </p>
              <p className="truncate text-xs text-[var(--stone)] dark:text-zinc-400">
                {email || 'partner@example.com'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-full border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/5 px-4 py-2 text-xs font-medium text-[var(--ink)] dark:text-zinc-200 transition hover:bg-white/80 dark:hover:bg-white/10 active:scale-95 cursor-pointer disabled:cursor-not-allowed"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={saving}
            className="group relative isolate inline-flex items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-[#b36b3c] to-[#9a542b] dark:from-[var(--copper)] dark:to-[#9a542b] px-5 py-2 text-xs font-semibold text-white shadow-[0_4px_14px_rgba(179,107,60,0.28),inset_0_1px_1px_rgba(255,255,255,0.4)] dark:shadow-[0_4px_14px_rgba(212,131,84,0.3)] transition-[filter,opacity,transform] hover:brightness-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {saving ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Check size={14} strokeWidth={2.2} />
            )}
            <span>{saving ? t('common.loading') : t('common.save')}</span>
          </button>
        </div>
      </form>
    </BottomSheet>
  )
}
