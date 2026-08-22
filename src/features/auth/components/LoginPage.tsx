import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Eye, EyeOff, AlertCircle, CheckCircle2, Loader2, Sparkles } from 'lucide-react'
import { motion } from 'framer-motion'
import { useAuth } from '../authContext'
import { glassModalSurfaceClass } from '../../../shared/styles/glassCapsule'
import { useTranslation } from '../../../shared/i18n'

function readAuthDeepLink(): { mode: 'signin' | 'signup'; email: string } {
  try {
    const q = new URLSearchParams(window.location.search)
    const auth = (q.get('auth') || '').toLowerCase()
    const email = (q.get('email') || '').trim()
    const mode: 'signin' | 'signup' = auth === 'signup' ? 'signup' : 'signin'
    return { mode, email }
  } catch {
    return { mode: 'signin', email: '' }
  }
}

function clearAuthDeepLink() {
  try {
    const url = new URL(window.location.href)
    if (!url.searchParams.has('auth') && !url.searchParams.has('email')) return
    url.searchParams.delete('auth')
    url.searchParams.delete('email')
    const next = `${url.pathname}${url.search}${url.hash}`
    window.history.replaceState({}, '', next || '/')
  } catch {
    /* ignore */
  }
}

export function LoginPage() {
  const { t } = useTranslation()
  const deepLink = useMemo(() => readAuthDeepLink(), [])
  const { signIn, signUp, status, error: authError } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>(deepLink.mode)
  const [hasSwitched, setHasSwitched] = useState(false)
  const [email, setEmail] = useState(deepLink.email)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(() =>
    deepLink.email
      ? deepLink.mode === 'signup'
        ? '你收到了行程邀请。请用该邮箱注册后即可查看分享的行程。'
        : '你收到了行程邀请。请登录后即可查看分享的行程。'
      : null,
  )

  // Prevent background scrolling / bounce on iOS & mobile browsers
  useEffect(() => {
    const prevBodyOverflow = document.body.style.overflow
    const prevDocOverflow = document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevBodyOverflow
      document.documentElement.style.overflow = prevDocOverflow
    }
  }, [])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setInfo(null)
    try {
      if (mode === 'signin') {
        await signIn(email, password)
        clearAuthDeepLink()
      } else {
        const { needsEmailConfirm } = await signUp(email, password)
        if (needsEmailConfirm) {
          setInfo(
            `注册成功。请打开邮箱 ${email.trim().toLowerCase()}，点击确认链接后再登录。若未收到邮件，请检查垃圾箱。`,
          )
        } else {
          setInfo('注册成功，可直接登录。')
        }
        setMode('signin')
        setHasSwitched(true)
        clearAuthDeepLink()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-[var(--paper)] px-4 py-4 select-none [touch-action:none]">
      {/* Ambient background glows for glassmorphism reflections */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 -z-10 h-[480px] w-[480px] -translate-x-1/2 rounded-full bg-gradient-to-br from-[#a8bcae]/20 via-[#d4bd91]/15 to-transparent dark:from-[#2e4237]/40 dark:via-[#b56a3c]/15 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-24 right-1/4 -z-10 h-[360px] w-[360px] rounded-full bg-gradient-to-tl from-[#d7a98a]/15 via-white/20 to-transparent dark:from-[#443224]/30 dark:via-[#1e2b24]/30 blur-3xl"
      />

      <div
        className={`mx-auto w-full max-w-lg ${glassModalSurfaceClass} max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain rounded-3xl p-6 sm:rounded-[36px] sm:p-10 select-text [touch-action:pan-y] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}
      >
        {/* Brand pill badge */}
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--sage)]/25 bg-[var(--sage)]/10 dark:border-[var(--sage)]/35 dark:bg-[var(--sage)]/15 px-3 py-1 text-[10.5px] font-medium tracking-[0.24em] text-[var(--sage)] dark:text-[#a9cdb8] uppercase">
            <Sparkles size={11} strokeWidth={2} className="shrink-0" />
            Paris Tour
          </span>
        </div>

        {/* French editorial heading */}
        <h1 className="font-display mt-3 text-3xl font-normal tracking-tight text-[var(--ink)] sm:text-4xl">
          邀请制登录
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--stone)] dark:text-zinc-400">
          需受邀邮箱才能注册与使用。登录后可打开你的行程，也可查看他人分享给你的行程。
        </p>

        {/* Not allowlisted notice banner */}
        {status === 'not_allowlisted' && (
          <div className="mt-4 flex items-start gap-2.5 rounded-2xl border border-[var(--copper)]/30 dark:border-[#d48354]/35 bg-[#f6e8de]/70 dark:bg-[#341d14]/70 p-3 text-xs leading-relaxed text-[var(--ink)] dark:text-[#f8dcd0] shadow-sm backdrop-blur-md">
            <AlertCircle size={15} strokeWidth={1.8} className="mt-0.5 shrink-0 text-[var(--copper)] dark:text-[#e09164]" />
            <span>该邮箱尚未获邀请。请联系行程主人添加你的邮箱邀请。</span>
          </div>
        )}

        {/* Animated Segmented Switcher */}
        <div
          className="relative mt-6 inline-flex rounded-full border border-white/80 dark:border-white/12 bg-white/70 dark:bg-black/35 p-1 shadow-sm dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)] backdrop-blur-xl text-sm"
          role="tablist"
          aria-label="登录或注册"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'signin'}
            className="relative isolate rounded-full px-5 py-1.5 font-medium transition-colors outline-none cursor-pointer"
            onClick={() => {
              setHasSwitched(true)
              setMode('signin')
              setError(null)
            }}
          >
            {mode === 'signin' && (
              <motion.span
                layoutId="auth-mode-pill"
                className="absolute inset-0 z-0 rounded-full bg-[var(--ink)] dark:bg-white/16 dark:border dark:border-white/20 shadow-[0_2px_8px_rgba(35,42,38,0.22),inset_0_1px_1.5px_rgba(255,255,255,0.2)] dark:shadow-[0_2px_10px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.25)]"
                animate={
                  hasSwitched
                    ? {
                        scaleX: [1, 1.18, 0.94, 1],
                        scaleY: [1, 0.86, 1.04, 1],
                      }
                    : undefined
                }
                transition={{
                  layout: { type: 'spring', stiffness: 420, damping: 28, mass: 0.8 },
                  scaleX: { duration: 0.32, ease: [0.22, 1, 0.36, 1] },
                  scaleY: { duration: 0.32, ease: [0.22, 1, 0.36, 1] },
                }}
              />
            )}
            <span
              className={`relative z-10 transition-colors duration-200 ${
                mode === 'signin'
                  ? 'font-semibold text-[var(--paper)] dark:text-white'
                  : 'text-[var(--stone)] dark:text-zinc-400 hover:text-[var(--ink)] dark:hover:text-zinc-200'
              }`}
            >
              {t('auth.signIn')}
            </span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'signup'}
            className="relative isolate rounded-full px-5 py-1.5 font-medium transition-colors outline-none cursor-pointer"
            onClick={() => {
              setHasSwitched(true)
              setMode('signup')
              setError(null)
              setInfo(null)
            }}
          >
            {mode === 'signup' && (
              <motion.span
                layoutId="auth-mode-pill"
                className="absolute inset-0 z-0 rounded-full bg-[var(--ink)] dark:bg-white/16 dark:border dark:border-white/20 shadow-[0_2px_8px_rgba(35,42,38,0.22),inset_0_1px_1.5px_rgba(255,255,255,0.2)] dark:shadow-[0_2px_10px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.25)]"
                animate={
                  hasSwitched
                    ? {
                        scaleX: [1, 1.18, 0.94, 1],
                        scaleY: [1, 0.86, 1.04, 1],
                      }
                    : undefined
                }
                transition={{
                  layout: { type: 'spring', stiffness: 420, damping: 28, mass: 0.8 },
                  scaleX: { duration: 0.32, ease: [0.22, 1, 0.36, 1] },
                  scaleY: { duration: 0.32, ease: [0.22, 1, 0.36, 1] },
                }}
              />
            )}
            <span
              className={`relative z-10 transition-colors duration-200 ${
                mode === 'signup'
                  ? 'font-semibold text-[var(--paper)] dark:text-white'
                  : 'text-[var(--stone)] dark:text-zinc-400 hover:text-[var(--ink)] dark:hover:text-zinc-200'
              }`}
            >
              {t('auth.signUp')}
            </span>
          </button>
        </div>

        {/* Login / Register Form */}
        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <label className="block space-y-1.5 text-xs font-medium text-[var(--stone)] dark:text-zinc-300">
            <span>{t('auth.email')}</span>
            <input
              type="text"
              inputMode="email"
              autoComplete="email"
              enterKeyHint="send"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your-name@example.com"
              className="w-full rounded-2xl border border-white/90 dark:border-white/10 bg-white/70 dark:bg-black/30 px-4 py-3 text-sm text-[var(--ink)] dark:text-white shadow-[inset_0_1px_1.5px_rgba(0,0,0,0.03),0_1px_2px_rgba(255,255,255,0.8)] dark:shadow-[inset_0_1.5px_3px_rgba(0,0,0,0.5)] backdrop-blur-sm transition-all placeholder:text-[var(--stone)]/45 dark:placeholder:text-zinc-500 focus:border-[var(--copper)]/60 dark:focus:border-[var(--copper)] focus:bg-white dark:focus:bg-black/45 focus:shadow-[0_0_0_3px_rgba(181,106,60,0.08)] dark:focus:shadow-[0_0_0_3px_rgba(181,106,60,0.22)] outline-none"
            />
          </label>

          <div className="block space-y-1.5 text-xs font-medium text-[var(--stone)] dark:text-zinc-300">
            <span>{t('auth.password')}</span>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                required
                minLength={mode === 'signup' ? 6 : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('auth.passwordPlaceholder')}
                className="w-full rounded-2xl border border-white/90 dark:border-white/10 bg-white/70 dark:bg-black/30 py-3 pl-4 pr-12 text-sm text-[var(--ink)] dark:text-white shadow-[inset_0_1px_1.5px_rgba(0,0,0,0.03),0_1px_2px_rgba(255,255,255,0.8)] dark:shadow-[inset_0_1.5px_3px_rgba(0,0,0,0.5)] backdrop-blur-sm transition-all placeholder:text-[var(--stone)]/45 dark:placeholder:text-zinc-500 focus:border-[var(--copper)]/60 dark:focus:border-[var(--copper)] focus:bg-white dark:focus:bg-black/45 focus:shadow-[0_0_0_3px_rgba(181,106,60,0.08)] dark:focus:shadow-[0_0_0_3px_rgba(181,106,60,0.22)] outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-xl text-[var(--stone)] dark:text-zinc-400 transition hover:bg-[var(--mist)]/60 dark:hover:bg-white/10 hover:text-[var(--ink)] dark:hover:text-white active:scale-95 cursor-pointer"
              >
                {showPassword ? (
                  <EyeOff size={16} strokeWidth={1.8} aria-hidden />
                ) : (
                  <Eye size={16} strokeWidth={1.8} aria-hidden />
                )}
              </button>
            </div>
          </div>

          {/* Error alert */}
          {(error || authError) && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-2xl border border-[var(--copper)]/35 dark:border-red-500/35 bg-[#f6e8de]/80 dark:bg-red-950/45 p-3.5 text-xs leading-relaxed text-[var(--ink)] dark:text-red-200 shadow-sm backdrop-blur-md"
            >
              <AlertCircle size={15} strokeWidth={1.8} className="mt-0.5 shrink-0 text-[var(--copper)] dark:text-red-400" />
              <span>{error || authError}</span>
            </div>
          )}

          {/* Info status alert */}
          {info && (
            <div
              role="status"
              className="flex items-start gap-2.5 rounded-2xl border border-[var(--sage)]/35 dark:border-emerald-500/35 bg-[#e7efe9]/80 dark:bg-emerald-950/45 p-3.5 text-xs leading-relaxed text-[var(--ink)] dark:text-emerald-200 shadow-sm backdrop-blur-md"
            >
              <CheckCircle2 size={15} strokeWidth={1.8} className="mt-0.5 shrink-0 text-[var(--sage)] dark:text-emerald-400" />
              <span>{info}</span>
            </div>
          )}

          {/* Submit button */}
          <button
            type="submit"
            disabled={busy}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--ink)]/90 dark:border-[var(--copper)]/40 bg-[var(--ink)] dark:bg-gradient-to-r dark:from-[#b56a3c] dark:to-[#964f26] px-4 py-3.5 text-sm font-semibold text-[var(--paper)] dark:text-white shadow-[0_4px_14px_rgba(35,42,38,0.18),inset_0_1px_1.5px_rgba(255,255,255,0.22)] dark:shadow-[0_6px_20px_rgba(181,106,60,0.35),inset_0_1px_1.5px_rgba(255,255,255,0.3)] transition-all hover:bg-[var(--ink)]/95 dark:hover:brightness-110 active:scale-[0.98] disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed"
          >
            {busy ? (
              <>
                <Loader2 size={16} className="animate-spin text-[var(--gold)] dark:text-white" />
                <span>{t('auth.signingIn')}</span>
              </>
            ) : mode === 'signin' ? (
              t('auth.signIn')
            ) : (
              t('auth.signUp')
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
