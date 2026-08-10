import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
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
} from '../services/llm'
import { useLlmSettings } from '../hooks/useOpenAIModel'

type Props = {
  /** Disable while a long LLM job is in flight (optional). */
  disabled?: boolean
  className?: string
}

type Panel = 'root' | 'model'

/**
 * Compact FAB chip + popover:
 * brand icon + model name + chevron; thinking controls live in the popover only.
 * ParisTour paper/ink/sage palette.
 */
export function LlmModelPicker({ disabled = false, className = '' }: Props) {
  const { model, setModel, thinkingMode } = useLlmSettings()
  const [open, setOpen] = useState(false)
  const [panel, setPanel] = useState<Panel>('root')
  const rootRef = useRef<HTMLDivElement>(null)
  const popoverId = useId()
  const canThink = supportsThinkingControls(model)
  const deepseek = isDeepSeekModel(model)

  useEffect(() => {
    if (!open) {
      setPanel('root')
      return
    }
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (panel !== 'root') setPanel('root')
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

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={popoverId}
        aria-label={fullLabel}
        title={fullLabel}
        onClick={() => setOpen((v) => !v)}
        className="group flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[var(--ink)]/12 bg-[var(--card)] text-xs font-medium text-[var(--ink)] shadow-[0_8px_24px_rgba(28,36,32,0.08)] backdrop-blur transition hover:border-[var(--sage)]/40 hover:bg-[color-mix(in_srgb,var(--paper)_92%,white)] disabled:opacity-50 sm:h-auto sm:w-auto sm:max-w-[15.5rem] sm:justify-start sm:gap-1.5 sm:px-3 sm:py-2.5 sm:text-sm"
      >
        <ModelBrandIcon deepseek={deepseek} className="h-5 w-5 shrink-0 sm:h-4 sm:w-4" />
        <span className="hidden min-w-0 truncate tracking-tight sm:inline">{chip}</span>
        <svg
          aria-hidden
          viewBox="0 0 12 12"
          className={`hidden h-2.5 w-2.5 shrink-0 text-[var(--stone)] transition duration-200 sm:block ${
            open ? 'rotate-180' : ''
          }`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 4.5 6 7.5 9 4.5" />
        </svg>
      </button>

      {open && (
        <div
          id={popoverId}
          role="dialog"
          aria-label="模型与思考设置"
          className="absolute bottom-[calc(100%+0.5rem)] right-0 z-[1] w-[min(calc(100vw-2.5rem),17.5rem)] overflow-hidden rounded-2xl border border-[var(--ink)]/10 bg-[var(--card)] shadow-[var(--shadow)] backdrop-blur"
        >
          {panel === 'root' && (
            <div className="p-3.5">
              {canThink ? (
                <ThinkingControls mode={thinkingMode} disabled={disabled} />
              ) : (
                <div>
                  <SectionHeader>思考</SectionHeader>
                  <div className="rounded-xl bg-[var(--mist)]/45 px-3 py-2.5">
                    <p className="text-[11px] leading-snug text-[var(--stone)]">
                      当前模型不支持思考强度设置
                    </p>
                  </div>
                </div>
              )}

              <div className={`${canThink ? 'mt-3.5' : 'mt-3'} border-t border-[var(--ink)]/8 pt-2.5`}>
                <SectionHeader>模型</SectionHeader>
                <SettingsRow
                  label={getOpenAIModelShortLabel(model)}
                  icon={<ModelBrandIcon deepseek={deepseek} className="h-3.5 w-3.5" />}
                  disabled={disabled}
                  onClick={() => setPanel('model')}
                />
              </div>
            </div>
          )}

          {panel === 'model' && (
            <SubPanel title="模型" onBack={() => setPanel('root')}>
              <ModelGroup label="DeepSeek">
                {DEEPSEEK_MODEL_OPTIONS.map((m) => (
                  <ModelOption
                    key={m.id}
                    label={m.shortLabel}
                    detail={m.label}
                    selected={m.id === model}
                    disabled={disabled}
                    icon={<ModelBrandIcon deepseek className="h-4 w-4" />}
                    onSelect={() => {
                      setModel(m.id)
                      setPanel('root')
                    }}
                  />
                ))}
              </ModelGroup>
              <ModelGroup label="OpenAI">
                {OPENAI_ONLY_MODEL_OPTIONS.map((m) => (
                  <ModelOption
                    key={m.id}
                    label={m.shortLabel}
                    detail={m.label}
                    selected={m.id === model}
                    disabled={disabled}
                    icon={<ModelBrandIcon deepseek={false} className="h-4 w-4" />}
                    onSelect={() => {
                      setModel(m.id)
                      setPanel('root')
                    }}
                  />
                ))}
              </ModelGroup>
            </SubPanel>
          )}
        </div>
      )}
    </div>
  )
}

function ThinkingControls({
  mode,
  disabled,
}: {
  mode: ThinkingMode
  disabled?: boolean
}) {
  const autoCheckboxId = useId()
  const thinkingOn = mode !== 'off'
  const autoOn = mode === 'auto'
  const autoDisabled = disabled || !thinkingOn
  const sliderValue: ThinkingEffortUi = isLockedThinkingMode(mode)
    ? mode
    : getThinkingEffort()

  const setAuto = (on: boolean) => {
    if (on) setThinkingMode('auto')
    else setThinkingEffort(getThinkingEffort())
  }

  return (
    <div>
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

      {/* L2: nested under 思考 — 自动 checkbox (child) + 低/中/高 when custom */}
      <div
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
          thinkingOn ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="mt-2.5 ml-1 rounded-xl bg-[var(--mist)]/40 px-2.5 py-2 pl-3">
            <label
              htmlFor={autoCheckboxId}
              className={`flex items-start gap-2.5 ${
                autoDisabled ? 'cursor-default' : 'cursor-pointer'
              }`}
            >
              <SecondaryCheckbox
                id={autoCheckboxId}
                checked={autoOn}
                disabled={autoDisabled}
                onCheckedChange={setAuto}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-medium leading-snug text-[var(--stone)]">
                  自动选择强度
                </span>
                <span className="mt-0.5 block text-[10px] leading-snug text-[var(--stone)]/70">
                  按当前操作自动选择思考强度
                </span>
              </span>
            </label>

            <div
              className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${
                autoOn ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'
              }`}
            >
              <div className="min-h-0 overflow-hidden">
                <div className="pt-2">
                  <ThinkingIntensitySlider
                    value={sliderValue}
                    disabled={disabled || !thinkingOn || autoOn}
                    onChange={setThinkingEffort}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {!thinkingOn && (
        <div className="mt-2.5 flex items-center gap-2 rounded-xl bg-[var(--mist)]/35 px-2.5 py-2">
          <span
            aria-hidden
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--stone)]/45"
          />
          <p className="text-[11px] leading-snug text-[var(--stone)]">
            跳过额外推理，响应更直接
          </p>
        </div>
      )}

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
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={`relative h-[1.55rem] w-[2.75rem] shrink-0 rounded-full transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sage)]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--card)] disabled:opacity-50 ${
        checked
          ? 'bg-[var(--sage)]'
          : 'bg-[var(--ink)]/14'
      }`}
    >
      <span
        aria-hidden
        className={`absolute top-[2px] left-[2px] h-[calc(1.55rem-4px)] w-[calc(1.55rem-4px)] rounded-full bg-white shadow-[0_1px_3px_rgba(28,36,32,0.22)] transition-transform duration-200 ease-[cubic-bezier(0.34,1.2,0.64,1)] ${
          checked ? 'translate-x-[1.2rem]' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

/** Secondary checkbox — nested under 思考 (自动), distinct from primary PillSwitch. */
function SecondaryCheckbox({
  id,
  checked,
  disabled,
  onCheckedChange,
}: {
  id: string
  checked: boolean
  disabled?: boolean
  onCheckedChange: (on: boolean) => void
}) {
  return (
    <span className="relative mt-0.5 flex shrink-0">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onCheckedChange(e.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className={`flex h-4 w-4 items-center justify-center rounded-[4px] border transition-colors duration-150 peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--sage)]/35 peer-focus-visible:ring-offset-1 peer-focus-visible:ring-offset-[var(--mist)] peer-disabled:opacity-50 peer-checked:border-[var(--sage)] peer-checked:bg-[var(--sage)] peer-checked:text-white ${
          checked ? '' : 'border-[var(--ink)]/22 bg-[var(--card)]'
        }`}
      >
        <svg
          viewBox="0 0 12 12"
          className={`h-2.5 w-2.5 transition-opacity duration-100 ${
            checked ? 'opacity-100' : 'opacity-0'
          }`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.25"
        >
          <path d="M2.5 6.2 4.8 8.5 9.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </span>
  )
}

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

  const motionEase = settling
    ? 'duration-[280ms] ease-[cubic-bezier(0.34,1.45,0.64,1)]'
    : dragging
      ? ''
      : 'duration-200 ease-[cubic-bezier(0.34,1.15,0.64,1)]'

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
          <div
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
          <div
            className={`absolute top-1/2 h-[1.3125rem] w-[1.3125rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white will-change-transform ${
              dragging
                ? 'scale-[1.18] shadow-[0_3px_10px_rgba(28,36,32,0.28)]'
                : `shadow-[0_1px_4px_rgba(28,36,32,0.2),0_0_0_1px_rgba(28,36,32,0.06)] transition-[left,transform,box-shadow] ${
                    settling
                      ? 'duration-[280ms] ease-[cubic-bezier(0.34,1.45,0.64,1)]'
                      : 'duration-200 ease-[cubic-bezier(0.34,1.15,0.64,1)]'
                  } group-hover:scale-[1.12] group-hover:shadow-[0_2px_8px_rgba(28,36,32,0.24)] group-focus-visible:scale-[1.12]`
            }`}
            style={{ left: `${ratio * 100}%` }}
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

function ModelGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="py-1">
      <p className="px-3.5 py-1 text-[10px] font-medium tracking-wide text-[var(--stone)] uppercase">
        {label}
      </p>
      <ul role="listbox" aria-label={label}>
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
        className={`flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm transition ${
          selected
            ? 'bg-[var(--sage)]/12 font-medium text-[var(--sage)]'
            : 'text-[var(--ink)] hover:bg-[var(--mist)]/55'
        } disabled:opacity-50`}
      >
        <span
          aria-hidden
          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
            selected
              ? 'border-[var(--sage)] bg-[var(--sage)] text-white'
              : 'border-[var(--ink)]/20'
          }`}
        >
          {selected && (
            <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M2.5 6.2 4.8 8.5 9.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </span>
        {icon && <span className="shrink-0 opacity-80">{icon}</span>}
        <span className="min-w-0">
          <span className="block truncate">{label}</span>
          <span className="block truncate text-[11px] font-normal text-[var(--stone)]">
            {detail}
          </span>
        </span>
      </button>
    </li>
  )
}

function SettingsRow({
  label,
  value,
  icon,
  disabled,
  onClick,
}: {
  label: string
  value?: string
  icon?: ReactNode
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-xl px-1.5 py-2 text-left text-sm transition hover:bg-[var(--mist)]/50 disabled:opacity-50"
    >
      {icon}
      <span className="min-w-0 flex-1 text-[var(--ink)]">{label}</span>
      {value ? (
        <span className="max-w-[7rem] truncate text-[var(--stone)]">{value}</span>
      ) : null}
      <svg
        aria-hidden
        viewBox="0 0 12 12"
        className="h-3 w-3 shrink-0 text-[var(--stone)]"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4.5 2.5 8 6 4.5 9.5" />
      </svg>
    </button>
  )
}

function SubPanel({
  title,
  onBack,
  children,
}: {
  title: string
  onBack: () => void
  children: ReactNode
}) {
  return (
    <div>
      <div className="flex items-center gap-1 border-b border-[var(--ink)]/8 px-2 py-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="返回"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--ink)] transition hover:bg-[var(--mist)]/60"
        >
          <svg
            aria-hidden
            viewBox="0 0 12 12"
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M7.5 2.5 4 6l3.5 3.5" />
          </svg>
        </button>
        <p className="text-sm font-medium text-[var(--ink)]">{title}</p>
      </div>
      {children}
    </div>
  )
}
