import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  getSupabase,
  isCloudSyncEnabled,
  isLocalhost,
  isSupabaseConfigured,
} from '../../shared/lib/supabase'
import { normalizeAuthEmail } from './devTestAccount'
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
} from '../cloud-sync/services/tripCloud'
import { subscribeLlmArtifacts } from '../../shared/services/llm/llmArtifactStore'
import {
  getThemePreference,
  setThemePreference,
  subscribeTheme,
} from '../../shared/services/themeStore'
import { emptyTripSnapshot } from '../cloud-sync/services/tripSnapshot'
import {
  loadProfileThemePreference,
  saveProfileThemePreference,
} from './services/themePreferenceCloud'
import {
  hydrateAccountAvatar,
} from './services/avatarPreferenceCloud'
import {
  hydrateAccountNickname,
} from './services/nicknamePreferenceCloud'
import {
  AuthContext,
  type AuthContextValue,
  type AuthStatus,
} from './authContext'

function localDebugTrip(): AccessibleTrip {
  return {
    id: 'local-trip',
    title: '本地调试行程',
    ownerId: 'local-user',
    isPrimary: true,
    role: 'owner',
    updatedAt: new Date().toISOString(),
    snapshot: emptyTripSnapshot(),
    label: '本地调试行程',
  }
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

async function hydrateAccountThemePreference(userId: string): Promise<void> {
  try {
    const cloudPreference = await loadProfileThemePreference(userId)
    if (cloudPreference) {
      setThemePreference(cloudPreference)
      return
    }

    // Supports profiles created before the theme column was populated.
    await saveProfileThemePreference(userId, getThemePreference())
  } catch (err) {
    // Theme sync must never block authentication or trip loading.
    console.warn('[profile-theme] unable to load account preference', err)
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const isLocalDebug = !isCloudSyncEnabled() && isLocalhost()

  const [status, setStatus] = useState<AuthStatus>(() => {
    if (isLocalDebug) return 'ready'
    return isSupabaseConfigured() ? 'loading' : 'unconfigured'
  })
  const [session, setSession] = useState<Session | null>(null)
  const [allowlisted, setAllowlisted] = useState(() => isLocalDebug)
  const [trips, setTrips] = useState<AccessibleTrip[]>(() =>
    isLocalDebug ? [localDebugTrip()] : [],
  )
  const [activeTripId, setActiveTripId] = useState<string | null>(() =>
    isLocalDebug ? 'local-trip' : null,
  )
  const [tripReady, setTripReady] = useState(() => isLocalDebug)
  const [error, setError] = useState<string | null>(null)
  const [bootKey, setBootKey] = useState(0)
  const [tripSyncEpoch, setTripSyncEpoch] = useState(0)

  const user = session?.user ?? null
  const email = (user?.email || (isLocalDebug ? 'local@localhost' : '')).toLowerCase()

  const activeTrip = useMemo(
    () => trips.find((t) => t.id === activeTripId) ?? trips[0] ?? null,
    [trips, activeTripId],
  )
  const role = activeTrip?.role ?? (isLocalDebug ? 'owner' : null)
  const canEdit = isLocalDebug || role === 'owner' || role === 'editor'

  const statusRef = useRef(status)
  const tripReadyRef = useRef(tripReady)
  const sessionUserIdRef = useRef<string | null>(session?.user?.id ?? null)
  statusRef.current = status
  tripReadyRef.current = tripReady
  sessionUserIdRef.current = session?.user?.id ?? null

  const activeBootstrapUserIdRef = useRef<string | null | undefined>(undefined)
  const bootstrapSequenceRef = useRef(0)

  const bootstrapSession = useCallback(async (next: Session | null) => {
    const nextUserId = next?.user?.id ?? null
    if (activeBootstrapUserIdRef.current === nextUserId) {
      return
    }
    const sequence = ++bootstrapSequenceRef.current
    activeBootstrapUserIdRef.current = nextUserId
    const isCurrentBootstrap = () => bootstrapSequenceRef.current === sequence

    try {
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
      if (!isCurrentBootstrap()) return

      if (!listed) {
        setAllowlisted(false)
        setTrips([])
        setActiveTripId(null)
        setError('该邮箱尚未获邀请，暂时无法使用。')
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
        // Load trips before any preference write that may refresh the auth token.
        const accessible = await listAccessibleTrips(next.user.id, userEmail)
        if (!isCurrentBootstrap()) return
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

        // Safe, non-blocking background hydration. Avatar metadata cleanup may
        // refresh the token, so it deliberately runs after RLS-protected trips.
        void Promise.allSettled([
          hydrateAccountThemePreference(next.user.id),
          hydrateAccountAvatar(next.user.id, userEmail),
          hydrateAccountNickname(next.user.id, userEmail),
        ])
      } catch (err) {
        if (!isCurrentBootstrap()) return
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
    } finally {
      if (isCurrentBootstrap()) {
        activeBootstrapUserIdRef.current = undefined
      }
    }
  }, [])

  useEffect(() => {
    if (!isCloudSyncEnabled()) {
      if (isLocalhost()) {
        setStatus('ready')
        setTripReady(true)
        setAllowlisted(true)
        setTrips([localDebugTrip()])
        setActiveTripId('local-trip')
      } else {
        setStatus('unconfigured')
      }
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

    let bootstrapTimer: number | null = null
    const scheduleBootstrap = (nextSession: Session | null) => {
      if (bootstrapTimer !== null) window.clearTimeout(bootstrapTimer)
      bootstrapTimer = window.setTimeout(() => {
        bootstrapTimer = null
        if (!cancelled) void bootstrapSession(nextSession)
      }, 0)
    }

    const { data: sub } = sb.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'INITIAL_SESSION') return
      const isSameUserReady =
        Boolean(nextSession?.user?.id) &&
        statusRef.current === 'ready' &&
        tripReadyRef.current &&
        sessionUserIdRef.current === nextSession?.user?.id
      const resumeSignedIn = event === 'SIGNED_IN' && isSameUserReady

      if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED' || resumeSignedIn) {
        setSession(nextSession)
        return
      }
      // Supabase warns that awaiting or starting client API calls directly in
      // this callback can deadlock auth. Defer all database work until the
      // auth handler has returned and released its internal lock.
      scheduleBootstrap(nextSession)
    })

    return () => {
      cancelled = true
      if (bootstrapTimer !== null) window.clearTimeout(bootstrapTimer)
      sub.subscription.unsubscribe()
    }
  }, [bootstrapSession])

  useEffect(() => {
    const userId = user?.id
    if (
      !isCloudSyncEnabled() ||
      status !== 'ready' ||
      !allowlisted ||
      !userId
    ) {
      return
    }

    return subscribeTheme(() => {
      saveProfileThemePreference(userId, getThemePreference()).catch((err) => {
        console.warn('[profile-theme] unable to save account preference', err)
      })
    })
  }, [allowlisted, status, user?.id])

  const signIn = useCallback(async (emailInput: string, password: string) => {
    setError(null)
    setStatus('loading')
    const normalized = normalizeAuthEmail(emailInput)
    const listed = await isEmailAllowlisted(normalized)
    if (!listed) {
      setStatus('not_allowlisted')
      const msg = '该邮箱尚未获邀请，无法登录。'
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
    const normalized = normalizeAuthEmail(emailInput)
    const listed = await isEmailAllowlisted(normalized)
    if (!listed) {
      setStatus('not_allowlisted')
      const msg = '该邮箱尚未获邀请，无法注册。'
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

  const notifyTripChanged = useCallback((opts?: {
    force?: boolean
    artifactsOnly?: boolean
    allowEmptyTrip?: boolean
  }) => {
    if (!activeTrip || !canEdit) return
    scheduleTripCloudSave(activeTrip.id, true, opts)
  }, [activeTrip, canEdit])

  // Durable generated artifacts live in the trip snapshot — autosave on writes.
  useEffect(() => {
    return subscribeLlmArtifacts(() => {
      notifyTripChanged({ artifactsOnly: true })
    })
  }, [notifyTripChanged])

  useEffect(() => {
    if (status !== 'ready' || !activeTripId || !tripReady) return
    return subscribeTripRealtime(activeTripId, () => {
      // Soft sync: refresh localStorage-backed state in App without remounting to Day 1.
      setTripSyncEpoch((k) => k + 1)
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
      tripSyncEpoch,
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
      tripSyncEpoch,
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
