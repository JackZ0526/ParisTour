import { useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Clock,
  LoaderCircle,
  RotateCcw,
  Sparkles,
  Tag,
  Trash2,
  Wand2,
} from 'lucide-react'
import {
  BASE_TAG_PILL,
  DEFAULT_RECOMMENDATION_PREFERENCES,
  PRESET_PREFERENCE_TAGS,
  cleanTagText,
  getTagTheme,
  type RecommendationPreferences,
} from '../services/recommendationPreferences'
import { extractPreferenceTags } from '../../../shared/services/llm/llm'
import { TimePicker } from '../../itinerary/components/TimePicker'
import { CloseIconButton } from '../../../shared/components/CloseIconButton'
import {
  glassCapsuleSurfaceClass,
  glassCapsuleToneClass,
  glassCardSurfaceClass,
  glassModalSurfaceClass,
} from '../../../shared/styles/glassCapsule'

interface Props {
  value: RecommendationPreferences
  onChange: (value: RecommendationPreferences) => void
  readOnly?: boolean
  className?: string
}

export function InlineRecommendationPreferencesPanel({
  value,
  onChange,
  readOnly = false,
  className = '',
}: Props) {
  const [naturalInput, setNaturalInput] = useState('')
  const [isExtracting, setIsExtracting] = useState(false)
  const [extractError, setExtractError] = useState<string | null>(null)
  const [customCandidateTags, setCustomCandidateTags] = useState<string[]>([])
  const [extractedResult, setExtractedResult] = useState<string[] | null>(null)

  const activeTags = (value?.tags || []).map(cleanTagText).filter(Boolean)

  function addTag(tag: string) {
    if (readOnly) return
    const cleaned = cleanTagText(tag)
    if (!cleaned || activeTags.includes(cleaned)) return
    onChange({
      ...value,
      tags: [...(value?.tags || []), cleaned],
    })
  }

  function removeTag(tagToRemove: string) {
    if (readOnly) return
    const cleanedToRemove = cleanTagText(tagToRemove)
    onChange({
      ...value,
      tags: (value?.tags || []).filter((t) => cleanTagText(t) !== cleanedToRemove),
    })
  }

  function clearAllTags() {
    if (readOnly) return
    onChange({
      ...value,
      tags: [],
    })
  }

  function handleTimeChange(dayStartTime: string) {
    if (readOnly) return
    onChange({
      ...value,
      dayStartTime,
    })
  }

  function handleResetDefault() {
    if (readOnly) return
    onChange({ ...DEFAULT_RECOMMENDATION_PREFERENCES })
  }

  async function handleExtractFromText(e?: FormEvent) {
    if (e) e.preventDefault()
    if (readOnly) return
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
    if (!extractedResult || extractedResult.length === 0 || readOnly) return
    onChange({
      ...value,
      tags: Array.from(new Set([...(value?.tags || []), ...extractedResult])),
    })
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
    <div
      className={`rounded-3xl ${glassCardSurfaceClass} p-5 sm:p-6 shadow-[0_8px_32px_rgba(0,0,0,0.04),inset_0_1px_1.5px_rgba(255,255,255,1)] space-y-5 transition-colors ${className}`}
    >
      {/* 1. Header Bar with Title, Subtitle, and Reset to Default */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--mist)]/60 pb-3.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-base font-semibold text-[var(--ink)]">
            <Sparkles size={18} className="text-[var(--copper)] shrink-0" />
            <span>AI 智能偏好配置</span>
            <span className="inline-flex items-center rounded-full border border-[var(--copper)]/25 bg-[var(--copper)]/10 px-2 py-0.5 text-[10px] font-semibold text-[var(--copper)]">
              常驻控制台
            </span>
          </div>
          <p className="mt-1 text-xs text-[var(--stone)] leading-relaxed">
            个性化行程偏好体系；这些倾向将直接引导 AI 生成专属巴黎路线与地点推荐。
          </p>
        </div>

        {!readOnly && (
          <button
            type="button"
            onClick={handleResetDefault}
            className="inline-flex items-center gap-1.5 rounded-full border border-black/8 bg-white/70 px-3 py-1.5 text-xs font-medium text-[var(--stone)] hover:text-[var(--ink)] hover:bg-white shadow-2xs transition-all active:scale-95 cursor-pointer"
            title="恢复默认推荐偏好"
          >
            <RotateCcw size={12} />
            <span>恢复默认</span>
          </button>
        )}
      </div>

      {/* 2. Responsive 2-Column Split: Left (Time + Active Tags) / Right (Candidate Tags + AI Prompt) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-5 items-start">
        {/* Left Column: Departure Time (Top Left) + Active Preference Pool (Bottom Left) */}
        <div className="space-y-4">
          {/* Card 1: Departure Time */}
          <div className="rounded-2xl border border-white/80 bg-white/60 p-4 shadow-2xs backdrop-blur-md space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-[var(--ink)]">
              <span className="flex items-center gap-1.5">
                <Clock size={14} className="text-[var(--copper)]" />
                <span>通常开始时间</span>
              </span>
              <span className="text-[11px] font-normal text-[var(--stone)]">
                每日游玩出发
              </span>
            </div>
            <div className="pt-1">
              <TimePicker
                value={value?.dayStartTime || '10:00'}
                onChange={handleTimeChange}
              />
            </div>
          </div>

          {/* Card 2: Active Preference Pool */}
          <div className="rounded-2xl border border-white/80 bg-white/60 p-4 shadow-2xs backdrop-blur-md space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Tag size={15} className="text-[var(--copper)]" />
                <span className="text-xs font-semibold text-[var(--ink)]">
                  已选生效偏好池
                </span>
                <span className="inline-flex items-center rounded-full border border-[var(--copper)]/25 bg-[var(--copper)]/10 px-2 py-0.5 text-[10px] font-semibold text-[var(--copper)]">
                  {activeTags.length} 项生效
                </span>
              </div>

              {activeTags.length > 0 && !readOnly && (
                <button
                  type="button"
                  onClick={clearAllTags}
                  title="清空已选偏好池"
                  aria-label="清空已选偏好池"
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-full ${glassCapsuleSurfaceClass} ${glassCapsuleToneClass.neutral} text-[var(--stone)] shadow-xs transition-colors hover:border-[#b8433e]/30 hover:bg-white hover:text-[#b8433e] active:scale-95 cursor-pointer`}
                >
                  <Trash2 size={13} strokeWidth={1.8} />
                </button>
              )}
            </div>

            {activeTags.length === 0 ? (
              <div className="flex min-h-[56px] flex-col items-center justify-center rounded-xl border border-dashed border-black/10 bg-white/40 p-3 text-center">
                <p className="text-xs font-medium text-[var(--stone)]">
                  偏好池暂为空白
                </p>
                <p className="mt-0.5 text-[11px] text-[var(--stone)]/75">
                  点击右侧推荐标签加入，或输入补充要求让 AI 智能提炼汇入
                </p>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2 pt-0.5">
                {activeTags.map((tag) => {
                  const clean = cleanTagText(tag)
                  const theme = getTagTheme(clean)
                  return (
                    <button
                      key={clean}
                      type="button"
                      onClick={() => removeTag(clean)}
                      disabled={readOnly}
                      title={readOnly ? clean : `点击移出：${clean}`}
                      aria-label={`移除 ${clean}`}
                      className={`${BASE_TAG_PILL} active:scale-95 ${theme.activePill} ${
                        readOnly ? 'cursor-default' : 'cursor-pointer'
                      }`}
                    >
                      <span className="relative z-10">{clean}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Candidate Presets Pool (Top Right) + Natural Language AI Extractor (Bottom Right) */}
        <div className="space-y-4">
          {/* Card 3: Candidate Preference Pool (Top Right) */}
          <div className="rounded-2xl border border-white/80 bg-white/60 p-4 shadow-2xs backdrop-blur-md space-y-2.5">
            <div className="flex items-center justify-between text-xs font-semibold text-[var(--ink)]">
              <span className="flex items-center gap-1.5">
                <Sparkles size={14} className="text-[var(--copper)]" />
                <span>推荐偏好候选池</span>
              </span>
              <span className="text-[11px] font-normal text-[var(--stone)]">
                点击即刻加入偏好池
              </span>
            </div>

            <div className="flex flex-wrap gap-2 pt-0.5">
              {availablePresets.length > 0 ? (
                availablePresets.map((preset) => {
                  const clean = cleanTagText(preset)
                  const theme = getTagTheme(clean)
                  return (
                    <button
                      key={clean}
                      type="button"
                      onClick={() => addTag(clean)}
                      disabled={readOnly}
                      title={`点击加入：${clean}`}
                      aria-label={`加入 ${clean}`}
                      className={`${BASE_TAG_PILL} active:scale-95 ${theme.suggestedPill} ${
                        readOnly ? 'cursor-default opacity-50' : 'cursor-pointer'
                      }`}
                    >
                      <span className="relative z-10">{clean}</span>
                    </button>
                  )
                })
              ) : (
                <p className="text-xs text-[var(--stone)]/70 italic py-0.5">
                  已添加所有预设推荐偏好 ✨
                </p>
              )}
            </div>
          </div>

          {/* Card 4: Natural Language AI Extractor (Bottom Right) */}
          <div className="rounded-2xl border border-white/80 bg-white/60 p-4 shadow-2xs backdrop-blur-md space-y-2.5">
            <div className="flex items-center justify-between text-xs font-semibold text-[var(--ink)]">
              <span className="flex items-center gap-1.5">
                <Wand2 size={14} className="text-[var(--copper)]" />
                <span>补充要求 · AI 智能提炼标签</span>
              </span>
              <span className="text-[11px] font-normal text-[var(--stone)]">
                自然语言描述
              </span>
            </div>

            <form onSubmit={handleExtractFromText} className="space-y-2">
              <textarea
                value={naturalInput}
                onChange={(e) => setNaturalInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void handleExtractFromText()
                  }
                }}
                disabled={isExtracting || readOnly}
                rows={2}
                placeholder="例如：喜欢小众咖啡馆和复古市集，晚餐想吃生蚝，不希望太费体力……"
                className="w-full resize-none rounded-xl border border-white/90 bg-white/90 p-2.5 text-xs text-[var(--ink)] shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)] outline-none transition focus:border-[var(--copper)] focus:bg-white backdrop-blur-md placeholder:text-[var(--stone)]/60 disabled:opacity-50"
              />

              {extractError && (
                <p className="text-xs text-red-600 px-0.5">{extractError}</p>
              )}

              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-[var(--stone)]">
                  支持回车快速提炼
                </span>
                <button
                  type="submit"
                  disabled={isExtracting || !naturalInput.trim() || readOnly}
                  className="group relative isolate inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#b36b3c] to-[#9a542b] px-4 py-1.5 text-xs font-semibold text-white shadow-[0_4px_14px_rgba(179,107,60,0.28),inset_0_1px_1px_rgba(255,255,255,0.4)] transition-all hover:brightness-105 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-x-2 top-0 h-[1px] rounded-full bg-gradient-to-r from-transparent via-white/80 to-transparent"
                  />
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
          </div>
        </div>
      </div>

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
                  aria-labelledby="extracted-dialog-title-inline"
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
                        <h3
                          id="extracted-dialog-title-inline"
                          className="font-display text-base sm:text-lg font-semibold text-[var(--ink)] tracking-tight"
                        >
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

                  {/* Action Capsules */}
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
    </div>
  )
}
