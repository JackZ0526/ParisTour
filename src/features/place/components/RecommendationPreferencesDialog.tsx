import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useBodyScrollLock } from '../../../shared/hooks/useBodyScrollLock'
import { createPortal } from 'react-dom'
import { useEnterExit } from '../../../shared/hooks/useEnterExit'
import { SlidersHorizontal } from 'lucide-react'
import {
  DEFAULT_RECOMMENDATION_PREFERENCES,
  type RecommendationPreferences,
} from '../services/recommendationPreferences'
import { CloseIconButton } from '../../../shared/components/CloseIconButton'
import { Checkbox } from '../../../shared/components/Checkbox'
import { TimePicker } from '../../itinerary/components/TimePicker'

import { useSheetDragDismiss } from '../../../shared/hooks/useSheetDragDismiss'

interface Props {
  open: boolean
  value: RecommendationPreferences
  onSave: (value: RecommendationPreferences) => void
  onClose: () => void
}

const options: Array<{
  key: keyof Pick<
    RecommendationPreferences,
    | 'preferCafeStart'
    | 'preferLunchAndDinner'
    | 'includeDisneyDay'
    | 'includeChampsAndArc'
    | 'avoidLouvreAndVersailles'
    | 'preferLowWalking'
  >
  label: string
  description: string
}> = [
  {
    key: 'preferCafeStart',
    label: '咖啡馆开场',
    description: '普通游览日优先先喝咖啡或吃早餐，但不再强制。',
  },
  {
    key: 'preferLunchAndDinner',
    label: '午餐与晚餐',
    description: '时间允许时优先安排两顿正餐，航班日可自动减少。',
  },
  {
    key: 'includeDisneyDay',
    label: '安排迪士尼日',
    description: '行程≥3 天时，倒数第二天固定为巴黎迪士尼全日。',
  },
  {
    key: 'includeChampsAndArc',
    label: '香榭丽舍与凯旋门',
    description: '优先把两个相邻地标放在同一天。',
  },
  {
    key: 'avoidLouvreAndVersailles',
    label: '避开卢浮宫与凡尔赛',
    description: '关闭后可根据路线和时间正常推荐。',
  },
  {
    key: 'preferLowWalking',
    label: '少步行、少换乘',
    description: '优先同片区聚类；关闭后允许更丰富但更费体力的路线。',
  },
]

export function RecommendationPreferencesButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="推荐偏好"
      title="推荐偏好"
      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--stone)]/30 text-[var(--stone)] transition-colors hover:border-[var(--sage)] hover:text-[var(--sage)]"
    >
      <SlidersHorizontal className="h-4 w-4" strokeWidth={1.8} aria-hidden />
    </button>
  )
}

export function RecommendationPreferencesDialog({
  open,
  value,
  onSave,
  onClose,
}: Props) {
  useBodyScrollLock(open)
  const [draft, setDraft] = useState(value)

  useEffect(() => {
    if (open) setDraft(value)
  }, [open, value])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const sheet = useEnterExit('sheet-bottom')
  const backdrop = useEnterExit('fade')
  const { sheetRef, dragProps } = useSheetDragDismiss({ onClose })

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[2600] bg-black/45"
            initial={backdrop.initial}
            animate={backdrop.animate}
            exit={backdrop.exit}
            transition={backdrop.transition}
            onClick={onClose}
          />
          <div className="pointer-events-none fixed inset-0 z-[2601] flex items-end justify-center p-0 sm:items-center sm:p-4">
            <motion.div
              ref={sheetRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="recommendation-preferences-title"
              initial={sheet.initial}
              animate={sheet.animate}
              exit={sheet.exit}
              transition={sheet.transition}
              {...dragProps}
              className="pointer-events-auto w-full max-w-xl overflow-hidden rounded-t-3xl border border-white/70 bg-[var(--paper)] shadow-2xl sm:rounded-3xl [touch-action:pan-y]"
            >
        <div className="flex items-start justify-between border-b border-[var(--mist)] px-5 py-4">
          <div>
            <h2 id="recommendation-preferences-title" className="font-serif text-2xl text-[var(--ink)]">推荐偏好</h2>
            <p className="mt-1 text-sm text-[var(--stone)]">这些是默认倾向，不是不可违反的硬规则；保存后用于下一次地点推荐或行程生成。</p>
          </div>
          <CloseIconButton onClick={onClose} />
        </div>

        <div className="max-h-[min(68dvh,68vh)] space-y-5 overflow-y-auto px-5 py-4">
          <TimePicker
            label="通常开始时间"
            value={draft.dayStartTime}
            onChange={(dayStartTime) => setDraft((prev) => ({ ...prev, dayStartTime }))}
          />

          <div className="space-y-2">
            {options.map((option) => (
              <label key={option.key} className="flex cursor-pointer items-start justify-between gap-4 rounded-2xl border border-[var(--mist)] bg-white/55 px-4 py-3">
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-[var(--ink)]">{option.label}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-[var(--stone)]">{option.description}</span>
                </span>
                <span className="mt-0.5">
                  <Checkbox
                    checked={draft[option.key]}
                    onCheckedChange={(on) => setDraft((prev) => ({ ...prev, [option.key]: on }))}
                  />
                </span>
              </label>
            ))}
          </div>

          <label className="block">
            <span className="text-sm font-medium text-[var(--ink)]">补充要求</span>
            <textarea
              value={draft.extraNotes}
              onChange={(event) => setDraft((prev) => ({ ...prev, extraNotes: event.target.value.slice(0, 800) }))}
              rows={3}
              placeholder="例如：喜欢摄影、不要连续安排大型博物馆、晚餐预算适中……"
              className="mt-2 w-full resize-none rounded-xl border border-[var(--mist)] bg-white/80 px-3 py-2 text-sm"
            />
          </label>
        </div>

        <div className="flex flex-wrap justify-between gap-2 border-t border-[var(--mist)] px-5 py-4">
          <button type="button" onClick={() => setDraft({ ...DEFAULT_RECOMMENDATION_PREFERENCES })} className="rounded-full border border-[var(--stone)]/30 px-4 py-2 text-sm text-[var(--stone)] hover:border-[var(--sage)]">恢复默认</button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-full border border-[var(--stone)]/30 px-4 py-2 text-sm">取消</button>
            <button type="button" onClick={() => { onSave(draft); onClose() }} className="rounded-full bg-[var(--ink)] px-4 py-2 text-sm text-[var(--paper)]">保存偏好</button>
          </div>
        </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  )
}
