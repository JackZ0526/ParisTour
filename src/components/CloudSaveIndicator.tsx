import { useEffect, useState } from 'react'
import {
  getCloudSaveError,
  getCloudSaveStatus,
  subscribeCloudSaveStatus,
  type CloudSaveStatus,
} from '../services/tripCloud'

function labelFor(status: CloudSaveStatus, error: string | null): string {
  switch (status) {
    case 'pending':
      return '更改待保存…'
    case 'saving':
      return '正在保存…'
    case 'saved':
      return '已保存'
    case 'error':
      return error ? `保存失败：${error}` : '保存失败'
    default:
      return ''
  }
}

export function CloudSaveIndicator() {
  const [status, setStatus] = useState<CloudSaveStatus>(() => getCloudSaveStatus())
  const [error, setError] = useState<string | null>(() => getCloudSaveError())

  useEffect(() => {
    return subscribeCloudSaveStatus(() => {
      setStatus(getCloudSaveStatus())
      setError(getCloudSaveError())
    })
  }, [])

  if (status === 'idle') return null

  const label = labelFor(status, error)

  return (
    <div
      role="status"
      aria-live="polite"
      className={`cloud-save-indicator inline-flex max-w-[min(100%,240px)] items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
        status === 'error'
          ? 'border-[var(--copper)]/40 bg-[var(--copper)]/10 text-[var(--ink)]'
          : status === 'saved'
            ? 'border-[var(--sage)]/35 bg-[var(--sage)]/12 text-[var(--sage)]'
            : 'border-[var(--stone)]/25 bg-[var(--card)] text-[var(--stone)]'
      }`}
    >
      {status === 'pending' && (
        <span className="cloud-save-dots" aria-hidden>
          <i />
          <i />
          <i />
        </span>
      )}
      {status === 'saving' && (
        <svg
          className="loading-spinner h-3.5 w-3.5 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden
        >
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
          <path
            d="M21 12a9 9 0 0 0-9-9"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
      )}
      {status === 'saved' && (
        <svg
          className="cloud-save-check h-3.5 w-3.5 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M20 6L9 17l-5-5" />
        </svg>
      )}
      {status === 'error' && (
        <svg
          className="h-3.5 w-3.5 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v5M12 16h.01" />
        </svg>
      )}
      <span className="truncate">{label}</span>
    </div>
  )
}
