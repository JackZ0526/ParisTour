import { useMemo, useState, type FormEvent } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../AuthProvider'

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
      <div className="animate-fade-up rounded-2xl border border-white/60 bg-[var(--card)] p-6 shadow-[var(--shadow)] sm:rounded-[28px] sm:p-10">
        <p className="text-xs uppercase tracking-[0.28em] text-[var(--sage)]">Paris Tour</p>
        <h1 className="font-display mt-2 text-3xl text-[var(--ink)] sm:text-4xl">邀请制登录</h1>
        <p className="mt-3 text-sm text-[var(--stone)]">
          需受邀邮箱才能注册与使用。登录后可打开你的行程，也可查看他人分享给你的行程。
        </p>

        {status === 'not_allowlisted' && (
          <p className="mt-4 rounded-xl border border-[var(--copper)]/40 bg-[var(--copper)]/10 px-3 py-2 text-sm text-[var(--ink)]">
            该邮箱尚未获邀请。请联系行程主人邀请你。
          </p>
        )}

        <div className="mt-6 flex gap-2 text-sm">
          <button
            type="button"
            className={`rounded-full px-4 py-1.5 ${
              mode === 'signin'
                ? 'bg-[var(--sage)] text-white'
                : 'border border-[var(--stone)]/30 text-[var(--stone)]'
            }`}
            onClick={() => {
              setMode('signin')
              setError(null)
            }}
          >
            登录
          </button>
          <button
            type="button"
            className={`rounded-full px-4 py-1.5 ${
              mode === 'signup'
                ? 'bg-[var(--sage)] text-white'
                : 'border border-[var(--stone)]/30 text-[var(--stone)]'
            }`}
            onClick={() => {
              setMode('signup')
              setError(null)
              setInfo(null)
            }}
          >
            注册
          </button>
        </div>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <label className="block text-sm">
            <span className="text-[var(--stone)]">邮箱</span>
            <input
              type="text"
              inputMode="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[var(--stone)]/25 bg-white/70 px-3 py-2 outline-none focus:border-[var(--sage)]"
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
                className="w-full rounded-xl border border-[var(--stone)]/25 bg-white/70 py-2 pl-3 pr-11 outline-none focus:border-[var(--sage)]"
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
            className="w-full rounded-full bg-[var(--ink)] px-4 py-2.5 text-sm text-[var(--paper)] transition hover:bg-[var(--sage)] disabled:opacity-60"
          >
            {busy ? '请稍候…' : mode === 'signin' ? '进入行程' : '创建账号'}
          </button>
        </form>
      </div>
    </div>
  )
}
