import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import {
  getCloudSaveDayNumbers,
  getCloudSaveError,
  getCloudSaveStatus,
  getCloudSaveTarget,
  getCloudSyncDayNumbers,
  getCloudSyncStatus,
  getCloudSyncTarget,
  subscribeCloudSaveStatus,
  subscribeCloudSyncStatus,
  type CloudSaveStatus,
  type CloudSaveTarget,
  type CloudSyncStatus,
} from '../services/tripCloud'
import { SyncOrbitIcon } from '../../../shared/components/LoadingIndicator'
import { Check, CircleAlert, Save } from 'lucide-react'
import { isCloudSyncEnabled } from '../../../shared/lib/supabase'
import { useTranslation } from '../../../shared/i18n'

type ToastKind = 'save' | 'sync'

export function getSaveTargetLabel(
  target: CloudSaveTarget,
  dayNumbers: number[] | undefined,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  switch (target) {
    case 'itinerary_days':
      if (dayNumbers && dayNumbers.length === 1) {
        return t('cloud.saveTargetDaysSingle', { day: dayNumbers[0] })
      }
      if (dayNumbers && dayNumbers.length > 1) {
        return t('cloud.saveTargetDaysMultiple', { days: dayNumbers.join(', ') })
      }
      return t('cloud.saveTargetDaysAll')
    case 'place_details':
      return t('cloud.saveTargetPlaceDetails')
    case 'translations':
      return t('cloud.saveTargetTranslations')
    case 'hotel':
      return t('cloud.saveTargetHotel')
    case 'flights_dates':
      return t('cloud.saveTargetFlightsDates')
    case 'preferences':
      return t('cloud.saveTargetPreferences')
    case 'custom_places':
      return t('cloud.saveTargetCustomPlaces')
    case 'composite':
      return t('cloud.saveTargetComposite')
    case 'general':
    default:
      return t('cloud.saveTargetGeneral')
  }
}

export function saveLabel(
  status: CloudSaveStatus,
  error: string | null,
  target: CloudSaveTarget,
  dayNumbers: number[] | undefined,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  const targetLabel = getSaveTargetLabel(target, dayNumbers, t)
  switch (status) {
    case 'pending':
      return t('cloud.saveLabelPending')
    case 'saving':
      return target === 'general'
        ? t('cloud.saveLabelSaving')
        : t('cloud.saveActionSaving', { target: targetLabel })
    case 'saved':
      return target === 'general'
        ? t('cloud.saveLabelSaved')
        : t('cloud.saveActionSaved', { target: targetLabel })
    case 'error': {
      const reason = (error || '').replace(/^(保存失败|Save failed)[:：]?\s*/, '').trim()
      return reason ? t('cloud.saveLabelErrorWithReason', { reason }) : t('cloud.saveLabelError')
    }
    default:
      return ''
  }
}

export function syncLabel(
  status: CloudSyncStatus,
  target: CloudSaveTarget,
  dayNumbers: number[] | undefined,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  const targetLabel = getSaveTargetLabel(target, dayNumbers, t)
  switch (status) {
    case 'syncing':
      return target === 'general'
        ? t('cloud.syncLabelSyncing')
        : t('cloud.syncActionSyncing', { target: targetLabel })
    case 'synced':
      return target === 'general'
        ? t('cloud.syncLabelSynced')
        : t('cloud.syncActionSynced', { target: targetLabel })
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
  const isEnabled = isCloudSyncEnabled()
  const { t } = useTranslation()

  const [saveStatus, setSaveStatus] = useState<CloudSaveStatus>(() => getCloudSaveStatus())
  const [saveError, setSaveError] = useState<string | null>(() => getCloudSaveError())
  const [saveTarget, setSaveTarget] = useState<CloudSaveTarget>(() => getCloudSaveTarget())
  const [saveDays, setSaveDays] = useState<number[] | undefined>(() => getCloudSaveDayNumbers())

  const [syncStatus, setSyncStatus] = useState<CloudSyncStatus>(() => getCloudSyncStatus())
  const [syncTarget, setSyncTarget] = useState<CloudSaveTarget>(() => getCloudSyncTarget())
  const [syncDays, setSyncDays] = useState<number[] | undefined>(() => getCloudSyncDayNumbers())

  useEffect(() => {
    if (!isEnabled) return
    const unsubSave = subscribeCloudSaveStatus(() => {
      setSaveStatus(getCloudSaveStatus())
      setSaveError(getCloudSaveError())
      setSaveTarget(getCloudSaveTarget())
      setSaveDays(getCloudSaveDayNumbers())
    })
    const unsubSync = subscribeCloudSyncStatus(() => {
      setSyncStatus(getCloudSyncStatus())
      setSyncTarget(getCloudSyncTarget())
      setSyncDays(getCloudSyncDayNumbers())
    })
    return () => {
      unsubSave()
      unsubSync()
    }
  }, [isEnabled])

  // In localhost dev mode, cloud saves are disabled — nothing to show.
  if (!isEnabled) return null

  // Prefer showing local save feedback; otherwise show inbound sync.
  const kind: ToastKind | null =
    saveStatus !== 'idle'
      ? 'save'
      : syncStatus !== 'idle'
        ? 'sync'
        : null

  if (typeof document === 'undefined') return null

  const isSave = kind === 'save'
  const label = isSave
    ? saveLabel(saveStatus, saveError, saveTarget, saveDays, t)
    : syncLabel(syncStatus, syncTarget, syncDays, t)
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
    <AnimatePresence>
      {kind && (
        <motion.div
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: 10, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.94 }}
          transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
          className={`cloud-save-toast ${tone}`}
        >
      <div className="cloud-save-toast-glow" aria-hidden />
      <div className="cloud-save-toast-inner">
        <div className="cloud-save-icon-wrap">
          <AnimatePresence mode="wait">
            {isSave && saveStatus === 'error' ? (
              <motion.div
                key="error"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <CircleAlert size={28} strokeWidth={1.8} aria-hidden />
              </motion.div>
            ) : done ? (
              <motion.div
                key="done"
                initial={{ scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.85, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 450, damping: 24 }}
                className="cloud-save-ok"
              >
                {isSave ? <FloppyIcon /> : <SyncOrbitIcon spinning={false} />}
                <motion.span
                  initial={{ scale: 0, rotate: -20 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{
                    type: 'spring',
                    stiffness: 500,
                    damping: 20,
                    delay: 0.05,
                  }}
                  className="cloud-save-check-badge"
                  aria-hidden
                >
                  <Check size={11} strokeWidth={3} />
                </motion.span>
              </motion.div>
            ) : (
              <motion.div
                key="busy"
                initial={{ scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.85, opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                {isSave ? (
                  <FloppyIcon spinning={busy} />
                ) : (
                  <SyncOrbitIcon spinning={busy} />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className="cloud-save-copy">
          <span className="cloud-save-kicker">{isSave ? t('cloud.saveKicker') : t('cloud.syncKicker')}</span>
          <span className="cloud-save-label">{label}</span>
        </div>
      </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
