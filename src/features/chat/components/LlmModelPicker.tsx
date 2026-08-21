import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronDown } from 'lucide-react'
import { Checkbox } from '../../../shared/components/Checkbox'
import { useBodyScrollLock } from '../../../shared/hooks/useBodyScrollLock'
import { glassBackdropSurfaceClass } from '../../../shared/styles/glassCapsule'
import {
  DEEPSEEK_MODEL_OPTIONS,
  getActiveLlmLabel,
  getOpenAIModelShortLabel,
  getThinkingEffort,
  isDeepSeekModel,
  isLlmConfigured,
  isLockedThinkingMode,
  OPENAI_ONLY_MODEL_OPTIONS,
  setThinkingEnabled,
  setThinkingEffort,
  setThinkingMode,
  supportsThinkingControls,
  THINKING_EFFORT_OPTIONS,
  type ThinkingEffortUi,
  type ThinkingMode,
} from '../../../shared/services/llm/llm'
import { useLlmSettings } from '../hooks/useOpenAIModel'

type Props = {
  /** Disable while a long LLM job is in flight (optional). */
  disabled?: boolean
  className?: string
}

type Panel = 'root' | 'model'

// Spring for the chip↔popover morph. Same feel as TripChatPanel: a touch
// of overshoot (iOS modal presentation) settling in ~320ms.
const MORPH_SPRING = { type: 'spring' as const, stiffness: 350, damping: 30 }

// Popover width target: 17.5rem max, but never wider than viewport − 2.5rem
// margin (prevents the popover from running off the left edge on narrow phones).
const POPOVER_MAX_WIDTH = 'min(calc(100vw - 2.5rem), 17.5rem)'

const GLASS_INNER_CARD_CLASS =
  'relative overflow-hidden rounded-2xl border border-white/90 bg-[#fbf7f3]/85 shadow-[0_2px_8px_rgba(0,0,0,0.03),inset_0_1.5px_2px_rgba(255,255,255,1),inset_0_-1px_1.5px_rgba(255,255,255,0.7)] backdrop-blur-md before:pointer-events-none before:absolute before:inset-x-3 before:top-0 before:h-[1.5px] before:rounded-full before:bg-gradient-to-r before:from-transparent before:via-white before:to-transparent before:opacity-95'

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  )
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia(query)
    setMatches(mq.matches)
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [query])
  return matches
}

/**
 * FAB chip that morphs into a popover at the same position (iOS Reminders
 * pattern). Two-stage animation:
 *   - opening:  width 48→POPOVER_MAX_WIDTH first, then height 48→measured
 *   - closing:  height measured→48 first, then width →48
 * Asymmetric close matches "card collapsing back" rather than reversing
 * the opening axis. Single `<div role="button">` swaps role/aria-label/
 * tabIndex/keydown between button (closed) and dialog (open) — same
 * a11y tradeoff as TripChatPanel.
 *
 * NOTE: the height delay during the opening morph is read from
 * `prevOpenRef` (not `useState` + `useEffect`) because the first render
 * after `open` flips needs to know `justOpened` synchronously — otherwise
 * the height animation starts with `delay: 0` on the first frame, then
 * the second render swaps the delay in mid-animation, which Framer
 * Motion doesn't pick up. The ref is updated in `useLayoutEffect` (not
 * during render) so React 18 strict mode's double-render doesn't leak
 * the in-render mutation from call #1 into call #2.
 *
 * Positioning: `position: fixed` anchored to the viewport bottom-right with
 * the same offsets the outer FAB container uses.
 *
 * Both the chip and the popover content layers are absolutely-positioned
 * overlays (the chip always, the popover always). An invisible sentinel
 * `<div>` renders the same popover markup off-screen for height
 * measurement; a ResizeObserver reads its `offsetHeight` and feeds it
 * back into `animate.height` so the motion.div always matches the
 * popover's natural height. `prevOpenRef` lets the first render after
 * `open` flips to true see `justOpened=true`, so the height animation
 * gets its 0.18s delay from the start (otherwise `useState` + `useEffect`
 * would only flip on the second render and the morph would run as
 * simultaneous width+height). Internal content changes (panel swap,
 * thinking toggle) leave `justOpened=false` and animate immediately.
 * `heightAnimating` is set to true on those same triggers and cleared
 * by the motion.div's `onAnimationComplete('height')` callback, so
 * `overflow: hidden` is held while ANY height animation is in flight
 * (opening morph, internal re-target, closing morph) — `overflow: auto`
 * would briefly show a scrollbar while the content is taller than
 * the in-flight motion.div.
 *
 * The model list expands inside its own frosted card. Like the thinking
 * controls, that card owns its grid-row height animation while the outer
 * shell follows the sentinel's final measurement with matching timing.
 *
 * The thinking card owns both auto ↔ manual and on ↔ off height changes.
 * Its bottom edge stays pinned above the model section, so revealing content
 * grows the card upward and naturally pushes the thinking header with it.
 * The sentinel skips those transitions and reports the final height
 * immediately; the outer shell then follows with the same timing instead of
 * adding a second, competing layout animation.
 */
