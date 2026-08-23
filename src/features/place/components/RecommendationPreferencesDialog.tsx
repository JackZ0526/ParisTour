import { useEffect, useState, useId, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Check,
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
  BASE_TAG_PILL,
  DEFAULT_RECOMMENDATION_PREFERENCES,
  PRESET_PREFERENCE_TAGS,
  cleanTagText,
  getTagTheme,
  type RecommendationPreferences,
} from '../services/recommendationPreferences'
import { extractPreferenceTags } from '../../../shared/services/llm/llm'
import { TimePicker } from '../../itinerary/components/TimePicker'
import { BottomSheet } from '../../../shared/components/BottomSheet'
import { CloseIconButton } from '../../../shared/components/CloseIconButton'
import {
  glassCapsuleSurfaceClass,
  glassCapsuleToneClass,
  glassModalSurfaceClass,
} from '../../../shared/styles/glassCapsule'
import { useTranslation } from '../../../shared/i18n'
import { localizePrefTag } from '../../../shared/i18n'

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
  const { t } = useTranslation()
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t('place.preferencesTitle')}
      title={t('place.preferencesTitle')}
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
  const { t } = useTranslation()
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
        className={`flex h-[88dvh] sm:h-[640px] max-h-[100dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl ${glassModalSurfaceClass} sm:rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.12),inset_0_1px_2px_rgba(255,255,255,1)]`}
      >
        {/* Header Section */}
        <header className="relative shrink-0 border-b border-[var(--mist)]/60 px-5 pb-4 pt-3 sm:pt-5 sm:px-6">
          <div className="relative flex items-start justify-between gap-4">
            <div>
              <h2 id={titleId} className="font-display text-2xl sm:text-3xl font-semibold text-[var(--ink)] tracking-tight">
                {t('place.preferencesTitle')}
              </h2>
              <p className="mt-1 text-xs sm:text-sm text-[var(--stone)] leading-relaxed">
                {t('place.preferencesSubtitle')}
              </p>
            </div>
            <CloseIconButton onClick={onClose} className="hidden sm:flex" />
          </div>
        </header>

        {/* Main Content Body */}
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
          {/* 1. Departure Time Anchor */}
          <section className="relative z-30 rounded-3xl border border-white/80 dark:border-white/10 bg-white/65 dark:bg-[#18201c]/80 p-3.5 sm:p-4 shadow-[0_4px_20px_rgba(0,0,0,0.03),inset_0_1px_1.5px_rgba(255,255,255,1)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.25)] backdrop-blur-xl">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--ink)] mb-2">
              <Clock size={14} className="text-[var(--copper)]" />
              <span>{t('place.dayStartTime')}</span>
            </div>
            <TimePicker
              value={draft.dayStartTime}
              onChange={(dayStartTime) =>
                setDraft((prev) => ({ ...prev, dayStartTime }))
              }
            />
          </section>

          {/* 2. Active Preference Tag Pool Card (已选偏好池卡片) */}
          <section className="relative z-20 rounded-3xl border border-white/80 dark:border-white/10 bg-white/65 dark:bg-[#18201c]/80 p-4 shadow-[0_4px_20px_rgba(0,0,0,0.03),inset_0_1px_1.5px_rgba(255,255,255,1)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.25)] backdrop-blur-xl space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Tag size={14} className="text-[var(--copper)]" />
                <span className="text-xs font-semibold text-[var(--ink)]">
                  {t('place.activeTagPool')}
                </span>
                <span className="inline-flex items-center rounded-full border border-[var(--copper)]/25 bg-[var(--copper)]/10 px-2 py-0.5 text-[10px] font-semibold text-[var(--copper)]">
                  {t('place.activeTagsCount', { count: activeTags.length })}
                </span>
              </div>
              {activeTags.length > 0 && (
                <button
                  type="button"
                  onClick={clearAllTags}
                  title={t('common.reset')}
                  aria-label={t('common.reset')}
                  className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${glassCapsuleSurfaceClass} ${glassCapsuleToneClass.neutral} text-[var(--stone)]/80 shadow-xs backdrop-blur-md transition-colors hover:border-[#b8433e]/30 hover:bg-white dark:hover:bg-white/10 hover:text-[#b8433e] active:scale-95 disabled:pointer-events-none disabled:opacity-40 cursor-pointer`}
                >
                  <Trash2 size={14} strokeWidth={1.8} aria-hidden />
                </button>
              )}
            </div>

            {activeTags.length === 0 ? (
              <div className="flex min-h-[64px] flex-col items-center justify-center text-center rounded-2xl border border-dashed border-black/10 dark:border-white/10 bg-white/40 dark:bg-white/5 p-2.5">
                <p className="text-xs font-medium text-[var(--stone)]">
                  {t('place.preferencesSubtitle')}
                </p>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {activeTags.map((tag) => {
                  const cleanTag = cleanTagText(tag)
                  const theme = getTagTheme(cleanTag)
                  return (
                    <button
                      key={cleanTag}
                      type="button"
                      onClick={() => removeTag(cleanTag)}
                      title={t('place.recPrefRemoveTitle', { name: localizePrefTag(cleanTag) })}
                      aria-label={t('place.recPrefRemoveAria', { name: localizePrefTag(cleanTag) })}
                      className={`${BASE_TAG_PILL} active:scale-95 ${theme.activePill}`}
                    >
                      <span className="relative z-10 truncate max-w-[240px] sm:max-w-none">{localizePrefTag(cleanTag)}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </section>

          {/* 3. Candidate Tag Deck Card (推荐偏好候选卡片) */}
          <section className="relative z-10 rounded-3xl border border-white/80 dark:border-white/10 bg-white/65 dark:bg-[#18201c]/80 p-4 shadow-[0_4px_20px_rgba(0,0,0,0.03),inset_0_1px_1.5px_rgba(255,255,255,1)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.25)] backdrop-blur-xl space-y-2.5">
            <div className="flex items-center justify-between text-xs font-semibold text-[var(--ink)]">
              <span className="flex items-center gap-1.5">
                <Sparkles size={14} className="text-[var(--copper)]" />
                <span>{t('place.candidateTagsTitle')}</span>
              </span>
              <span className="text-[10.5px] font-normal text-[var(--stone)]">
                {t('place.clickToAdd')}
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
                      title={t('place.recPrefAddTitle', { name: localizePrefTag(cleanPreset) })}
                      aria-label={t('place.recPrefAddAria', { name: localizePrefTag(cleanPreset) })}
                      className={`${BASE_TAG_PILL} active:scale-95 ${theme.suggestedPill}`}
                    >
                      <span className="relative z-10">{localizePrefTag(cleanPreset)}</span>
                    </button>
                  )
                })
              ) : (
                <p className="text-xs text-[var(--stone)]/70 italic py-1">
                  {t('place.allPresetsAdded')}
                </p>
              )}
            </div>
          </section>

          {/* 4. Natural Language Smart Input Extractor (自然语言提取) */}
          <section className="rounded-3xl border border-white/80 dark:border-white/10 bg-white/65 dark:bg-[#18201c]/80 p-4 shadow-[0_4px_20px_rgba(0,0,0,0.03),inset_0_1px_1.5px_rgba(255,255,255,1)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.25)] backdrop-blur-xl space-y-2.5">
            <label className="flex items-center justify-between text-xs font-semibold text-[var(--ink)]">
              <span className="flex items-center gap-1.5">
                <Wand2 size={14} className="text-[var(--copper)]" />
                <span>{t('place.naturalLanguagePrompt')}</span>
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
                  placeholder={t('place.customPreferencesPlaceholder')}
                  className="w-full resize-none rounded-2xl border border-white/90 dark:border-white/10 bg-white/90 dark:bg-black/25 p-3 text-xs sm:text-sm text-[var(--ink)] shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)] outline-none transition focus:border-[var(--copper)] focus:bg-white dark:focus:bg-black/40 backdrop-blur-md placeholder:text-[var(--stone)]/60"
                />
              </div>

              {extractError && (
                <p className="text-xs text-red-600 dark:text-red-400 px-1">{extractError}</p>
              )}

              <div className="flex items-center justify-end gap-2">
                <button
                  type="submit"
                  disabled={isExtracting || !naturalInput.trim()}
                  className="group relative isolate inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#b36b3c] to-[#9a542b] px-4 py-1.5 text-xs font-semibold text-white shadow-[0_4px_14px_rgba(179,107,60,0.28),inset_0_1px_1px_rgba(255,255,255,0.4)] transition-all hover:brightness-105 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <span aria-hidden className="pointer-events-none absolute inset-x-2 top-0 h-[1px] rounded-full bg-gradient-to-r from-transparent via-white/80 to-transparent" />
                  {isExtracting ? (
                    <>
                      <LoaderCircle size={13} strokeWidth={2.2} className="animate-spin" />
                      <span>{t('place.extractingTags')}</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={13} strokeWidth={2.2} />
                      <span>{t('place.extractTagsBtn')}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </section>
        </div>

        {/* Footer Action Bar */}
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--mist)]/60 px-5 py-4 bg-white/30 dark:bg-black/20 backdrop-blur-md">
          <button
            type="button"
            onClick={() => setDraft({ ...DEFAULT_RECOMMENDATION_PREFERENCES })}
            className="inline-flex items-center gap-1 rounded-full border border-black/10 dark:border-white/10 bg-white/70 dark:bg-white/10 px-3.5 py-1.5 text-xs font-medium text-[var(--stone)] hover:text-[var(--ink)] hover:bg-white dark:hover:bg-white/20 shadow-2xs transition-all active:scale-95 cursor-pointer"
          >
            <RotateCcw size={12} />
            <span>{t('common.reset')}</span>
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-black/10 dark:border-white/10 bg-white/70 dark:bg-white/10 px-4 py-1.5 text-xs font-medium text-[var(--stone)] hover:text-[var(--ink)] hover:bg-white dark:hover:bg-white/20 shadow-2xs transition-all active:scale-95 cursor-pointer"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={() => {
                onSave(draft)
                onClose()
              }}
              className="group relative isolate inline-flex items-center gap-1.5 rounded-full bg-[var(--ink)] dark:bg-[var(--copper)] px-5 py-1.5 text-xs sm:text-sm font-semibold text-[var(--paper)] dark:text-white shadow-[0_3px_10px_rgba(0,0,0,0.14)] dark:shadow-[0_3px_10px_rgba(212,131,84,0.25)] transition-all hover:bg-black dark:hover:bg-[var(--copper)]/90 active:scale-95 cursor-pointer"
            >
              <span aria-hidden className="pointer-events-none absolute inset-x-2 top-0 h-[1px] rounded-full bg-gradient-to-r from-transparent via-white/40 to-transparent" />
              <Check size={13} strokeWidth={2.2} />
              <span>{t('place.savePreferences')}</span>
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
                  initial={{ opacity: 0, scale: 0.94, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.94, y: 8 }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  className="relative z-10 w-full max-w-md overflow-hidden rounded-3xl border border-white/80 dark:border-white/15 bg-white/90 dark:bg-[#1c2420]/95 p-5 sm:p-6 shadow-[0_25px_60px_rgba(0,0,0,0.24),inset_0_1px_2px_rgba(255,255,255,1)] dark:shadow-[0_25px_60px_rgba(0,0,0,0.6)] backdrop-blur-2xl"
                >
                  {/* Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-amber-300/60 bg-amber-500/12 text-amber-700 shadow-2xs backdrop-blur-md">
                        <Sparkles size={17} strokeWidth={2.2} />
                      </div>
                      <div className="min-w-0 pt-0.5">
                        <h3 id="extracted-dialog-title" className="font-display text-base sm:text-lg font-semibold text-[var(--ink)] tracking-tight">
                          {t('place.extractedSuccessTitle')}
                        </h3>
                        <p className="mt-0.5 text-xs text-[var(--stone)] leading-relaxed">
                          {t('place.extractedSuccessDesc')}
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
                            <span className="relative z-10">{localizePrefTag(clean)}</span>
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
                      className="min-h-[34px] rounded-full border border-black/8 dark:border-white/10 bg-white/70 dark:bg-white/10 px-3.5 py-1 text-xs font-medium text-[var(--stone)] dark:text-zinc-300 shadow-2xs backdrop-blur-md transition-all hover:bg-white dark:hover:bg-white/20 hover:text-[var(--ink)] active:scale-95 cursor-pointer"
                    >
                      {t('place.discard')}
                    </button>

                    <button
                      type="button"
                      onClick={handleAddToCandidatePool}
                      className="min-h-[34px] rounded-full border border-black/10 dark:border-white/10 bg-white/85 dark:bg-white/15 px-4 py-1 text-xs font-medium text-[var(--ink)] shadow-2xs backdrop-blur-md transition-all hover:bg-white dark:hover:bg-white/25 active:scale-95 cursor-pointer"
                    >
                      {t('place.addToCandidates')}
                    </button>

                    <button
                      type="button"
                      onClick={handleAddToActivePool}
                      className="group relative isolate inline-flex min-h-[34px] items-center gap-1.5 rounded-full bg-[var(--ink)] px-4.5 py-1 text-xs font-semibold text-[var(--paper)] shadow-[0_4px_14px_rgba(0,0,0,0.18),inset_0_1px_1px_rgba(255,255,255,0.25)] transition-all hover:bg-black active:scale-95 cursor-pointer"
                    >
                      <Sparkles size={12} className="text-amber-300" />
                      <span>{t('place.addToActive')}</span>
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
