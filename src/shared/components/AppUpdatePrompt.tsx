import { localizedCopy } from '../i18n/copy/AppUpdatePrompt-b1a3fe'
import { useState, useSyncExternalStore } from 'react'
import { useTranslation } from '../i18n'
import { subscribe, getAppUpdate } from '../services/appUpdate'
export function AppUpdatePrompt() {
  const callback = useSyncExternalStore(subscribe, getAppUpdate)
  const [dismissed, setDismissed] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [failed, setFailed] = useState(false)
  const { locale } = useTranslation()
  if (!callback || dismissed) return null
  return <aside role="status" className="fixed inset-x-4 top-4 z-[9999] mx-auto max-w-sm rounded-2xl border border-[var(--stone)]/25 bg-[var(--paper)] p-4 text-sm text-[var(--ink)] shadow-xl">
    <p>{failed ? (locale === 'en' ? localizedCopy('me4073ba2f0', undefined, 'en') : localizedCopy('me4073ba2f0', undefined, 'zh-CN')) : (locale === 'en' ? localizedCopy('m8176d7ba03', undefined, 'en') : localizedCopy('m8176d7ba03', undefined, 'zh-CN'))}</p>
    <div className="mt-3 flex justify-end gap-4">
      <button type="button" disabled={updating} onClick={() => setDismissed(true)}>{locale === 'en' ? localizedCopy('m0171badeae', undefined, 'en') : localizedCopy('m0171badeae', undefined, 'zh-CN')}</button>
      <button type="button" disabled={updating} onClick={async () => {
        setUpdating(true)
        try { await callback() } catch { setFailed(true); setUpdating(false) }
      }}>{locale === 'en' ? localizedCopy('m1ad1faa250', undefined, 'en') : localizedCopy('m1ad1faa250', undefined, 'zh-CN')}</button>
    </div>
  </aside>
}
