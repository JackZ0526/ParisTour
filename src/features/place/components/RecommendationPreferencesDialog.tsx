import { useEffect, useState, useId, type FormEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Clock,
  LoaderCircle,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Tag,
  Trash2,
  Wand2,
  X,
} from 'lucide-react'
import {
  DEFAULT_RECOMMENDATION_PREFERENCES,
  PRESET_PREFERENCE_TAGS,
  type RecommendationPreferences,
} from '../services/recommendationPreferences'
import { extractPreferenceTags } from '../../../shared/services/llm/llm'
import { TimePicker } from '../../itinerary/components/TimePicker'
import { BottomSheet } from '../../../shared/components/BottomSheet'
import { CloseIconButton } from '../../../shared/components/CloseIconButton'
import {
  glassModalSurfaceClass,
} from '../../../shared/styles/glassCapsule'

interface Props {
  open: boolean
  value: RecommendationPreferences
  onSave: (value: RecommendationPreferences) => void
  onClose: () => void
}

export function RecommendationPreferencesButton({
  onClick,
  className = 'inline-flex h-8 w-8 items-center justify-center rounded-full border border-black/5 bg-white/80 text-zinc-600 shadow-sm backdrop-blur-md transition-all hover:bg-white hover:text-zinc-900 active:scale-95',
}: {
  onClick: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="推荐偏好"
      title="推荐偏好"
      className={className}
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
  const titleId = useId()
  const [draft, setDraft] = useState<RecommendationPreferences>(value)
  const [naturalInput, setNaturalInput] = useState('')
  const [isExtracting, setIsExtracting] = useState(false)
  const [extractError, setExtractError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setDraft(value)
      setNaturalInput('')
      setIsExtracting(false)
      setExtractError(null)
    }
  }, [open, value])

  const activeTags = draft.tags || []

  function addTag(tag: string) {
    const trimmed = tag.trim()
    if (!trimmed || activeTags.includes(trimmed)) return
    setDraft((prev) => ({
      ...prev,
      tags: [...prev.tags, trimmed],
    }))
  }

  function removeTag(tagToRemove: string) {
    setDraft((prev) => ({
      ...prev,
      tags: prev.tags.filter((t) => t !== tagToRemove),
    }))
  }

  function clearAllTags() {
    setDraft((prev) => ({
      ...prev,
      tags: [],
    }))
  }

  async function handleExtractFromText(e?: FormEvent) {
    if (e) e.preventDefault()
    const text = naturalInput.trim()
    if (!text || isExtracting) return

    setIsExtracting(true)
    setExtractError(null)

    try {
      const extracted = await extractPreferenceTags(text, {
        existingTags: activeTags,
      })

      if (extracted.length > 0) {
        setDraft((prev) => {
          const combined = Array.from(new Set([...prev.tags, ...extracted]))
          return {
            ...prev,
            tags: combined,
          }
        })
        setNaturalInput('')
      } else {
        setExtractError('未能提炼出有效标签，请尝试补充更多旅行细节。')
      }
    } catch {
      setExtractError('提炼偏好标签失败，请重试。')
    } finally {
      setIsExtracting(false)
    }
  }

  const availablePresets = PRESET_PREFERENCE_TAGS.filter(
    (preset) => !activeTags.includes(preset),
  )

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      overlayZIndex={2600}
      ariaLabelledBy={titleId}
      className={`flex max-h-[min(88vh,100dvh)] max-w-xl flex-col overflow-hidden rounded-t-3xl ${glassModalSurfaceClass} sm:rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.12),inset_0_1px_2px_rgba(255,255,255,1)]`}
    >
      {/* Header Section */}
      <header className="relative shrink-0 border-b border-[var(--mist)]/60 px-5 pb-4 pt-3 sm:pt-5 sm:px-6">
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="font-display text-2xl sm:text-3xl font-semibold text-[var(--ink)] tracking-tight">
              推荐偏好
            </h2>
            <p className="mt-1 text-xs sm:text-sm text-[var(--stone)] leading-relaxed">
              个性化行程偏好池；这些倾向将直接引导 AI 生成专属巴黎路线与地点推荐。
            </p>
          </div>
          <CloseIconButton onClick={onClose} className="hidden sm:flex" />
        </div>
      </header>

      {/* Main Content Body */}
      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
        {/* 1. Departure Time Anchor */}
        <section className="rounded-2xl border border-white/80 bg-white/50 p-4 shadow-sm backdrop-blur-md">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--ink)] mb-2.5">
            <Clock size={14} className="text-[var(--copper)]" />
            <span>通常开始时间</span>
          </div>
          <TimePicker
            value={draft.dayStartTime}
            onChange={(dayStartTime) =>
              setDraft((prev) => ({ ...prev, dayStartTime }))
            }
          />
        </section>

        {/* 2. Active Preference Tag Pool (已生效偏好池) */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Tag size={14} className="text-[var(--copper)]" />
              <span className="text-xs sm:text-sm font-semibold text-[var(--ink)]">
                已选偏好池
              </span>
              <span className="inline-flex items-center rounded-full border border-[var(--copper)]/25 bg-[var(--copper)]/10 px-2 py-0.2 text-[10px] font-semibold text-[var(--copper)]">
                {activeTags.length} 项生效
              </span>
            </div>
            {activeTags.length > 0 && (
              <button
                type="button"
                onClick={clearAllTags}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--stone)] hover:text-red-600 transition-colors cursor-pointer"
              >
                <Trash2 size={12} />
                <span>清空池子</span>
              </button>
            )}
          </div>

          {/* Tag Pool Container Box */}
          <div className="min-h-[108px] rounded-3xl border border-white/85 bg-white/65 p-3.5 sm:p-4 shadow-[inset_0_1px_3px_rgba(0,0,0,0.03),0_4px_20px_rgba(0,0,0,0.03)] backdrop-blur-xl">
            {activeTags.length === 0 ? (
              <div className="flex min-h-[80px] flex-col items-center justify-center text-center p-2">
                <p className="text-xs sm:text-sm font-medium text-[var(--stone)]">
                  偏好池暂为空白
                </p>
                <p className="mt-1 text-[11px] text-[var(--stone)]/75">
                  点击下方候选标签，或用自然语言输入要求让 AI 智能提取汇入
                </p>
              </div>
            ) : (
              <motion.div layout className="flex flex-wrap gap-2">
                <AnimatePresence>
                  {activeTags.map((tag) => (
                    <motion.div
                      key={tag}
                      layout
                      initial={{ scale: 0.82, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.82, opacity: 0 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 32, mass: 0.7 }}
                      className="group relative isolate inline-flex items-center gap-1.5 rounded-full border border-white/95 bg-white/90 pl-3 pr-1.5 py-1.5 text-xs font-medium text-[var(--ink)] shadow-[0_2px_8px_rgba(0,0,0,0.04),inset_0_1px_1.5px_rgba(255,255,255,1)] backdrop-blur-md transition-all hover:bg-white hover:shadow-xs"
                    >
                      <span className="truncate max-w-[240px] sm:max-w-none">{tag}</span>
                      <button
                        type="button"
                        onClick={() => removeTag(tag)}
                        aria-label={`移除 ${tag}`}
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[var(--stone)]/80 hover:bg-red-50 hover:text-red-600 transition-colors cursor-pointer active:scale-90"
                      >
                        <X size={12} strokeWidth={2.4} />
                      </button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </motion.div>
            )}
          </div>
        </section>

        {/* 3. AI Suggested Tags Deck (候选偏好库) */}
        <section className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--stone)] flex items-center gap-1.5">
              <Sparkles size={13} className="text-amber-600" />
              <span>推荐偏好候选（点击即刻加入池中）</span>
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            {availablePresets.length > 0 ? (
              availablePresets.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => addTag(preset)}
                  className="group inline-flex items-center gap-1.5 rounded-full border border-dashed border-[var(--copper)]/35 bg-white/45 hover:bg-white/95 hover:border-[var(--copper)] hover:shadow-2xs px-3 py-1.5 text-xs font-medium text-[var(--ink)]/85 backdrop-blur-sm transition-all active:scale-95 cursor-pointer"
                >
                  <span>{preset}</span>
                  <Plus
                    size={13}
                    strokeWidth={2.4}
                    className="text-[var(--copper)] transition-transform group-hover:rotate-90"
                  />
                </button>
              ))
            ) : (
              <p className="text-xs text-[var(--stone)]/70 italic py-1">
                已添加所有预设推荐偏好 ✨
              </p>
            )}
          </div>
        </section>

        {/* 4. Natural Language Smart Input Extractor (自然语言提取) */}
        <section className="rounded-2xl border border-white/80 bg-white/55 p-4 shadow-sm backdrop-blur-md space-y-2.5">
          <label className="flex items-center justify-between text-xs font-semibold text-[var(--ink)]">
            <span className="flex items-center gap-1.5">
              <Wand2 size={14} className="text-[var(--copper)]" />
              <span>补充要求 · AI 智能提炼标签</span>
            </span>
            <span className="text-[10.5px] font-normal text-[var(--stone)]">
              自然语言描述
            </span>
          </label>

          <form onSubmit={handleExtractFromText} className="space-y-2.5">
            <div className="relative w-full">
              <textarea
                value={naturalInput}
                onChange={(e) => setNaturalInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void handleExtractFromText()
                  }
                }}
                disabled={isExtracting}
                rows={2}
                placeholder="例如：喜欢小众咖啡馆和复古市集，晚餐想吃生蚝，不希望太费体力……"
                className="w-full resize-none rounded-2xl border border-white/90 bg-white/90 p-3 text-xs sm:text-sm text-[var(--ink)] shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)] outline-none transition focus:border-[var(--copper)] focus:bg-white backdrop-blur-md placeholder:text-[var(--stone)]/60"
              />
            </div>

            {extractError && (
              <p className="text-xs text-red-600 px-1">{extractError}</p>
            )}

            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-[var(--stone)]">
                支持回车快速提炼
              </span>
              <button
                type="submit"
                disabled={isExtracting || !naturalInput.trim()}
                className="group relative isolate inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#b36b3c] to-[#9a542b] px-4 py-1.5 text-xs font-semibold text-white shadow-[0_4px_14px_rgba(179,107,60,0.28),inset_0_1px_1px_rgba(255,255,255,0.4)] transition-all hover:brightness-105 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <span aria-hidden className="pointer-events-none absolute inset-x-2 top-0 h-[1px] rounded-full bg-gradient-to-r from-transparent via-white/80 to-transparent" />
                {isExtracting ? (
                  <>
                    <LoaderCircle size={13} strokeWidth={2.2} className="animate-spin" />
                    <span>AI 提炼中…</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={13} strokeWidth={2.2} />
                    <span>智能提炼并加入池子</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </section>
      </div>

      {/* Footer Action Bar */}
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--mist)]/60 px-5 py-4 bg-white/30 backdrop-blur-md">
        <button
          type="button"
          onClick={() => setDraft({ ...DEFAULT_RECOMMENDATION_PREFERENCES })}
          className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-white/70 px-3.5 py-1.5 text-xs font-medium text-[var(--stone)] hover:text-[var(--ink)] hover:bg-white shadow-2xs transition-all active:scale-95 cursor-pointer"
        >
          <RotateCcw size={12} />
          <span>恢复默认</span>
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-black/10 bg-white/70 px-4 py-1.5 text-xs font-medium text-[var(--stone)] hover:text-[var(--ink)] hover:bg-white shadow-2xs transition-all active:scale-95 cursor-pointer"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => {
              onSave(draft)
              onClose()
            }}
            className="group relative isolate inline-flex items-center gap-1.5 rounded-full bg-[var(--ink)] px-5 py-1.5 text-xs sm:text-sm font-semibold text-[var(--paper)] shadow-[0_4px_14px_rgba(0,0,0,0.18),inset_0_1px_1px_rgba(255,255,255,0.25)] transition-all hover:bg-black active:scale-95 cursor-pointer"
          >
            <span>保存偏好配置</span>
          </button>
        </div>
      </footer>
    </BottomSheet>
  )
}
