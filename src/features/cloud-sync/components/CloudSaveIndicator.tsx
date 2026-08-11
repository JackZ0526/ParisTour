import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  getCloudSaveError,
  getCloudSaveStatus,
  getCloudSyncStatus,
  subscribeCloudSaveStatus,
  subscribeCloudSyncStatus,
  type CloudSaveStatus,
  type CloudSyncStatus,
} from '../services/tripCloud'
import { ActivityBars, SyncOrbitIcon } from '../../../components/LoadingIndicator'

type ToastKind = 'save' | 'sync'

function saveLabel(status: CloudSaveStatus, error: string | null): string {
  switch (status) {
    case 'pending':
      return '即将保存…'
    case 'saving':
      return '正在保存…'
    case 'saved':
      return '行程已保存'
    case 'error':
      return error ? `保存失败：${error}` : '保存失败'
    default:
      return ''
  }
}

function syncLabel(status: CloudSyncStatus): string {
  switch (status) {
    case 'syncing':
      return '正在同步同伴更改…'
    case 'synced':
      return '行程已同步'
    default:
      return ''
  }
}

function FloppyIcon({ spinning }: { spinning?: boolean }) {
  return (
    <svg
      className={`cloud-save-floppy ${spinning ? 'is-spinning' : ''}`}
      width="28"
      height="28"
      viewBox="0 0 32 32"
      aria-hidden
    >
      <rect x="3" y="3" width="26" height="26" rx="2" fill="currentColor" opacity="0.92" />
      <rect x="7" y="3" width="14" height="10" rx="1" fill="var(--paper)" opacity="0.92" />
      <rect x="9" y="5" width="10" height="2" fill="currentColor" opacity="0.35" />
      <rect x="9" y="8" width="7" height="2" fill="currentColor" opacity="0.25" />
      <rect x="8" y="16" width="16" height="10" rx="1" fill="var(--paper)" opacity="0.95" />
      <rect x="11" y="18" width="4" height="6" rx="0.5" fill="currentColor" opacity="0.45" />
    </svg>
  )
}

export function CloudSaveIndicator() {
  const [saveStatus, setSaveStatus] = useState<CloudSaveStatus>(() => getCloudSaveStatus())
  const [saveError, setSaveError] = useState<string | null>(() => getCloudSaveError())
  const [syncStatus, setSyncStatus] = useState<CloudSyncStatus>(() => getCloudSyncStatus())

  useEffect(() => {
    const unsubSave = subscribeCloudSaveStatus(() => {
      setSaveStatus(getCloudSaveStatus())
      setSaveError(getCloudSaveError())
    })
    const unsubSync = subscribeCloudSyncStatus(() => {
      setSyncStatus(getCloudSyncStatus())
    })
    return () => {
      unsubSave()
      unsubSync()
    }
  }, [])

  // Prefer showing local save feedback; otherwise show inbound sync.
  const kind: ToastKind | null =
    saveStatus !== 'idle'
      ? 'save'
      : syncStatus !== 'idle'
        ? 'sync'
        : null

  if (!kind || typeof document === 'undefined') return null

  const isSave = kind === 'save'
  const label = isSave ? saveLabel(saveStatus, saveError) : syncLabel(syncStatus)
  const tone =
    isSave && saveStatus === 'error'
      ? 'is-error'
      : (isSave && saveStatus === 'saved') || (!isSave && syncStatus === 'synced')
        ? 'is-saved'
        : 'is-busy'
  const busy =
    (isSave && (saveStatus === 'pending' || saveStatus === 'saving')) ||
    (!isSave && syncStatus === 'syncing')
  const done =
    (isSave && saveStatus === 'saved') || (!isSave && syncStatus === 'synced')

  return createPortal(
    <div role="status" aria-live="polite" className={`cloud-save-toast ${tone}`}>
      <div className="cloud-save-toast-glow" aria-hidden />
      <div className="cloud-save-toast-inner">
        <div className="cloud-save-icon-wrap">
          {isSave && saveStatus === 'error' ? (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.8" />
              <path
                d="M12 7v6M12 16.5h.01"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          ) : done ? (
            <div className="cloud-save-ok">
              {isSave ? <FloppyIcon /> : <SyncOrbitIcon spinning={false} />}
              <svg
                className="cloud-save-check-badge"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden
              >
                <circle cx="12" cy="12" r="11" fill="var(--sage)" />
                <path
                  d="M7.5 12.5l3 3 6-6.5"
                  stroke="var(--paper)"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          ) : isSave ? (
            <FloppyIcon spinning={busy} />
          ) : (
            <SyncOrbitIcon spinning={busy} />
          )}
        </div>
        <div className="cloud-save-copy">
          <span className="cloud-save-kicker">{isSave ? 'AUTO SAVE' : 'LIVE SYNC'}</span>
          <span className="cloud-save-label">{label}</span>
        </div>
        {busy && <ActivityBars size="md" className="cloud-save-toast-bars" />}
      </div>
    </div>,
    document.body,
  )
}
