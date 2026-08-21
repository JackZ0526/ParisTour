import { useMemo, useState, type FormEvent } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { motion } from 'framer-motion'
import { useAuth } from '../authContext'

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
  const deepLink = useMemo(() => readAuthDeepLink(), [])
  const { signIn, signUp, status, error: authError } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>(deepLink.mode)
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
        clearAuthDeepLink()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-10 sm:py-16">
      <div className="animate-fade-up rounded-3xl border border-white/80 bg-white/75 p-6 shadow-[0_12px_40px_rgba(0,0,0,0.06),inset_0_1px_2px_rgba(255,255,255,1)] backdrop-blur-2xl sm:rounded-[32px] sm:p-10">
        <p className="text-xs uppercase tracking-[0.28em] text-[var(--sage)] font-semibold">Paris Tour</p>
        <h1 className="font-display mt-2 text-3xl text-[var(--ink)] sm:text-4xl">邀请制登录</h1>
        <p className="mt-3 text-sm text-[var(--stone)]">
          需受邀邮箱才能注册与使用。登录后可打开你的行程，也可查看他人分享给你的行程。
        </p>

        {status === 'not_allowlisted' && (
          <p className="mt-4 rounded-xl border border-[var(--copper)]/40 bg-[var(--copper)]/10 px-3 py-2 text-sm text-[var(--ink)]">
            该邮箱尚未获邀请。请联系行程主人邀请你。
          </p>
        )}

        <div
          className="relative mt-6 inline-flex rounded-full border border-white/80 bg-white/70 p-1 shadow-sm backdrop-blur-xl text-sm"
          role="tablist"
          aria-label="登录或注册"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'signin'}
            className="relative isolate rounded-full px-5 py-1.5 font-medium transition-colors outline-none"
            onClick={() => {
              setMode('signin')
              setError(null)
            }}
          >
            {mode === 'signin' && (
              <motion.span
                layoutId="auth-mode-pill"
                className="absolute inset-0 z-0 rounded-full bg-[var(--ink)] shadow-[0_2px_8px_rgba(35,42,38,0.22),inset_0_1px_1.5px_rgba(255,255,255,0.2)]"
                transition={{
                  type: 'spring',
                  stiffness: 450,
                  damping: 32,
                  mass: 0.8,
                }}
              />
            )}
            <span
              className={`relative z-10 transition-colors duration-200 ${
                mode === 'signin'
                  ? 'font-semibold text-[var(--paper)]'
                  : 'text-[var(--stone)] hover:text-[var(--ink)]'
              }`}
            >
              登录
            </span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'signup'}
            className="relative isolate rounded-full px-5 py-1.5 font-medium transition-colors outline-none"
            onClick={() => {
              setMode('signup')
              setError(null)
              setInfo(null)
            }}
          >
            {mode === 'signup' && (
              <motion.span
                layoutId="auth-mode-pill"
                className="absolute inset-0 z-0 rounded-full bg-[var(--ink)] shadow-[0_2px_8px_rgba(35,42,38,0.22),inset_0_1px_1.5px_rgba(255,255,255,0.2)]"
                transition={{
                  type: 'spring',
                  stiffness: 450,
                  damping: 32,
                  mass: 0.8,
                }}
              />
            )}
            <span
              className={`relative z-10 transition-colors duration-200 ${
                mode === 'signup'
                  ? 'font-semibold text-[var(--paper)]'
                  : 'text-[var(--stone)] hover:text-[var(--ink)]'
              }`}
            >
              注册
            </span>
          </button>
        </div>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <label className="block text-sm">
            <span className="text-[var(--stone)]">邮箱</span>
            <input
              type="text"
              inputMode="email"
              autoComplete="email"
              enterKeyHint="send"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-xl border border-white/80 bg-white/70 px-3.5 py-2.5 shadow-[inset_0_1px_1px_rgba(255,255,255,1)] outline-none transition focus:border-[var(--sage)] backdrop-blur-md"
            />
          </label>
          <div className="block text-sm">
            <span className="text-[var(--stone)]">密码</span>
            <div className="relative mt-1">
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                required
                minLength={mode === 'signup' ? 6 : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-white/80 bg-white/70 py-2.5 pl-3.5 pr-11 shadow-[inset_0_1px_1px_rgba(255,255,255,1)] outline-none transition focus:border-[var(--sage)] focus:bg-white focus:shadow-[0_0_0_3px_rgba(99,136,112,0.1)] backdrop-blur-md"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? '隐藏密码' : '显示密码'}
                aria-pressed={showPassword}
                className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-[var(--stone)] transition hover:bg-[var(--mist)]/60 hover:text-[var(--ink)]"
              >
                {showPassword ? (
                  <EyeOff size={18} strokeWidth={1.8} aria-hidden />
                ) : (
                  <Eye size={18} strokeWidth={1.8} aria-hidden />
                )}
              </button>
            </div>
          </div>

          {(error || authError) && (
            <p
              role="alert"
              className="rounded-xl border border-[var(--copper)]/35 bg-[var(--copper)]/10 px-3 py-2 text-sm text-[var(--ink)]"
            >
              {error || authError}
            </p>
          )}
          {info && (
            <p
              role="status"
              className="rounded-xl border border-[var(--sage)]/35 bg-[var(--sage)]/10 px-3 py-2 text-sm text-[var(--ink)]"
            >
              {info}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-2xl border border-[var(--ink)]/90 bg-[var(--ink)] px-4 py-3 text-sm font-medium text-[var(--paper)] shadow-[0_4px_14px_rgba(35,42,38,0.18),inset_0_1px_1.5px_rgba(255,255,255,0.22)] transition-all hover:bg-[var(--ink)]/95 active:scale-[0.98] disabled:opacity-60"
          >
            {busy ? '请稍候…' : mode === 'signin' ? '进入行程' : '创建账号'}
          </button>
        </form>
      </div>
    </div>
  )
}
