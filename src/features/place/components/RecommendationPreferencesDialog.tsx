import { useEffect, useState, useId, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Clock,
  LoaderCircle,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Tag,
  Trash2,
  Wand2,
} from 'lucide-react'
import {
  DEFAULT_RECOMMENDATION_PREFERENCES,
  PRESET_PREFERENCE_TAGS,
  cleanTagText,
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

interface TagTheme {
  activePill: string
  suggestedPill: string
}

const COLOR_PALETTES: readonly TagTheme[] = [
  {
    // 0. Amber / Morning Cafe
    activePill: 'bg-amber-500/22 border-amber-300/80 text-amber-950 hover:bg-amber-500/30',
    suggestedPill: 'bg-amber-500/12 border-amber-300/60 text-amber-950/85 hover:bg-amber-500/22 hover:border-amber-400',
  },
  {
    // 1. Terracotta / Dining & Meat
    activePill: 'bg-orange-500/22 border-orange-300/80 text-orange-950 hover:bg-orange-500/30',
    suggestedPill: 'bg-orange-500/12 border-orange-300/60 text-orange-950/85 hover:bg-orange-500/22 hover:border-orange-400',
  },
  {
    // 2. Sage Botanical Green / Walking & Nature
    activePill: 'bg-emerald-600/22 border-emerald-300/80 text-emerald-950 hover:bg-emerald-600/30',
    suggestedPill: 'bg-emerald-600/12 border-emerald-300/60 text-emerald-950/85 hover:bg-emerald-600/22 hover:border-emerald-400',
  },
  {
    // 3. Artsy Indigo / Gallery & Museum
    activePill: 'bg-indigo-500/22 border-indigo-300/80 text-indigo-950 hover:bg-indigo-500/30',
    suggestedPill: 'bg-indigo-500/12 border-indigo-300/60 text-indigo-950/85 hover:bg-indigo-500/22 hover:border-indigo-400',
  },
  {
    // 4. Rose / French Bakery & Sweets
    activePill: 'bg-rose-500/22 border-rose-300/80 text-rose-950 hover:bg-rose-500/30',
    suggestedPill: 'bg-rose-500/12 border-rose-300/60 text-rose-950/85 hover:bg-rose-500/22 hover:border-rose-400',
  },
  {
    // 5. Seine River Teal / Landmarks
    activePill: 'bg-teal-600/22 border-teal-300/80 text-teal-950 hover:bg-teal-600/30',
    suggestedPill: 'bg-teal-600/12 border-teal-300/60 text-teal-950/85 hover:bg-teal-600/22 hover:border-teal-400',
  },
  {
    // 6. Sky Blue / Photo & Tower Night
    activePill: 'bg-sky-500/22 border-sky-300/80 text-sky-950 hover:bg-sky-500/30',
    suggestedPill: 'bg-sky-500/12 border-sky-300/60 text-sky-950/85 hover:bg-sky-500/22 hover:border-sky-400',
  },
  {
    // 7. Fairy Purple / Disney & Kids
    activePill: 'bg-purple-500/22 border-purple-300/80 text-purple-950 hover:bg-purple-500/30',
    suggestedPill: 'bg-purple-500/12 border-purple-300/60 text-purple-950/85 hover:bg-purple-500/22 hover:border-purple-400',
  },
  {
    // 8. Vintage Gold Ochre / Marais & Vintage Market
    activePill: 'bg-amber-600/22 border-amber-300/80 text-amber-950 hover:bg-amber-600/30',
    suggestedPill: 'bg-amber-600/12 border-amber-300/60 text-amber-950/85 hover:bg-amber-600/22 hover:border-amber-400',
  },
  {
    // 9. Wine Burgundy / Seine Sunset Cruise
    activePill: 'bg-red-500/22 border-red-300/80 text-red-950 hover:bg-red-500/30',
    suggestedPill: 'bg-red-500/12 border-red-300/60 text-red-950/85 hover:bg-red-500/22 hover:border-red-400',
  },
]

function getTagTheme(tag: string): TagTheme {
  const t = cleanTagText(tag).toLowerCase()
  if (t.includes('咖啡') || t.includes('早餐')) return COLOR_PALETTES[0]
  if (t.includes('餐') || t.includes('吃') || t.includes('肉') || t.includes('面') || t.includes('生蚝') || t.includes('菜') || t.includes('美食')) return COLOR_PALETTES[1]
  if (t.includes('步') || t.includes('慢') || t.includes('轻松') || t.includes('避开')) return COLOR_PALETTES[2]
  if (t.includes('画') || t.includes('展') || t.includes('故居') || t.includes('文艺') || t.includes('艺术')) return COLOR_PALETTES[3]
  if (t.includes('甜') || t.includes('烘焙') || t.includes('面包')) return COLOR_PALETTES[4]
  if (t.includes('凯旋门') || t.includes('香街') || t.includes('地标')) return COLOR_PALETTES[5]
  if (t.includes('照') || t.includes('出片') || t.includes('夜景') || t.includes('铁塔') || t.includes('摄影')) return COLOR_PALETTES[6]
  if (t.includes('迪士尼') || t.includes('亲子') || t.includes('乐园') || t.includes('儿童')) return COLOR_PALETTES[7]
  if (t.includes('市集') || t.includes('中古') || t.includes('买手') || t.includes('购物')) return COLOR_PALETTES[8]
  if (t.includes('酒') || t.includes('船') || t.includes('塞纳河')) return COLOR_PALETTES[9]

  let hash = 0
  for (let i = 0; i < t.length; i++) hash = (hash << 5) - hash + t.charCodeAt(i)
  const index = Math.abs(hash) % COLOR_PALETTES.length
  return COLOR_PALETTES[index]
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

const BASE_TAG_PILL =
  "group relative isolate overflow-hidden inline-flex h-7.5 items-center px-3.5 text-xs font-semibold leading-none rounded-full border shadow-[0_2px_8px_rgba(0,0,0,0.04),inset_0_1px_1.5px_rgba(255,255,255,1),inset_0_-1px_1px_rgba(255,255,255,0.65)] backdrop-blur-md backdrop-saturate-[180%] before:pointer-events-none before:absolute before:inset-x-2 before:top-0 before:h-[1px] before:rounded-full before:bg-gradient-to-r before:from-transparent before:via-white before:to-transparent before:content-[''] transition-all cursor-pointer select-none"

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
  const [customCandidateTags, setCustomCandidateTags] = useState<string[]>([])
  const [extractedResult, setExtractedResult] = useState<string[] | null>(null)

  useEffect(() => {
    if (open) {
      setDraft({
        ...value,
        tags: (value.tags || []).map(cleanTagText).filter(Boolean),
      })
      setNaturalInput('')
      setIsExtracting(false)
      setExtractError(null)
      setExtractedResult(null)
    }
  }, [open, value])

  const activeTags = (draft.tags || []).map(cleanTagText).filter(Boolean)

  function addTag(tag: string) {
    const cleaned = cleanTagText(tag)
    if (!cleaned || activeTags.includes(cleaned)) return
    setDraft((prev) => ({
      ...prev,
      tags: [...prev.tags, cleaned],
    }))
  }

  function removeTag(tagToRemove: string) {
    const cleanedToRemove = cleanTagText(tagToRemove)
    setDraft((prev) => ({
      ...prev,
      tags: prev.tags.filter((t) => cleanTagText(t) !== cleanedToRemove),
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

      const cleanedExtracted = extracted.map(cleanTagText).filter(Boolean)

      if (cleanedExtracted.length > 0) {
        setExtractedResult(cleanedExtracted)
      } else {
        setExtractError('未能提炼出有效标签，请尝试补充更多旅行细节。')
      }
    } catch {
      setExtractError('提炼偏好标签失败，请重试。')
    } finally {
      setIsExtracting(false)
    }
  }

  function handleAddToActivePool() {
    if (!extractedResult || extractedResult.length === 0) return
    setDraft((prev) => ({
      ...prev,
      tags: Array.from(new Set([...prev.tags, ...extractedResult])),
    }))
    setExtractedResult(null)
    setNaturalInput('')
  }

  function handleAddToCandidatePool() {
    if (!extractedResult || extractedResult.length === 0) return
    setCustomCandidateTags((prev) =>
      Array.from(new Set([...prev, ...extractedResult])),
    )
    setExtractedResult(null)
    setNaturalInput('')
  }

  function handleDiscardExtracted() {
    setExtractedResult(null)
  }

  const allCandidates = Array.from(
    new Set([...PRESET_PREFERENCE_TAGS, ...customCandidateTags]),
  )

  const availablePresets = allCandidates.filter(
    (preset) => !activeTags.includes(cleanTagText(preset)),
  )

  return (
    <>
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
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
          {/* 1. Departure Time Anchor */}
          <section className="rounded-2xl border border-white/80 bg-white/50 p-3.5 shadow-sm backdrop-blur-md">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--ink)] mb-2">
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
                <span className="text-xs font-semibold text-[var(--ink)]">
                  已选偏好池
                </span>
                <span className="inline-flex items-center rounded-full border border-[var(--copper)]/25 bg-[var(--copper)]/10 px-2 py-0.5 text-[10px] font-semibold text-[var(--copper)]">
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
            <div className="min-h-[88px] rounded-3xl border border-white/85 bg-white/65 p-3.5 sm:p-4 shadow-[inset_0_1px_3px_rgba(0,0,0,0.03),0_4px_20px_rgba(0,0,0,0.03)] backdrop-blur-xl">
              {activeTags.length === 0 ? (
                <div className="flex min-h-[64px] flex-col items-center justify-center text-center p-1">
                  <p className="text-xs font-medium text-[var(--stone)]">
                    偏好池暂为空白
                  </p>
                  <p className="mt-0.5 text-[11px] text-[var(--stone)]/75">
                    点击下方候选标签加入，或输入补充要求让 AI 智能提炼汇入
                  </p>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <AnimatePresence initial={false}>
                    {activeTags.map((tag) => {
                      const cleanTag = cleanTagText(tag)
                      const theme = getTagTheme(cleanTag)
                      return (
                        <motion.button
                          key={cleanTag}
                          type="button"
                          layout="position"
                          initial={{ scale: 0.85, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0.85, opacity: 0 }}
                          whileTap={{ scale: 0.93 }}
                          transition={{
                            layout: { duration: 0.22, ease: [0.16, 1, 0.3, 1] },
                            scale: { duration: 0.18, ease: [0.16, 1, 0.3, 1] },
                            opacity: { duration: 0.16 },
                          }}
                          onClick={() => removeTag(cleanTag)}
                          title={`点击移出：${cleanTag}`}
                          aria-label={`移除 ${cleanTag}`}
                          className={`${BASE_TAG_PILL} ${theme.activePill}`}
                        >
                          <span className="relative z-10 truncate max-w-[240px] sm:max-w-none">{cleanTag}</span>
                        </motion.button>
                      )
                    })}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </section>

          {/* 3. AI Suggested Tags Deck (候选偏好库) */}
          <section className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--stone)] flex items-center gap-1.5">
                <Sparkles size={13} className="text-amber-600" />
                <span>推荐偏好候选（点击加入池中）</span>
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              {availablePresets.length > 0 ? (
                availablePresets.map((preset) => {
                  const cleanPreset = cleanTagText(preset)
                  const theme = getTagTheme(cleanPreset)
                  return (
                    <button
                      key={cleanPreset}
                      type="button"
                      onClick={() => addTag(cleanPreset)}
                      title={`点击加入：${cleanPreset}`}
                      aria-label={`加入 ${cleanPreset}`}
                      className={`${BASE_TAG_PILL} ${theme.suggestedPill}`}
                    >
                      <span className="relative z-10">{cleanPreset}</span>
                    </button>
                  )
                })
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
                      <span>智能提炼</span>
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

      {/* Extracted Tags Decision Modal */}
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {extractedResult && extractedResult.length > 0 && (
              <div className="fixed inset-0 z-[2800] flex items-center justify-center p-4">
                {/* Backdrop */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  onClick={handleDiscardExtracted}
                  className="fixed inset-0 bg-black/45 backdrop-blur-sm"
                />

                {/* Modal Card */}
                <motion.div
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="extracted-dialog-title"
                  initial={{ opacity: 0, scale: 0.93, y: 14 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.93, y: 8 }}
                  transition={{ type: 'spring', stiffness: 450, damping: 30 }}
                  className={`relative z-10 flex w-full max-w-md flex-col overflow-hidden rounded-3xl ${glassModalSurfaceClass} p-5 sm:p-6 shadow-[0_24px_60px_rgba(0,0,0,0.22),inset_0_1px_2px_rgba(255,255,255,1)]`}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-amber-300/60 bg-amber-500/12 text-amber-700 shadow-2xs backdrop-blur-md">
                        <Sparkles size={17} strokeWidth={2.2} />
                      </div>
                      <div className="min-w-0 pt-0.5">
                        <h3 id="extracted-dialog-title" className="font-display text-base sm:text-lg font-semibold text-[var(--ink)] tracking-tight">
                          AI 智能提炼完成
                        </h3>
                        <p className="mt-0.5 text-xs text-[var(--stone)] leading-relaxed">
                          已为您提炼出以下偏好标签：
                        </p>
                      </div>
                    </div>
                    <CloseIconButton onClick={handleDiscardExtracted} />
                  </div>

                  {/* Extracted Tags Display Box */}
                  <div className="my-4 rounded-2xl border border-white/85 bg-white/70 p-3 shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)] backdrop-blur-md">
                    <div className="flex flex-wrap gap-1.5">
                      {extractedResult.map((tag) => {
                        const clean = cleanTagText(tag)
                        const theme = getTagTheme(clean)
                        return (
                          <span
                            key={clean}
                            className={`${BASE_TAG_PILL} ${theme.activePill}`}
                          >
                            <span className="relative z-10">{clean}</span>
                          </span>
                        )
                      })}
                    </div>
                  </div>

                  {/* Standardized ParisTour Horizontal Action Capsules */}
                  <div className="mt-1 flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={handleDiscardExtracted}
                      className="min-h-[34px] rounded-full border border-black/8 bg-white/70 px-3.5 py-1 text-xs font-medium text-[var(--stone)] shadow-2xs backdrop-blur-md transition-all hover:bg-white hover:text-[var(--ink)] active:scale-95 cursor-pointer"
                    >
                      放弃
                    </button>

                    <button
                      type="button"
                      onClick={handleAddToCandidatePool}
                      className="min-h-[34px] rounded-full border border-black/10 bg-white/85 px-4 py-1 text-xs font-medium text-[var(--ink)] shadow-2xs backdrop-blur-md transition-all hover:bg-white active:scale-95 cursor-pointer"
                    >
                      加入候选池
                    </button>

                    <button
                      type="button"
                      onClick={handleAddToActivePool}
                      className="group relative isolate inline-flex min-h-[34px] items-center gap-1.5 rounded-full bg-[var(--ink)] px-4.5 py-1 text-xs font-semibold text-[var(--paper)] shadow-[0_4px_14px_rgba(0,0,0,0.18),inset_0_1px_1px_rgba(255,255,255,0.25)] transition-all hover:bg-black active:scale-95 cursor-pointer"
                    >
                      <Sparkles size={12} className="text-amber-300" />
                      <span>加入已选池</span>
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  )
}
