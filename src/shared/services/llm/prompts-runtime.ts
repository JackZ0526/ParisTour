import { runtimeCopy3 } from '../../i18n/copy/prompts-runtime-runtime3-67eb72'
/**
 * Preflight (semantic router) + web-research augmentation for chat calls.
 *
 * The actual HTTP transport lives in transport.ts. This module owns:
 *   - the compact semantic classifier that decides `needsWeb` and the
 *     per-task thinking effort (so a JSON-rewrite task doesn't waste
 *     tokens thinking about its rewrite)
 *   - the `<untrusted_research_data>` injection path that runs an
 *     OpenAI Responses web search and feeds the result into the chat
 *     messages as untrusted data (so the model can't be tricked by it)
 *
 * Both are pure orchestration — no HTTP, no parsing.
 */
import { tryJevRoute } from './jev-router'
import { buildPrompt } from './prompts'
import { getThinkingMode } from './model-state'
import { resolveThinkingForTask } from './thinking'
import type {
  ChatCallOptions,
  LlmTaskKind,
  OpenAIChatMessage,
  ResolvedThinking,
  ResolvedThinkingEffort,
} from './types'

type ModelCallPreflight = {
  thinking: ResolvedThinking
  needsWeb: boolean
}

const PREFLIGHT_FREE_TASKS = new Set<LlmTaskKind>([
  'translate',
  'dayCopy',
  'placeDescription',
  'placeDetail',
  'hotelDetail',
  'itineraryStart',
  'itineraryGenerate',
  'itineraryDayGenerate',
])

const TASK_THINKING: Record<
  LlmTaskKind | 'default',
  { baseline: ResolvedThinkingEffort; min: ResolvedThinkingEffort; max: ResolvedThinkingEffort }
> = {
  default: { baseline: 'low', min: 'off', max: 'medium' },
  tripChat: { baseline: 'low', min: 'off', max: 'high' },
  dayCopy: { baseline: 'off', min: 'off', max: 'off' },
  translate: { baseline: 'off', min: 'off', max: 'off' },
  placeRecommend: { baseline: 'low', min: 'off', max: 'medium' },
  placeDescription: { baseline: 'low', min: 'off', max: 'medium' },
  placeDetail: { baseline: 'low', min: 'off', max: 'medium' },
  placeName: { baseline: 'off', min: 'off', max: 'off' },
  placeReviews: { baseline: 'low', min: 'off', max: 'medium' },
  hotelRecommend: { baseline: 'low', min: 'off', max: 'medium' },
  hotelDetail: { baseline: 'low', min: 'off', max: 'medium' },
  // Structured JSON / pure copy: thinking CoT shares max_tokens and often yields empty content.
  itineraryGenerate: { baseline: 'off', min: 'off', max: 'off' },
  itineraryDayGenerate: { baseline: 'off', min: 'off', max: 'off' },
  itineraryTranslate: { baseline: 'off', min: 'off', max: 'off' },
  itineraryStart: { baseline: 'low', min: 'off', max: 'low' },
  destinationSuggest: { baseline: 'off', min: 'off', max: 'off' },
  preferenceExtract: { baseline: 'off', min: 'off', max: 'off' },
  router: { baseline: 'off', min: 'off', max: 'off' },
}

function clampEffort(
  effort: ResolvedThinkingEffort,
  min: ResolvedThinkingEffort,
  max: ResolvedThinkingEffort,
): ResolvedThinkingEffort {
  const rank: Record<ResolvedThinkingEffort, number> = {
    off: 0,
    low: 1,
    medium: 2,
    high: 3,
  }
  const v = rank[effort]
  return v < rank[min] ? min : v > rank[max] ? max : effort
}

function thinkingFromEffort(effort: ResolvedThinkingEffort): ResolvedThinking {
  return effort === 'off'
    ? { enabled: false, effort: 'low', source: 'auto' as const }
    : { enabled: true, effort, source: 'auto' as const }
}

