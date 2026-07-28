import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { getSupabase, isSupabaseConfigured } from '../lib/supabase'
import {
  applyAccessibleTripLocally,
  flushTripCloudSave,
  getProfileAllowlisted,
  isEmailAllowlisted,
  listAccessibleTrips,
  pickPreferredTrip,
  rememberLastTripId,
  scheduleTripCloudSave,
  subscribeTripRealtime,
  type AccessibleTrip,
  type TripRole,
} from '../services/tripCloud'

type AuthStatus =
  | 'loading'
  | 'unconfigured'
  | 'signed_out'
  | 'not_allowlisted'
  | 'ready'

type AuthContextValue = {
  status: AuthStatus
  session: Session | null
  user: User | null
  email: string
  allowlisted: boolean
  trips: AccessibleTrip[]
  activeTrip: AccessibleTrip | null
  role: TripRole | null
  canEdit: boolean
  tripReady: boolean
  error: string | null
  signIn: (email: string, password: string) => Promise<void>
  /** Resolves with whether the user must confirm email before signing in. */
  signUp: (email: string, password: string) => Promise<{ needsEmailConfirm: boolean }>
  signOut: () => Promise<void>
  switchTrip: (tripId: string) => Promise<void>
  refreshTrips: () => Promise<void>
  notifyTripChanged: () => void
}

