import type { ReactNode } from 'react'
import { useAuth } from '../authContext'
import { LoginPage } from './LoginPage'
import { LoadingIndicator } from '../../../shared/components/LoadingIndicator'
import { isCloudSyncEnabled, isLocalhost } from '../../../shared/lib/supabase'

export function AuthGate({ children }: { children: ReactNode }) {
  const { status, tripReady, error } = useAuth()

  // Localhost local-only mode: skip auth entirely
  if (!isCloudSyncEnabled() && isLocalhost()) {
    return <>{children}</>
  }

  if (status === 'unconfigured') {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <h1 className="font-display text-3xl">需要配置 Supabase</h1>
        <p className="mt-3 text-sm text-[var(--stone)]">
          请在 <code className="text-[var(--ink)]">.env</code> 中设置{' '}
          <code className="text-[var(--ink)]">VITE_SUPABASE_URL</code> 与{' '}
          <code className="text-[var(--ink)]">VITE_SUPABASE_ANON_KEY</code>
          ，并在 Supabase SQL Editor 执行{' '}
          <code className="text-[var(--ink)]">supabase/schema.sql</code>。
        </p>
      </div>
    )
  }

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <LoadingIndicator label="正在验证登录状态…" />
      </div>
    )
  }

  if (status === 'signed_out' || status === 'not_allowlisted') {
    return <LoginPage />
  }

  if (!tripReady) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <LoadingIndicator label="正在加载行程存档…" />
      </div>
    )
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
