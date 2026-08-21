import type { ReactNode } from 'react'
import { useAuth } from '../authContext'
import { LoginPage } from './LoginPage'
import { AuthLoadingScreen } from './AuthLoadingScreen'
import { isCloudSyncEnabled, isLocalhost } from '../../../shared/lib/supabase'

export function AuthGate({ children }: { children: ReactNode }) {
  const { status, tripReady, error } = useAuth()

  // Localhost local-only mode: skip auth entirely
  if (!isCloudSyncEnabled() && isLocalhost()) {
    return <>{children}</>
  }

  if (status === 'unconfigured') {
    return <AuthLoadingScreen mode="unconfigured" />
  }

  if (status === 'loading') {
    return <AuthLoadingScreen mode="auth" />
  }

  if (status === 'signed_out' || status === 'not_allowlisted') {
    return <LoginPage />
  }

  if (!tripReady) {
    return <AuthLoadingScreen mode="trip" />
  }

  return (
    <>
      {error && (
        <div className="bg-[var(--copper)]/15 px-4 py-2 text-center text-sm text-[var(--ink)]">
          {error}
        </div>
      )}
      {children}
    </>
  )
}