function mapAuthError(err: { message?: string; code?: string; status?: number }): string {
  const msg = (err.message || '').trim()
  const code = (err.code || '').toLowerCase()
  const lower = msg.toLowerCase()

  if (
    code === 'email_not_confirmed' ||
    /email not confirmed/i.test(lower)
  ) {
    return '邮箱尚未确认。请打开注册时收到的确认邮件，点击链接后再登录。'
  }
  if (
    code === 'invalid_credentials' ||
    /invalid login credentials/i.test(lower) ||
    /invalid email or password/i.test(lower)
  ) {
    return '邮箱或密码不正确。若刚注册，请先确认邮箱后再试。'
  }
  if (code === 'user_already_exists' || /already registered|already been registered/i.test(lower)) {
    return '该邮箱已注册，请直接登录。'
  }
  if (/rate limit|too many requests|over_email_send_rate_limit/i.test(lower) || code === 'over_email_send_rate_limit') {
    return '邮件发送过于频繁（Supabase 免费邮箱约每小时 2 封）。请约 1 小时后再试，或在 Dashboard 关闭「Confirm email」。'
  }
  if (/password/i.test(lower) && /weak|at least|characters/i.test(lower)) {
    return '密码不符合要求（至少 6 位）。'
  }
  if (/signup.*disabled|signups not allowed/i.test(lower)) {
    return '当前不允许注册，请联系管理员。'
  }
  return msg || '登录失败，请稍后重试。'
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(() =>
    isSupabaseConfigured() ? 'loading' : 'unconfigured',
  )
  const [session, setSession] = useState<Session | null>(null)
  const [allowlisted, setAllowlisted] = useState(false)
  const [trips, setTrips] = useState<AccessibleTrip[]>([])
  const [activeTripId, setActiveTripId] = useState<string | null>(null)
  const [tripReady, setTripReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [bootKey, setBootKey] = useState(0)

  const user = session?.user ?? null
  const email = (user?.email || '').toLowerCase()

  const activeTrip = useMemo(
    () => trips.find((t) => t.id === activeTripId) ?? trips[0] ?? null,
    [trips, activeTripId],
  )
  const role = activeTrip?.role ?? null
  const canEdit = role === 'owner' || role === 'editor'

  const bootstrapSession = useCallback(async (next: Session | null) => {
    setTripReady(false)
    setSession(next)

    if (!next?.user) {
      setAllowlisted(false)
      setTrips([])
      setActiveTripId(null)
      setStatus((prev) => (prev === 'not_allowlisted' ? 'not_allowlisted' : 'signed_out'))
      return
    }

    setError(null)

    const userEmail = (next.user.email || '').toLowerCase()
    let listed = false
    try {
      listed =
        (await getProfileAllowlisted(next.user.id)) ||
        (await isEmailAllowlisted(userEmail))
    } catch (err) {
      console.warn(err)
      listed = false
    }

    if (!listed) {
      setAllowlisted(false)
      setTrips([])
      setActiveTripId(null)
      setError('该邮箱未在邀请白名单中，无法使用本应用。')
      setStatus('not_allowlisted')
      try {
        await getSupabase().auth.signOut({ scope: 'local' })
      } catch {
        /* ignore */
      }
      return
    }

    setAllowlisted(true)
    try {
      const accessible = await listAccessibleTrips(next.user.id, userEmail)
      setTrips(accessible)
      const preferred = pickPreferredTrip(accessible, next.user.id)
      if (preferred) {
        applyAccessibleTripLocally(preferred)
        setActiveTripId(preferred.id)
        rememberLastTripId(next.user.id, preferred.id)
      }
      setStatus('ready')
      setTripReady(true)
      setBootKey((k) => k + 1)
    } catch (err) {
      console.error(err)
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : err instanceof Error
            ? err.message
            : '加载行程失败'
      setError(msg || '加载行程失败')
      setStatus('ready')
      setTripReady(true)
    }
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setStatus('unconfigured')
      return
    }

    let cancelled = false
    const sb = getSupabase()

    sb.auth
      .getSession()
      .then(({ data }) => {
        if (!cancelled) void bootstrapSession(data.session)
      })
      .catch((err) => {
        console.error(err)
        if (!cancelled) setStatus('signed_out')
      })

    const { data: sub } = sb.auth.onAuthStateChange((event, nextSession) => {
      // Initial session handled above; avoid double-bootstrap on TOKEN_REFRESHED.
      if (event === 'INITIAL_SESSION') return
      if (event === 'TOKEN_REFRESHED') {
        setSession(nextSession)
        return
      }
      void bootstrapSession(nextSession)
    })

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [bootstrapSession])

  const signIn = useCallback(async (emailInput: string, password: string) => {
    setError(null)
    setStatus('loading')
    const normalized = emailInput.trim().toLowerCase()
    const listed = await isEmailAllowlisted(normalized)
    if (!listed) {
      setStatus('not_allowlisted')
      const msg = '该邮箱未在邀请白名单中，无法登录。'
      setError(msg)
      throw new Error(msg)
    }
    const sb = getSupabase()
    const { error: authError } = await sb.auth.signInWithPassword({
      email: normalized,
      password,
    })
    if (authError) {
      setStatus('signed_out')
      const msg = mapAuthError(authError)
      setError(msg)
      throw new Error(msg)
    }
  }, [])

  const signUp = useCallback(async (emailInput: string, password: string) => {
    setError(null)
    const normalized = emailInput.trim().toLowerCase()
    const listed = await isEmailAllowlisted(normalized)
    if (!listed) {
      setStatus('not_allowlisted')
      const msg = '该邮箱未在邀请白名单中，无法注册。'
      setError(msg)
      throw new Error(msg)
    }
    if (password.length < 6) {
      throw new Error('密码至少 6 位。')
    }
    const sb = getSupabase()
    const { data, error: authError } = await sb.auth.signUp({
      email: normalized,
      password,
    })
    if (authError) {
      const msg = mapAuthError(authError)
      setError(msg)
      throw new Error(msg)
    }
    // Supabase returns no session when "Confirm email" is enabled.
    const needsEmailConfirm = !data.session
    return { needsEmailConfirm }
  }, [])

  const signOut = useCallback(async () => {
    if (user && activeTripId) {
      rememberLastTripId(user.id, activeTripId)
    }
    if (canEdit && activeTrip) {
      await flushTripCloudSave()
    }
    const sb = getSupabase()
    await sb.auth.signOut()
  }, [activeTrip, activeTripId, canEdit, user])

  const refreshTrips = useCallback(async () => {
    if (!user || !email) return
    const accessible = await listAccessibleTrips(user.id, email)
    setTrips(accessible)
    if (activeTripId && !accessible.some((t) => t.id === activeTripId)) {
      const preferred = pickPreferredTrip(accessible, user.id)
      if (preferred) {
        applyAccessibleTripLocally(preferred)
        setActiveTripId(preferred.id)
        rememberLastTripId(user.id, preferred.id)
        setBootKey((k) => k + 1)
      }
    }
  }, [user, email, activeTripId])

  const switchTrip = useCallback(
    async (tripId: string) => {
      if (!user || !email) return
      if (canEdit && activeTrip) {
        await flushTripCloudSave()
      }
      const accessible = await listAccessibleTrips(user.id, email)
      setTrips(accessible)
      const next = accessible.find((t) => t.id === tripId)
      if (!next) throw new Error('找不到该行程')
      applyAccessibleTripLocally(next)
      setActiveTripId(next.id)
      rememberLastTripId(user.id, next.id)
      setBootKey((k) => k + 1)
      setTripReady(true)
    },
    [user, email, canEdit, activeTrip],
  )

  const notifyTripChanged = useCallback(() => {
    if (!activeTrip || !canEdit) return
    scheduleTripCloudSave(activeTrip.id, true)
  }, [activeTrip, canEdit])

  useEffect(() => {
    if (status !== 'ready' || !activeTripId || !tripReady) return
    return subscribeTripRealtime(activeTripId, () => {
      setBootKey((k) => k + 1)
    })
  }, [status, activeTripId, tripReady])

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      user,
      email,
      allowlisted,
      trips,
      activeTrip,
      role,
      canEdit,
      tripReady,
      error,
      signIn,
      signUp,
      signOut,
      switchTrip,
      refreshTrips,
      notifyTripChanged,
    }),
    [
      status,
      session,
      user,
      email,
      allowlisted,
      trips,
      activeTrip,
      role,
      canEdit,
      tripReady,
      error,
      signIn,
      signUp,
      signOut,
      switchTrip,
      refreshTrips,
      notifyTripChanged,
    ],
  )

  // Remount children when active trip changes so App re-reads localStorage.
  return (
    <AuthContext.Provider value={value}>
      <div key={bootKey} className="contents">
        {children}
      </div>
    </AuthContext.Provider>
  )
}
