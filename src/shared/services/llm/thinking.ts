/**
 * Thinking-mode helpers (UI ↔ API mapping + classifier heuristics).
 *
 * Pulled out of llm.ts so the 134KB monolith stops being a 1:1 mess of
 * types, options, and helpers mixed with HTTP transport.
 */
import type {
  DeepSeekReasoningEffort,
  LlmBusyVisual,
  LlmTaskKind,
  OpenAIReasoningEffort,
  ResolvedThinking,
  ThinkingEffortUi,
  ThinkingMode,
} from './types'

/** UI "低/中/高" → DeepSeek `low|high|max`. */
export function uiEffortToApi(effort: ThinkingEffortUi): DeepSeekReasoningEffort {
  if (effort === 'low') return 'low'
  if (effort === 'medium') return 'high'
  return 'max'
}

/**
 * Auto classifier: heuristic bucket. The 「自动」 mode keeps DeepSeek
 * at "low" by default and only escalates for hard tasks; GPT-5.6 always
 * uses its native low|medium|high tiers.
 */
export function autoEffortToDeepSeekApi(
  task: LlmTaskKind | undefined,
  userText: string | undefined,
): DeepSeekReasoningEffort {
  const bucket = thinkingHeuristicBucket(task, userText)
  if (bucket === 'easy') return 'low'
  if (bucket === 'hard') return 'max'
  return 'low'
}

export function resolvedThinkingToDeepSeekApi(
  resolved: ResolvedThinking,
): DeepSeekReasoningEffort {
  if (!resolved.enabled) return 'low'
  if (resolved.effort === 'off') return 'low'
  return uiEffortToApi(resolved.effort)
}

export function deepSeekThinkingParams(thinking: ResolvedThinking): {
  thinking?: { type: 'enabled' | 'disabled' }
  reasoning_effort?: DeepSeekReasoningEffort
} {
  if (!thinking.enabled) return { thinking: { type: 'disabled' } }
  return {
    thinking: { type: 'enabled' },
    reasoning_effort: resolvedThinkingToDeepSeekApi(thinking),
  }
}

/**
 * DeepSeek Responses API thinking control (`reasoning.effort`).
 * Docs: omit → thinking ON by default; `none` forces thinking off.
 */
export function deepSeekResponsesReasoning(
  thinking: ResolvedThinking,
): { effort: 'none' | 'low' | 'high' | 'max' } {
  if (!thinking.enabled) return { effort: 'none' }
  return { effort: resolvedThinkingToDeepSeekApi(thinking) }
}

export function uiEffortToOpenAI(
  effort: ThinkingEffortUi | 'off',
): OpenAIReasoningEffort {
  if (effort === 'off') return 'none'
  if (effort === 'low') return 'low'
  if (effort === 'medium') return 'medium'
  return 'high'
}

export const THINKING_MODE_OPTIONS: Array<{
  id: ThinkingMode
  label: string
}> = [
  { id: 'auto', label: '自动' },
  { id: 'off', label: '关闭' },
  { id: 'low', label: '低' },
  { id: 'medium', label: '中' },
  { id: 'high', label: '高' },
]

export const THINKING_EFFORT_OPTIONS: Array<{
  id: ThinkingEffortUi
  label: string
}> = [
  { id: 'low', label: '低' },
  { id: 'medium', label: '中' },
  { id: 'high', label: '高' },
]

/** Heuristic nudge of the auto classifier: -1 (simpler), 0 (default), +1 (harder). */
export function thinkingHeuristicDelta(userText?: string): -1 | 0 | 1 {
  if (!userText) return 0
  if (
    /为什么|为甚么|为何|对比|比较|重新规划|怎么安排|如何安排|权衡|取舍|分析|优化|全面|仔细|详细说明|利弊/.test(
      userText,
    )
  ) {
    return 1
  }
  return 0
}

function thinkingHeuristicBucket(
  task: LlmTaskKind | undefined,
  userText: string | undefined,
): 'easy' | 'default' | 'hard' {
  // Day copy / destination suggest / place name: easy.
  if (task === 'dayCopy' || task === 'destinationSuggest' || task === 'placeName') {
    return 'easy'
  }
  // Full / single-day itinerary: structured JSON with verified candidates —
  // medium planning is enough; "hard" would map UI-high → DeepSeek max CoT.
  if (task === 'itineraryGenerate' || task === 'itineraryDayGenerate') {
    return 'default'
  }
  const delta = thinkingHeuristicDelta(userText)
  if (delta > 0) return 'hard'
  return 'default'
}

const THINKING_MODES: ReadonlySet<string> = new Set([
  'auto',
  'off',
  'low',
  'medium',
  'high',
])

/**
 * Resolve ThinkingMode → concrete effort + enabled flag.
 *  - 「auto」 runs the classifier per task
 *  - 「off」  disables thinking
 *  - explicit low/medium/high uses that bucket
 *
 * Call as `resolveThinkingForTask(getThinkingMode(), userText, task)`.
 * If a caller accidentally passes `task` as the first arg (legacy stage-3
 * call sites), treat first arg as task and fall back to auto mode so we
 * don't map unknown strings to DeepSeek `max` via `uiEffortToApi`.
 */
export function resolveThinkingForTask(
  mode: ThinkingMode,
  userText?: string,
  task?: LlmTaskKind,
): ResolvedThinking {
  if (!THINKING_MODES.has(mode)) {
    return resolveThinkingForTask('auto', userText, mode as LlmTaskKind)
  }
  if (mode === 'off') return { enabled: false, effort: 'off', source: 'manual' }
  if (mode === 'auto') {
    const bucket = thinkingHeuristicBucket(task, userText)
    if (bucket === 'easy') return { enabled: true, effort: 'low', source: 'auto' }
    if (bucket === 'hard') return { enabled: true, effort: 'high', source: 'auto' }
    return { enabled: true, effort: 'low', source: 'auto' }
  }
  return { enabled: true, effort: mode as ThinkingEffortUi, source: 'manual' }
}

export function resolveLlmBusyVisual(options?: {
  mode?: ThinkingMode
  userText?: string
  task?: LlmTaskKind
  thinkingEnabled?: boolean
}): LlmBusyVisual {
  const mode = options?.mode
  if (mode === 'off') return 'generating'
  if (options?.thinkingEnabled === false) return 'generating'
  if (mode === 'auto') {
    const bucket = thinkingHeuristicBucket(options?.task, options?.userText)
    if (bucket === 'hard') return 'thinking'
    return 'generating'
  }
  return 'thinking'
}

export function llmBusyDefaultLabel(visual: LlmBusyVisual): string {
  return visual === 'thinking' ? '正在思考…' : '正在生成…'
}

export function llmBusyLabel(options: {
  visual: LlmBusyVisual
  task?: LlmTaskKind
  custom?: Partial<Record<string, string>>
}): string {
  if (options.custom && options.task) {
    const override = options.custom[options.task]
    if (override) return override
  }
  return llmBusyDefaultLabel(options.visual)
}

/** True when the mode is fixed to a single effort (cannot toggle auto/off). */
export function isLockedThinkingMode(mode: ThinkingMode): mode is ThinkingEffortUi {
  return mode === 'low' || mode === 'medium' || mode === 'high'
}