function preflightEffortFromText(value: unknown): ResolvedThinkingEffort | null {
  const effort = String(value || '').trim().toLowerCase()
  if (effort === 'off' || effort === 'low' || effort === 'medium' || effort === 'high') {
    return effort
  }
  return null
}

function compactPreflightContext(
  messages: OpenAIChatMessage[],
  options?: ChatCallOptions,
) {
  const lastUser = [...messages].reverse().find((message) => message.role === 'user')
  const firstSystem = messages.find((message) => message.role === 'system')
  return {
    task: options?.task || 'default',
    userText: String(options?.userText || lastUser?.content || '').slice(0, 1200),
    taskInstructions: String(firstSystem?.content || '').slice(0, 700),
    semanticContext:
      options?.preflightContext == null
        ? undefined
        : JSON.stringify(options.preflightContext).slice(0, 2500),
  }
}

function explicitGenericWebRequest(text: string): boolean {
  return /联网|上网|网络搜索|网页搜索|web\s*search|search\s+the\s+web|网上查|查一下最新/i.test(text)
}

function fallbackGenericNeedsWeb(text: string): boolean {
  return /最新|实时|目前|现在|近期|今天|今年|本周|本月|营业时间|开门|关门|票价|价格|天气|气温|降雨|罢工|交通状态|活动|展览|演出|比赛结果|谁赢了|评分|评论数|current|latest|today|weather|opening\s*hours?|price|event|score/i.test(
    text,
  )
}

function injectWebResearch(
  messages: OpenAIChatMessage[],
  research: string,
): OpenAIChatMessage[] {
  const content = [
    '<untrusted_research_data>',
    runtimeCopy3('mbc2441e4f7', undefined),
    '',
    research.slice(0, 7000),
    '</untrusted_research_data>',
  ].join('\n')
  const guard: OpenAIChatMessage = {
    role: 'system',
    content:
      runtimeCopy3('mc83b4fbb94', undefined),
  }
  const at = messages.map((message) => message.role).lastIndexOf('user')
  if (at < 0) return [...messages, guard, { role: 'user', content }]
  return [
    ...messages.slice(0, at),
    guard,
    { role: 'user' as const, content },
    ...messages.slice(at),
  ]
}

/**
 * Semantic tool + thinking router shared by every OpenAI/DeepSeek chat
 * call. The router call explicitly disables its own preflight, so it
 * cannot recurse.
 */
