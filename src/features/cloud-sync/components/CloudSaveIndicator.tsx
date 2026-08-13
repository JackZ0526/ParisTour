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
import { ActivityBars, SyncOrbitIcon } from '../../../shared/components/LoadingIndicator'
import { CircleAlert, CircleCheck, Save } from 'lucide-react'

type ToastKind = 'save' | 'sync'

function saveLabel(status: CloudSaveStatus, error: string | null): string {
  switch (status) {
    case 'pending':
      return '即将保存…'
    case 'saving':
      return '正在保存…'
    case 'saved':
      return '行程已保存'
    case 'error': {
      const reason = (error || '').replace(/^保存失败[:：]?\s*/, '').trim()
      return reason && reason !== '保存失败' ? `保存失败：${reason}` : '保存失败'
    }
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
    <Save
      className={`cloud-save-floppy ${spinning ? 'is-spinning' : ''}`}
      size={28}
      strokeWidth={2}
      aria-hidden
    />
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
            <CircleAlert size={28} strokeWidth={1.8} aria-hidden />
          ) : done ? (
            <div className="cloud-save-ok">
              {isSave ? <FloppyIcon /> : <SyncOrbitIcon spinning={false} />}
              <CircleCheck
                className="cloud-save-check-badge"
                size={14}
                strokeWidth={2.4}
                aria-hidden
              />
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
