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
    <p>{failed ? (locale === 'en' ? 'Update failed. Please try again.' : '更新失败，请重试。') : (locale === 'en' ? 'New version ready. Refresh after saving your work.' : '新版本已就绪，保存当前操作后即可刷新。')}</p>
    <div className="mt-3 flex justify-end gap-4">
      <button type="button" disabled={updating} onClick={() => setDismissed(true)}>{locale === 'en' ? 'Later' : '稍后'}</button>
      <button type="button" disabled={updating} onClick={async () => {
        setUpdating(true)
        try { await callback() } catch { setFailed(true); setUpdating(false) }
      }}>{locale === 'en' ? 'Refresh' : '刷新更新'}</button>
    </div>
  </aside>
}