export async function resolveModelCallPreflight(
  messages: OpenAIChatMessage[],
  options?: ChatCallOptions,
): Promise<ModelCallPreflight> {
  const taskBounds = TASK_THINKING[options?.task || 'default'] || TASK_THINKING.default
  const mode = getThinkingMode()
  const rawFallback = resolveThinkingForTask(
    mode,
    options?.userText,
    options?.task || 'default',
  )
  let fallbackEffort: ResolvedThinkingEffort
  if (mode === 'off' || !rawFallback.enabled) {
    fallbackEffort = 'off'
  } else if (mode === 'auto') {
    const heuristic = rawFallback.effort === 'off' ? 'low' : rawFallback.effort
    // Prefer the task baseline when the heuristic only returned generic low.
    const preferred = heuristic === 'low' ? taskBounds.baseline : heuristic
    fallbackEffort = clampEffort(preferred, taskBounds.min, taskBounds.max)
  } else {
    fallbackEffort = clampEffort(mode, taskBounds.min, taskBounds.max)
  }
  const fallback = thinkingFromEffort(fallbackEffort)

  if (options?.preflight === false) {
    return { thinking: options.thinking || fallback, needsWeb: options.webSearch === true }
  }

  if (PREFLIGHT_FREE_TASKS.has(options?.task || 'default')) {
    const task = options?.task || 'default'
    // Itinerary JSON tasks: always force thinking off (Responses/chat CoT
    // otherwise burns the shared output budget). Web search for itinerary is
    // handled natively on DeepSeek Responses (`tools: web_search`), not via
    // the generic research-injection path — keep needsWeb false here.
    if (task === 'itineraryGenerate' || task === 'itineraryDayGenerate') {
      return {
        thinking: { enabled: false, effort: 'off', source: 'auto' },
        needsWeb: false,
      }
    }
    return {
      thinking: options?.thinking || fallback,
      needsWeb: false,
    }
  }

  const context = compactPreflightContext(messages, options)
  const routingText = `${context.userText}\n${context.taskInstructions}`
  const forcedWeb = options?.webSearch === true || explicitGenericWebRequest(routingText)
  const forbiddenWeb = options?.webSearch === false
  let classifiedEffort: ResolvedThinkingEffort | null = null
  let classifiedNeedsWeb: boolean | null = null

  const jev = await tryJevRoute('preflight', context, options?.signal)
  if (jev) {
    classifiedEffort = jev.reasoningEffort
    classifiedNeedsWeb = jev.needsWeb
  }
  if (!jev) {
    try {
      const { callOpenAIMessages } = await import('./transport')
      const { extractLlmJsonObject } = await import('./json')
      const raw = await callOpenAIMessages(
        [
          {
            role: 'system',
            content: [
              runtimeCopy3('m0913556c79', undefined),
              runtimeCopy3('me2bca20fc7', undefined),
              runtimeCopy3('m6038d495f1', undefined),
              runtimeCopy3('mbe7787c57c', undefined),
              runtimeCopy3('m3c7c38cbd3', undefined),
              runtimeCopy3('meb8581e044', undefined),
              runtimeCopy3('m17368ff0b4', undefined),
              runtimeCopy3('m64214e1a5b', undefined),
              runtimeCopy3('m430f9bdecd', undefined),
              runtimeCopy3('m03ddc9fb3e', undefined),
            ].join('\n'),
          },
          {
            role: 'user',
            content: JSON.stringify(context),
          },
        ],
        {
          task: 'router',
          userText: 'model-call-preflight',
          thinking: { enabled: false, effort: 'low', source: 'auto' },
          preflight: false,
          webSearch: false,
          responseFormat: 'json_object',
          signal: options?.signal,
        },
      )
      const parsed = extractLlmJsonObject(raw)
      classifiedEffort = preflightEffortFromText(parsed?.reasoningEffort ?? parsed?.effort)
      if (typeof parsed?.needsWeb === 'boolean') classifiedNeedsWeb = parsed.needsWeb
    } catch (error) {
      if (options?.signal?.aborted) throw error
    }
  }

  const classifiedForTask = classifiedEffort
    ? clampEffort(classifiedEffort, taskBounds.min, taskBounds.max)
    : null
  const thinking =
    options?.thinking ||
    (getThinkingMode() === 'auto' && classifiedForTask
      ? thinkingFromEffort(classifiedForTask)
      : fallback)
  const needsWeb = forbiddenWeb
    ? false
    : forcedWeb
      ? true
      : classifiedNeedsWeb ?? fallbackGenericNeedsWeb(routingText)
  return { thinking, needsWeb }
}

export async function addGenericWebResearch(
  messages: OpenAIChatMessage[],
  options: ChatCallOptions | undefined,
  preflight: ModelCallPreflight,
): Promise<OpenAIChatMessage[]> {
  if (!preflight.needsWeb) return messages
  const context = compactPreflightContext(messages, options)
  try {
    const { openaiResponsesWithWebSearch } = await import('./stream')
    const research = await openaiResponsesWithWebSearch({
      instructions: buildPrompt(
        runtimeCopy3('m8a96101e08', undefined),
        null,
        runtimeCopy3('mbac5555e02', { p0: (context.task), p1: (context.taskInstructions) }),
        runtimeCopy3('m021c1e9cf6', undefined),
      ),
      user: context.userText,
      signal: options?.signal,
    })
    return research.text.trim() ? injectWebResearch(messages, research.text) : messages
  } catch (error) {
    if (options?.signal?.aborted) throw error
    return messages
  }
}