export function LlmModelPicker({ disabled = false, className = '' }: Props) {
  const { model, setModel, thinkingMode } = useLlmSettings()
  const [open, setOpen] = useState(false)
  useBodyScrollLock(open)
  const [panel, setPanel] = useState<Panel>('root')
  // The model list grows nicely with the popover's strong ease-out, but the
  // same curve removes too much height too early on the return trip. Keep the
  // navigation direction latched until that height animation completes so
  // the ResizeObserver re-render cannot accidentally swap its transition.
  const panelHeightDirectionRef = useRef<'idle' | 'expand' | 'collapse'>('idle')
  const rootRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const popoverId = useId()
  // Sentinel measures the popover's natural height. With all real layers
  // absolutely positioned, there's nothing in-flow for `height: 'auto'`
  // to measure against, so we duplicate the markup off-screen and let a
  // ResizeObserver feed the value back into the animate.height target.
  const [popoverHeight, setPopoverHeight] = useState(168)
  // Mobile: closed chip is a 48px circle. Desktop: closed chip is a pill
  // (auto width up to 15.5rem, 48px tall) — the morph widens the pill
  // before the popover content unfurls upward.
  const isDesktop = useMediaQuery('(min-width: 640px)')
  const canThink = supportsThinkingControls(model)
  const deepseek = isDeepSeekModel(model)

  // Track the popover's natural height. Re-measures when `open`, `panel`,
  // `model`, or `thinkingMode` change.
  useLayoutEffect(() => {
    const update = () => {
      const hSentinel = sentinelRef.current?.offsetHeight || 0
      const hContent = contentRef.current?.offsetHeight || 0
      const h = hSentinel > 0 ? hSentinel : hContent
      if (h > 0) setPopoverHeight(h)
    }
    update()
    const observer = new ResizeObserver(update)
    if (sentinelRef.current) observer.observe(sentinelRef.current)
    if (contentRef.current) observer.observe(contentRef.current)
    return () => observer.disconnect()
  }, [open, panel, model, thinkingMode])

  // Track whether we're currently in the chip→popover opening morph so
  // the height animation can be delayed (width-first → height-second, the
  // iOS Reminders staged feel). Internal content changes (panel swap,
  // thinking toggle) don't want that delay — the user expects immediate
  // motion when they click something, not a "wait then grow" lag.
  //
  // `heightAnimating` is `true` while the motion.div's height is in
  // flight (opening morph, internal re-targets from panel switch /
  // thinking toggle, closing morph). It's exposed as state because the
  // rendered `overflow` value depends on it: the popover content can be
  // taller than the in-flight height mid-morph, and `overflow: auto`
  // would briefly show a scrollbar. We keep `overflow: hidden` while
  // the height is animating, then flip to `'hidden auto'` so the panel
  // can scroll if it ever exceeds maxHeight.
  //
  // The previous-open ref is updated in useLayoutEffect (not in render)
  // because React 18 strict mode invokes the render function twice; an
  // in-render mutation would leak from call #1 into call #2 and make
  // `justOpened` false on the second (committed) call, dropping the
  // height delay. useLayoutEffect runs after both render calls, so
  // both see the same value.
  const prevOpenRef = useRef(open)
  const justOpened = open && !prevOpenRef.current
  useLayoutEffect(() => {
    prevOpenRef.current = open
  }, [open])
  const [heightAnimating, setHeightAnimating] = useState(false)
  // Mark animating synchronously with any state change that re-targets
  // height: `open` flipping (opening morph), `open` flipping back
  // (closing morph), or panel / model / thinkingMode changing while
  // open (internal re-target). The `onAnimationComplete` callback
  // on the motion.div flips it back.
  useLayoutEffect(() => {
    setHeightAnimating(true)
  }, [open, panel, model, thinkingMode])

  useEffect(() => {
    if (!open) {
      panelHeightDirectionRef.current = 'idle'
      setPanel('root')
      return
    }
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (panel !== 'root') {
          panelHeightDirectionRef.current = 'collapse'
          setPanel('root')
        }
        else setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, panel])

  if (!isLlmConfigured()) return null

  const chip = getOpenAIModelShortLabel(model)
  const fullLabel = getActiveLlmLabel(model)
  const panelIsCollapsing = panelHeightDirectionRef.current === 'collapse'

  const navigatePanel = (nextPanel: Panel) => {
    panelHeightDirectionRef.current = nextPanel === 'model' ? 'expand' : 'collapse'
    setPanel(nextPanel)
  }

  const toggleModelPanel = () => {
    navigatePanel(panel === 'model' ? 'root' : 'model')
  }

  const selectModelAndCollapse = (nextModel: string) => {
    setModel(nextModel)
    navigatePanel('root')
  }

  return (
    <>
      {/* Sentinel -- off-screen, unclipped, non-interactive copy of the popover content.
          Placed OUTSIDE the transformed/filtered motion.div container so WebKit on iOS Safari
          measures the true, unclipped natural height. */}
      <div
        ref={sentinelRef}
        aria-hidden="true"
        style={{
          position: 'fixed',
          left: '-9999px',
          top: 0,
          width: 'min(calc(100vw - 2.5rem), 17.5rem)',
          pointerEvents: 'none',
          visibility: 'hidden',
          zIndex: -1,
        }}
      >
        <div className="p-3.5">
          {canThink ? (
            <ThinkingControls mode={thinkingMode} disabled={disabled} measureOnly />
          ) : (
            <div>
              <SectionHeader>思考</SectionHeader>
              <div className={`${GLASS_INNER_CARD_CLASS} px-3 py-2.5`}>
                <p className="text-xs leading-snug text-[var(--stone)]">
                  当前模型不支持思考强度设置
                </p>
              </div>
            </div>
          )}

          <ModelSettingsPanel
            model={model}
            disabled={disabled}
            expanded={panel === 'model'}
            measureOnly
            canThink={canThink}
            onToggle={toggleModelPanel}
            onSelect={selectModelAndCollapse}
          />
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            key="llm-picker-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.24, ease: 'easeOut' }}
            aria-hidden="true"
            className={`fixed inset-0 z-[2040] select-none [touch-action:none] pointer-events-auto ${glassBackdropSurfaceClass}`}
            onPointerDown={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setOpen(false)
            }}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setOpen(false)
            }}
          />
        )}
      </AnimatePresence>

      <motion.div
        ref={rootRef}
        id={popoverId}
        role={open ? 'dialog' : 'button'}
        tabIndex={open ? -1 : 0}
        aria-haspopup={!open ? 'dialog' : undefined}
        aria-expanded={open}
        aria-label={open ? '模型与思考设置' : fullLabel}
        title={!open ? fullLabel : undefined}
        onClick={open ? undefined : () => setOpen(true)}
        onKeyDown={
          open
            ? undefined
            : (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  setOpen(true)
                }
              }
        }
        whileTap={open ? undefined : { scale: 0.96 }}
        initial={false}
        animate={{
          width: open ? POPOVER_MAX_WIDTH : isDesktop ? 'auto' : 48,
          height: open ? popoverHeight : 48,
        }}
        transition={{
          // Width keeps the spring feel (chip → pill morph has a touch of
          // overshoot). Height uses a smooth tween (no spring overshoot on
          // internal content re-targets). The opening morph stages width
          // first then height (0.18s delay) so the chip "expands then
          // grows"; everything else animates both at once.
          width: { ...MORPH_SPRING, delay: open ? 0 : 0.18 },
          height: {
            duration: panelIsCollapsing ? 0.36 : 0.32,
            ease: panelIsCollapsing
              ? [0.4, 0, 0.2, 1]
              : [0.22, 1, 0.36, 1],
            delay: justOpened ? 0.18 : 0,
          },
        }}
        onAnimationComplete={() => {
          setHeightAnimating(false)
          panelHeightDirectionRef.current = 'idle'
        }}
        style={{
          // Anchored to the viewport (not a 0x0 relative wrapper) so the
          // desktop pill actually has room to size itself. Responsive
          // bottom/right mirror the outer FAB container offsets so the
          // picker sits in the same corner on mobile (above chat) and
          // desktop (left of chat).
          position: 'fixed',
          bottom: isDesktop
            ? '1.25rem'
            : 'calc(max(1.15rem, env(safe-area-inset-bottom)) + 8.35rem)',
          right: isDesktop
            ? 'calc(max(1.25rem, env(safe-area-inset-right)) + 3.625rem)'
            : 'max(1.25rem, env(safe-area-inset-right))',
          zIndex: open ? 2050 : 1,
          borderRadius: 24,
          // overflow: hidden while closed or while the height is animating (opening morph,
          // internal re-target from panel switch / thinking toggle, closing
          // morph) — the popover content can be taller than the in-flight
          // motion.div, so 'auto' would briefly show a scrollbar. Once
          // the height run settles (onAnimationComplete), we switch to
          // 'hidden auto' so the panel can scroll if the sentinel-reported
          // height ever exceeds maxHeight.
          overflow: !open || heightAnimating ? 'hidden' : 'hidden auto',
          // Cap the popover so it never extends past the top of the viewport.
          // 2.5rem = 40px headroom (20px top + 20px bottom margins).
          maxHeight: 'calc(100vh - 2.5rem)',
          transformOrigin: 'bottom right',
          color: 'var(--ink)',
          backgroundColor: 'rgba(255, 255, 255, 0.85)',
          border: '1px solid rgba(255, 255, 255, 0.9)',
          boxShadow:
            '0 8px 32px rgba(0, 0, 0, 0.08), inset 0 1px 1.5px 0 rgba(255, 255, 255, 1)',
          backdropFilter: 'blur(24px) saturate(180%)',
        }}
        className={`fixed [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}
      >
        {/* Visible chip content -- fills the motion.div.
            `pointer-events: none` always: this layer is purely visual; the
            outer motion.div owns the click handler, and when the popover is
            open this overlay would otherwise swallow clicks meant for the
            model/thinking controls underneath. */}
        <motion.div
          initial={false}
          animate={{ opacity: open ? 0 : 1 }}
          transition={{
            opacity: { duration: 0.2, delay: open ? 0 : 0.28, ease: 'easeOut' },
          }}
          aria-hidden={!open}
          style={{
            pointerEvents: 'none',
          }}
          className="relative flex h-full w-full items-center justify-center gap-1.5 px-3 sm:max-w-[15.5rem] sm:gap-2 sm:px-3.5"
        >
          {/* Top specular reflection arc */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-2 top-0 h-[1.5px] rounded-full bg-gradient-to-r from-transparent via-white to-transparent opacity-95"
          />
          <ModelBrandIcon deepseek={deepseek} className="h-5 w-5 shrink-0 drop-shadow-[0_1px_2px_rgba(0,0,0,0.06)] sm:h-4 sm:w-4" />
          <span className="hidden whitespace-nowrap text-sm font-semibold leading-none text-zinc-800 sm:inline">{chip}</span>
          <ChevronDown
            aria-hidden
            strokeWidth={2}
            className={`hidden h-3 w-3 shrink-0 text-zinc-500 transition duration-200 sm:block ${
              open ? 'rotate-180' : ''
            }`}
          />
        </motion.div>

        {/* Visible popover content -- absolute overlay, fills the motion.div.
            Thinking and model controls stay in one bottom-anchored layout;
            their inner cards expand upward and move the content above them. */}
        <motion.div
          initial={false}
          animate={{ opacity: open ? 1 : 0 }}
          transition={{
            opacity: { duration: 0.2, delay: open ? 0.18 : 0, ease: 'easeOut' },
          }}
          inert={!open || undefined}
          aria-hidden={!open}
          style={{ position: 'absolute', inset: 0 }}
          className="flex flex-col overflow-hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {/* Top Specular Streaming Reflection Line */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-3 top-0 h-[1.5px] rounded-full bg-gradient-to-r from-transparent via-white to-transparent opacity-95 z-10"
          />

          <div ref={contentRef} className="absolute inset-x-0 bottom-0 p-3.5">
          {canThink ? (
            <ThinkingControls mode={thinkingMode} disabled={disabled} />
          ) : (
            <div>
              <SectionHeader>思考</SectionHeader>
              <div className={`${GLASS_INNER_CARD_CLASS} px-3 py-2.5`}>
                <p className="text-xs leading-snug text-[var(--stone)]">
                  当前模型不支持思考强度设置
                </p>
              </div>
            </div>
          )}

          <ModelSettingsPanel
            model={model}
            disabled={disabled}
            expanded={panel === 'model'}
            canThink={canThink}
            onToggle={toggleModelPanel}
            onSelect={selectModelAndCollapse}
          />
        </div>
      </motion.div>
    </motion.div>
  </>
)
}

function ThinkingControls({
  mode,
  disabled,
  measureOnly = false,
}: {
  mode: ThinkingMode
  disabled?: boolean
  measureOnly?: boolean
}) {
  const autoCheckboxId = useId()
  const thinkingOn = mode !== 'off'
  const autoOn = mode === 'auto'
  const autoDisabled = disabled || !thinkingOn
  // Preserve the active mode while the master switch is off. This keeps the
  // hidden slider at its previous intrinsic height, so the master transition
  // only has one changing dimension: the thinking-card content row itself.
  const lastActiveModeRef = useRef<Exclude<ThinkingMode, 'off'>>(
    mode === 'off' ? 'auto' : mode,
  )
  const preservedActiveMode = thinkingOn ? mode : lastActiveModeRef.current
  const sliderExpanded = preservedActiveMode !== 'auto'
  useLayoutEffect(() => {
    if (mode !== 'off') lastActiveModeRef.current = mode
  }, [mode])
  const sliderValue: ThinkingEffortUi = isLockedThinkingMode(mode)
    ? mode
    : getThinkingEffort()

  const setAuto = (on: boolean) => {
    if (on) setThinkingMode('auto')
    else setThinkingEffort(getThinkingEffort())
  }

  const layoutTransition = {
    duration: 0.32,
    ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
  }
  const instantTransition = { duration: 0 }

  return (
    <div className="flex flex-col justify-end">
      {/* L1: section header + master capsule — same weight as 「模型」 */}
      <div className="flex items-center gap-3 px-1">
        <p className="min-w-0 flex-1 text-sm font-semibold text-[var(--ink)]">思考</p>
        <PillSwitch
          checked={thinkingOn}
          disabled={disabled}
          ariaLabel="开启思考"
          onCheckedChange={setThinkingEnabled}
        />
      </div>

      {/* L2: one bottom-anchored card. Its two content rows trade height so
          master on/off and auto/manual both move the top edge, never scale it. */}
      <div className={`${GLASS_INNER_CARD_CLASS} mt-2.5`}>
        <motion.div
          initial={{ gridTemplateRows: thinkingOn ? '1fr' : '0fr' }}
          animate={{
            gridTemplateRows: thinkingOn ? '1fr' : '0fr',
          }}
          style={{ gridTemplateRows: thinkingOn ? '1fr' : '0fr' }}
          transition={
            measureOnly
              ? instantTransition
              : { gridTemplateRows: layoutTransition }
          }
          inert={!thinkingOn || undefined}
          aria-hidden={!thinkingOn}
          className="grid"
        >
          <motion.div
            initial={{ opacity: thinkingOn ? 1 : 0 }}
            animate={{ opacity: thinkingOn ? 1 : 0 }}
            transition={
              measureOnly
                ? instantTransition
                : {
                    duration: thinkingOn ? 0.18 : 0.12,
                    delay: thinkingOn ? 0.1 : 0,
                    ease: 'easeOut',
                  }
            }
            className="min-h-0 overflow-hidden"
          >
            <div className="p-2.5">
              <label
                htmlFor={autoCheckboxId}
                className={`flex items-start gap-2.5 ${
                  autoDisabled ? 'cursor-default' : 'cursor-pointer'
                }`}
              >
                <Checkbox
                  id={autoCheckboxId}
                  checked={autoOn}
                  disabled={autoDisabled}
                  onCheckedChange={setAuto}
                  size="sm"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold leading-snug text-[var(--ink)]">
                    自动选择强度
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-[var(--stone)]">
                    按当前操作自动选择思考强度
                  </span>
                </span>
              </label>

              <motion.div
                initial={{ gridTemplateRows: sliderExpanded ? '1fr' : '0fr' }}
                animate={{
                  gridTemplateRows: sliderExpanded ? '1fr' : '0fr',
                }}
                style={{ gridTemplateRows: sliderExpanded ? '1fr' : '0fr' }}
                transition={
                  measureOnly
                    ? instantTransition
                    : { gridTemplateRows: layoutTransition }
                }
                inert={!sliderExpanded || undefined}
                aria-hidden={!sliderExpanded}
                className="grid"
              >
                <motion.div
                  initial={{ opacity: sliderExpanded ? 1 : 0 }}
                  animate={{ opacity: sliderExpanded ? 1 : 0 }}
                  transition={
                    measureOnly
                      ? instantTransition
                      : {
                          duration: sliderExpanded ? 0.18 : 0.12,
                          delay: sliderExpanded ? 0.1 : 0,
                          ease: 'easeOut',
                        }
                  }
                  className="min-h-0 overflow-hidden"
                >
                  <div className="pt-2">
                    <ThinkingIntensitySlider
                      value={sliderValue}
                      disabled={disabled || !thinkingOn || !sliderExpanded}
                      onChange={setThinkingEffort}
                    />
                  </div>
                </motion.div>
              </motion.div>
            </div>
          </motion.div>
        </motion.div>

        <motion.div
          initial={{ gridTemplateRows: thinkingOn ? '0fr' : '1fr' }}
          animate={{
            gridTemplateRows: thinkingOn ? '0fr' : '1fr',
          }}
          style={{ gridTemplateRows: thinkingOn ? '0fr' : '1fr' }}
          transition={
            measureOnly
              ? instantTransition
              : { gridTemplateRows: layoutTransition }
          }
          inert={thinkingOn || undefined}
          aria-hidden={thinkingOn}
          className="grid"
        >
          <motion.div
            initial={{ opacity: thinkingOn ? 0 : 1 }}
            animate={{ opacity: thinkingOn ? 0 : 1 }}
            transition={
              measureOnly
                ? instantTransition
                : {
                    duration: thinkingOn ? 0.12 : 0.18,
                    delay: thinkingOn ? 0 : 0.1,
                    ease: 'easeOut',
                  }
            }
            className="min-h-0 overflow-hidden"
          >
            <div className="flex items-center gap-2 px-3 py-2">
              <span
                aria-hidden
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--stone)]/60"
              />
              <p className="text-xs leading-snug text-[var(--stone)]">
                跳过额外推理，响应更直接
              </p>
            </div>
          </motion.div>
        </motion.div>
      </div>

      <span className="sr-only">当前模式 {mode}</span>
    </div>
  )
}

function SectionHeader({ children }: { children: ReactNode }) {
  return (
    <p className="mb-1 px-1 text-sm font-semibold text-[var(--ink)]">{children}</p>
  )
}

/** Classic track + white thumb; active = sage/mint. Primary hierarchy (思考). */
function PillSwitch({
  checked,
  disabled,
  ariaLabel,
  onCheckedChange,
}: {
  checked: boolean
  disabled?: boolean
  ariaLabel: string
  onCheckedChange: (on: boolean) => void
}) {
  const [hasToggled, setHasToggled] = useState(false)

  return (
    <motion.button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      whileTap={disabled ? undefined : { scale: 0.94 }}
      onClick={() => {
        setHasToggled(true)
        onCheckedChange(!checked)
      }}
      className={`relative h-[1.65rem] w-[2.85rem] shrink-0 rounded-full border border-white/90 p-0.5 transition-colors duration-250 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sage)]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--card)] shadow-[inset_0_1.5px_2.5px_rgba(0,0,0,0.12),inset_0_-1px_1px_rgba(255,255,255,0.7)] backdrop-blur-md disabled:opacity-50 cursor-pointer ${
        checked
          ? 'bg-[var(--sage)]'
          : 'bg-[var(--ink)]/16'
      }`}
    >
      <motion.span
        aria-hidden
        animate={{
          x: checked ? 19.5 : 0,
          scaleX: hasToggled ? [1, 1.22, 0.94, 1] : 1,
          scaleY: hasToggled ? [1, 0.86, 1.04, 1] : 1,
        }}
        transition={{
          x: { type: 'spring', stiffness: 500, damping: 28, mass: 0.8 },
          scaleX: { duration: 0.32, ease: [0.22, 1, 0.36, 1] },
          scaleY: { duration: 0.32, ease: [0.22, 1, 0.36, 1] },
        }}
        className="block h-5 w-5 rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.18),0_1px_2px_rgba(0,0,0,0.1),inset_0_1.5px_1.5px_rgba(255,255,255,1)]"
      />
    </motion.button>
  )
}

/** Secondary checkbox — nested under 思考 (自动), distinct from primary PillSwitch. */


/** Three snap positions: 低 · 中 · 高 (自动 is a separate nested checkbox). */
const THINKING_SLIDER_OPTIONS = THINKING_EFFORT_OPTIONS.map((o) => ({
  id: o.id,
  label: o.label,
}))

const THINKING_SLIDER_STOPS = [0, 0.5, 1] as const

function clamp01(r: number) {
  return Math.min(1, Math.max(0, r))
}

function nearestStopIndex(r: number): number {
  let best = 0
  let bestDist = Infinity
  for (let i = 0; i < THINKING_SLIDER_STOPS.length; i++) {
    const d = Math.abs(r - THINKING_SLIDER_STOPS[i]!)
    if (d < bestDist) {
      bestDist = d
      best = i
    }
  }
  return best
}

function nearestStop(r: number): number {
  return THINKING_SLIDER_STOPS[nearestStopIndex(r)] ?? 0
}

/**
 * Magnetic pull while dragging: follow finger, but rubber-band toward nearest stop.
 * Stronger attraction inside a snap well; lighter elsewhere so it still feels sticky.
 */
function magnetize(raw: number): number {
  const r = clamp01(raw)
  const stop = nearestStop(r)
  const dist = Math.abs(r - stop)
  // Snap well ~0.16 of track (3 stops); pull hard near stops, softer mid-gap.
  const well = 0.16
  const pull = dist < well ? 0.72 + (1 - dist / well) * 0.18 : 0.42
  return r + (stop - r) * pull
}

/** Discrete 低 · 中 · 高 magnetic slider (ParisTour palette). */
function ThinkingIntensitySlider({
  value,
  disabled,
  onChange,
}: {
  value: ThinkingEffortUi
  disabled?: boolean
  onChange: (mode: ThinkingEffortUi) => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  const [dragging, setDragging] = useState(false)
  const [settling, setSettling] = useState(false)
  const [dragRatio, setDragRatio] = useState<number | null>(null)
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const index = THINKING_SLIDER_OPTIONS.findIndex((o) => o.id === value)
  const safeIndex = index < 0 ? 1 : index
  const settledRatio = THINKING_SLIDER_STOPS[safeIndex] ?? 0.5
  const ratio = dragRatio ?? settledRatio
  const label = THINKING_SLIDER_OPTIONS[safeIndex]?.label ?? '中'
  const activeStop = nearestStop(ratio)

  const ratioFromClientX = (clientX: number) => {
    const el = trackRef.current
    if (!el) return settledRatio
    const rect = el.getBoundingClientRect()
    const inset = 10
    const usable = Math.max(1, rect.width - inset * 2)
    return clamp01((clientX - rect.left - inset) / usable)
  }

  const commitStop = (r: number) => {
    const next = THINKING_SLIDER_OPTIONS[nearestStopIndex(r)]
    if (next) onChange(next.id)
  }

  const clearSettleTimer = () => {
    if (settleTimerRef.current) {
      clearTimeout(settleTimerRef.current)
      settleTimerRef.current = null
    }
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    clearSettleTimer()
    setSettling(false)
    draggingRef.current = true
    setDragging(true)
    const raw = ratioFromClientX(e.clientX)
    const mag = magnetize(raw)
    setDragRatio(mag)
    commitStop(mag)
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current || disabled) return
    const raw = ratioFromClientX(e.clientX)
    const mag = magnetize(raw)
    setDragRatio(mag)
    commitStop(mag)
  }

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return
    draggingRef.current = false
    const raw = ratioFromClientX(e.clientX)
    const stop = nearestStop(raw)
    commitStop(stop)
    setDragging(false)
    // Brief settle with spring ease into the stop (visual overshoot via cubic-bezier).
    setDragRatio(stop)
    setSettling(true)
    clearSettleTimer()
    settleTimerRef.current = setTimeout(() => {
      setDragRatio(null)
      setSettling(false)
      settleTimerRef.current = null
    }, 280)
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* already released */
    }
  }

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (disabled) return
    const max = THINKING_SLIDER_OPTIONS.length - 1
    let next = safeIndex
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = Math.min(max, safeIndex + 1)
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = Math.max(0, safeIndex - 1)
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = max
    else return
    e.preventDefault()
    onChange(THINKING_SLIDER_OPTIONS[next]!.id)
    setSettling(true)
    clearSettleTimer()
    settleTimerRef.current = setTimeout(() => {
      setSettling(false)
      settleTimerRef.current = null
    }, 280)
  }

  useEffect(() => () => clearSettleTimer(), [])

  // Two parallel transition policies because fill bar and knob have different
  // tracking needs during a drag:
  //   - Fill bar uses CSS (`motionEase`) + inline `style.width`. The width
  //     value updates synchronously with React state, so on a fast drag the
  //     bar stays glued to the thumb. Framer Motion's `animate` runs through
  //     setState and lags inline style by a frame, which is visible as
  //     "fill stops halfway while the thumb keeps moving".
  //   - Knob uses Framer Motion (`motionTransition`) for scale + box-shadow.
  //     The knob's `left` is still inline style (sync). The scale / shadow
  //     only change on drag start/end so the 1-frame lag is imperceptible.
  // Pointer events, magnetize(), and commitStop() are kept verbatim — they're
  // the project's magnetic-snap business logic.
  const motionEase = dragging
    ? ''
    : settling
      ? 'duration-[280ms] ease-[cubic-bezier(0.34,1.45,0.64,1)]'
      : 'duration-200 ease-[cubic-bezier(0.34,1.15,0.64,1)]'
  const motionTransition = dragging
    ? { duration: 0 }
    : settling
      ? { duration: 0.28, ease: [0.34, 1.45, 0.64, 1] as [number, number, number, number] }
      : { duration: 0.2, ease: [0.34, 1.15, 0.64, 1] as [number, number, number, number] }

  return (
    <div className={disabled ? 'opacity-50' : ''}>
      <div
        ref={trackRef}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label="思考强度"
        aria-valuemin={0}
        aria-valuemax={THINKING_SLIDER_OPTIONS.length - 1}
        aria-valuenow={safeIndex}
        aria-valuetext={label}
        aria-disabled={disabled || undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        className={`group relative touch-none select-none py-2 outline-none focus-visible:ring-2 focus-visible:ring-[var(--sage)]/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--mist)] ${
          disabled ? 'pointer-events-none' : 'cursor-pointer'
        }`}
      >
        {/* Thick recessed track */}
        <div
          aria-hidden
          className="relative h-3 w-full overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--mist)_55%,var(--stone)_45%)] shadow-[inset_0_1px_2px_rgba(28,36,32,0.18)]"
        >
          {/*
            Fill bar — CSS transition + inline `style.width` (not Framer Motion).
            Two reasons: (1) drag-time tracking has to be frame-perfect, and
            Framer Motion's `animate` runs through setState so the bar can lag
            a frame behind the thumb on a fast drag; (2) the inset-10px look
            on the left only works when width is `calc(10px + ratio*(100%-20px))`
            and the container starts at left:0, so the bar visually reaches the
            left edge for any non-zero ratio.
          */}
          <div
            aria-hidden
            className={`absolute inset-y-0 left-0 rounded-full bg-[color-mix(in_srgb,var(--sage)_88%,#7a9a8e)] ${
              motionEase ? `transition-[width] ${motionEase}` : ''
            }`}
            style={{ width: `calc(10px + ${ratio} * (100% - 20px))` }}
          />
        </div>

        {/* Tick marks at 低 / 中 / 高 */}
        <div
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-[10px] right-[10px] -translate-y-1/2"
        >
          {THINKING_SLIDER_STOPS.map((stop) => {
            const on = Math.abs(activeStop - stop) < 0.01
            return (
              <span
                key={stop}
                className={`absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors duration-150 ${
                  on
                    ? 'bg-[var(--sage)] ring-2 ring-[color-mix(in_srgb,var(--sage)_35%,transparent)]'
                    : 'bg-[var(--ink)]/22'
                }`}
                style={{ left: `${stop * 100}%` }}
              />
            )
          })}
        </div>

        {/* Knob */}
        <div
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-[10px] right-[10px] -translate-y-1/2"
        >
          {/*
            Knob: left stays as inline % (the magnetic-snap math is in %).
            Motion drives only `scale` + `box-shadow` — the two properties
            that previously needed a ternary className + transition.
            CSS still handles group-hover / group-focus-visible.
          */}
          <motion.div
            className="absolute top-1/2 h-[1.3125rem] w-[1.3125rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white group-hover:scale-[1.12] group-hover:shadow-[0_2px_8px_rgba(28,36,32,0.24)] group-focus-visible:scale-[1.12]"
            animate={{
              scale: dragging ? 1.18 : 1,
              boxShadow: dragging
                ? '0 3px 10px rgba(28, 36, 32, 0.28)'
                : '0 1px 4px rgba(28, 36, 32, 0.2), 0 0 0 1px rgba(28, 36, 32, 0.06)',
            }}
            transition={motionTransition}
            style={{ left: `${ratio * 100}%`, willChange: 'transform' }}
          />
        </div>
      </div>

      <div className="mt-0.5 grid grid-cols-3 px-0.5" aria-hidden>
        {THINKING_SLIDER_OPTIONS.map((opt, i) => (
          <span
            key={opt.id}
            className={`text-[10px] transition-colors duration-200 ${
              i === 0 ? 'text-left' : i === THINKING_SLIDER_OPTIONS.length - 1 ? 'text-right' : 'text-center'
            } ${
              safeIndex === i ? 'font-medium text-[var(--sage)]' : 'text-[var(--stone)]'
            }`}
          >
            {opt.label}
          </span>
        ))}
      </div>
    </div>
  )
}

/**
 * Official provider marks (trademarks of DeepSeek / OpenAI — UI identification only).
 * Assets: public/brand/deepseek.svg, public/brand/openai.svg — see public/brand/README.md.
 */
function ModelBrandIcon({
  deepseek,
  className = 'h-4 w-4',
}: {
  deepseek: boolean
  className?: string
}) {
  return (
    <img
      src={deepseek ? '/brand/deepseek.svg' : '/brand/openai.svg'}
      alt=""
      aria-hidden
      draggable={false}
      className={`${className} block aspect-square object-contain`}
    />
  )
}
function ModelSettingsPanel({
  model,
  disabled,
  expanded,
  measureOnly = false,
  canThink,
  onToggle,
  onSelect,
}: {
  model: string
  disabled?: boolean
  expanded: boolean
  measureOnly?: boolean
  canThink: boolean
  onToggle: () => void
  onSelect: (model: string) => void
}) {
  const optionsId = useId()
  const deepseek = isDeepSeekModel(model)
  const instantTransition = { duration: 0 }
  const heightTransition = expanded
    ? {
        duration: 0.32,
        ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
      }
    : {
        duration: 0.36,
        ease: [0.4, 0, 0.2, 1] as [number, number, number, number],
      }

  return (
    <div className={`${canThink ? 'mt-3.5' : 'mt-3'} border-t border-white/85 pt-3`}>
      <SectionHeader>模型</SectionHeader>
      <div className={GLASS_INNER_CARD_CLASS}>
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={optionsId}
          disabled={disabled}
          onClick={onToggle}
          className="relative flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm font-semibold text-[var(--ink)] transition-colors hover:bg-white/55 disabled:opacity-50 cursor-pointer"
        >
          <ModelBrandIcon deepseek={deepseek} className="h-3.5 w-3.5" />
          <span className="min-w-0 flex-1">{getOpenAIModelShortLabel(model)}</span>
          <ChevronDown
            aria-hidden
            className={`h-3.5 w-3.5 shrink-0 text-[var(--stone)] transition-transform duration-200 ${
              expanded ? 'rotate-180' : ''
            }`}
            strokeWidth={2}
          />
        </button>

        <motion.div
          id={optionsId}
          initial={{ gridTemplateRows: expanded ? '1fr' : '0fr' }}
          animate={{ gridTemplateRows: expanded ? '1fr' : '0fr' }}
          style={{ gridTemplateRows: expanded ? '1fr' : '0fr' }}
          transition={measureOnly ? instantTransition : { gridTemplateRows: heightTransition }}
          inert={!expanded || undefined}
          aria-hidden={!expanded}
          className="grid"
        >
          <motion.div
            initial={{ opacity: expanded ? 1 : 0 }}
            animate={{ opacity: expanded ? 1 : 0 }}
            transition={
              measureOnly
                ? instantTransition
                : {
                    duration: expanded ? 0.18 : 0.12,
                    delay: expanded ? 0.08 : 0,
                    ease: 'easeOut',
                  }
            }
            className="min-h-0 overflow-hidden"
          >
            <div className="border-t border-white/85 pb-1">
              <ModelGroup label="DeepSeek">
                {DEEPSEEK_MODEL_OPTIONS.map((option) => (
                  <ModelOption
                    key={option.id}
                    label={option.shortLabel}
                    detail={option.description}
                    selected={option.id === model}
                    disabled={disabled}
                    icon={<ModelBrandIcon deepseek className="h-4 w-4" />}
                    onSelect={() => onSelect(option.id)}
                  />
                ))}
              </ModelGroup>
              <ModelGroup label="OpenAI" withTopDivider>
                {OPENAI_ONLY_MODEL_OPTIONS.map((option) => (
                  <ModelOption
                    key={option.id}
                    label={option.shortLabel}
                    detail={option.description}
                    selected={option.id === model}
                    disabled={disabled}
                    icon={<ModelBrandIcon deepseek={false} className="h-4 w-4" />}
                    onSelect={() => onSelect(option.id)}
                  />
                ))}
              </ModelGroup>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </div>
  )
}

function ModelGroup({
  label,
  children,
  withTopDivider = false,
}: {
  label: string
  children: ReactNode
  withTopDivider?: boolean
}) {
  return (
    <div className={`py-1 ${withTopDivider ? 'border-t border-white/80 mt-1 pt-1.5' : ''}`}>
      <p className="px-3.5 py-1 text-[10px] font-semibold tracking-wider text-[var(--stone)] uppercase">
        {label}
      </p>
      <ul role="listbox" aria-label={label} className="space-y-0.5 px-1.5">
        {children}
      </ul>
    </div>
  )
}

function ModelOption({
  label,
  detail,
  selected,
  disabled,
  icon,
  onSelect,
}: {
  label: string
  detail: string
  selected: boolean
  disabled?: boolean
  icon?: ReactNode
  onSelect: () => void
}) {
  return (
    <li role="option" aria-selected={selected}>
      <button
        type="button"
        disabled={disabled}
        onClick={onSelect}
        className={`group flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm transition-all duration-150 active:scale-[0.98] ${
          selected
            ? 'border border-white/90 bg-white/85 shadow-[0_1px_5px_rgba(0,0,0,0.04),inset_0_1px_1.5px_rgba(255,255,255,1)] backdrop-blur-sm'
            : 'border border-transparent hover:border-white/70 hover:bg-white/50'
        } disabled:opacity-50 cursor-pointer`}
      >
        <span
          aria-hidden
          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-all duration-150 ${
            selected
              ? 'border-[var(--sage)] bg-[var(--sage)] text-white shadow-[0_1px_2px_rgba(0,0,0,0.12)]'
              : 'border-[var(--ink)]/20 bg-white/40 group-hover:border-[var(--ink)]/35'
          }`}
        >
          {selected && <Check className="h-2.5 w-2.5" strokeWidth={2.5} />}
        </span>
        {icon && <span className="shrink-0 transition-transform group-hover:scale-105">{icon}</span>}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold leading-tight text-[var(--ink)]">
            {label}
          </span>
          <span className="mt-0.5 block truncate text-[11px] font-normal leading-tight text-[var(--stone)]">
            {detail}
          </span>
        </span>
      </button>
    </li>
  )
}
