import { runtimeCopy } from '../../i18n/copy/transport-runtime-cd1574'
import { localizedCopy } from '../../i18n/copy/transport-cd1574'
/**
 * HTTP transport for the LLM layer.
 *
 * Owns:
 *   - chat-backend routing (OpenAI vs DeepSeek, both via /api/openai-style proxy)
 *   - request body building (chat completions + Gemini)
 *   - transparent retry on empty / invalid JSON body
 *   - error mapping (HTTP status / API error code → LlmRequestError)
 *
 * Streaming and preflight (thinking + web-search router) live in
 * stream.ts and prompts-runtime.ts respectively; this file only knows
 * how to put a body on the wire and read a response back.
 */
import { isLlmConfigured, GEMINI_MODEL } from '../../../config/llmModels'
import { getLocale } from '../../i18n/i18nStore'
import { LlmRequestError } from './errors'
import {
  getActiveLlmLabel,
  getOpenAIModel,
  getThinkingMode,
  isDeepSeekModel,
} from './model-state'
import { getProviderLabel } from './provider-state'
import {
  deepSeekResponsesReasoning,
  deepSeekThinkingParams,
  resolveThinkingForTask,
  uiEffortToOpenAI,
} from './thinking'
import type {
  ChatCallOptions,
  ChatStreamOptions,
  LlmProvider,
  LlmTaskKind,
  OpenAIChatMessage,
  ResolvedThinking,
} from './types'

/** Itinerary tasks that use DeepSeek Responses API (thinking off + web_search). */
const DEEPSEEK_RESPONSES_ITINERARY_TASKS = new Set<LlmTaskKind>([
  'itineraryGenerate',
  'itineraryDayGenerate',
])

/** Responses API supports deepseek-flash. */
const DEEPSEEK_RESPONSES_MODEL = 'deepseek-flash'

/** Shared completion budget: thinking CoT counts toward the same cap as visible content. */
function completionTokenBudget(
  thinking: ResolvedThinking,
  task?: LlmTaskKind,
): number {
  const jsonHeavy =
    task === 'itineraryGenerate' ||
    task === 'itineraryDayGenerate' ||
    task === 'placeRecommend' ||
    task === 'hotelRecommend'
  if (thinking.enabled) {
    // DeepSeek V4 max output is 384K; leave headroom for CoT + full multi-day JSON.
    return jsonHeavy ? 65536 : 32768
  }
  return jsonHeavy ? 24576 : 8192
}

function applyCompletionBudget(
  body: Record<string, unknown>,
  backend: ChatBackend,
  tokens: number,
) {
  if (backend === 'deepseek') {
    delete body.max_completion_tokens
    body.max_tokens = tokens
  } else {
    delete body.max_tokens
    body.max_completion_tokens = tokens
  }
}

/** After reasoning-only empty reply: disable thinking so tokens go to visible JSON. */
function adaptBodyAfterReasoningOnlyEmpty(
  body: Record<string, unknown>,
  backend: ChatBackend,
): void {
  if (backend === 'deepseek') {
    body.thinking = { type: 'disabled' }
    delete body.reasoning_effort
  } else {
    body.reasoning_effort = 'none'
  }
  applyCompletionBudget(body, backend, 24576)
}

/** After a length truncation: raise budget and soften / disable thinking so content can finish. */
function adaptBodyAfterLengthTruncation(
  body: Record<string, unknown>,
  backend: ChatBackend,
  attempt: number,
): void {
  const current = Number(body.max_tokens ?? body.max_completion_tokens ?? 16384) || 16384
  const next = Math.min(Math.max(current * 2, 65536), 131072)
  applyCompletionBudget(body, backend, next)
  if (backend === 'deepseek') {
    if (attempt >= 1) {
      body.thinking = { type: 'disabled' }
      delete body.reasoning_effort
    } else {
      body.thinking = { type: 'enabled' }
      body.reasoning_effort = 'low'
    }
  } else {
    body.reasoning_effort = attempt >= 1 ? 'none' : 'low'
  }
}

function truncationDebugBits(
  body: Record<string, unknown>,
  backend: ChatBackend,
  finish: string,
  contentLen: number,
): string {
  const model = String(body.model || getOpenAIModel())
  const maxTok = body.max_tokens ?? body.max_completion_tokens ?? '?'
  const thinking =
    backend === 'deepseek'
      ? JSON.stringify(body.thinking ?? null)
      : String(body.reasoning_effort ?? 'n/a')
  const effort = body.reasoning_effort != null ? String(body.reasoning_effort) : ''
  return [
    `finish_reason=${finish || 'unknown'}`,
    `content_chars=${contentLen}`,
    `model=${model}`,
    `max_tokens=${maxTok}`,
    `thinking=${thinking}${effort && backend === 'deepseek' ? ` · effort=${effort}` : ''}`,
    `backend=${backend}`,
  ].join(' · ')
}

type ChatBackend = 'openai' | 'deepseek' | 'gemini'

export function chatBackendForModel(modelId = getOpenAIModel()): ChatBackend {
  return isDeepSeekModel(modelId) ? 'deepseek' : 'openai'
}

function chatCompletionsUrl(modelId = getOpenAIModel()): string {
  return chatBackendForModel(modelId) === 'deepseek'
    ? '/api/deepseek/chat/completions'
    : '/api/openai/chat/completions'
}

function deepSeekResponsesUrl(): string {
  return '/api/deepseek/responses'
}

export function shouldUseDeepSeekResponses(task?: LlmTaskKind, modelId = getOpenAIModel()): boolean {
  return (
    chatBackendForModel(modelId) === 'deepseek' &&
    Boolean(task && DEEPSEEK_RESPONSES_ITINERARY_TASKS.has(task))
  )
}

/**
 * Split chat messages into Responses `instructions` + `input`.
 * System/developer → instructions; remaining turns → input item list (or a
 * plain user string when there is a single user message).
 */
function splitMessagesForResponses(messages: OpenAIChatMessage[]): {
  instructions?: string
  input: string | Array<{ type: 'message'; role: string; content: string }>
} {
  const systemParts: string[] = []
  const rest: Array<{ type: 'message'; role: string; content: string }> = []
  for (const message of messages) {
    if (message.role === 'tool') continue
    const content = typeof message.content === 'string' ? message.content : ''
    if (message.role === 'system') {
      if (content.trim()) systemParts.push(content)
      continue
    }
    rest.push({ type: 'message', role: message.role, content })
  }
  const instructions = systemParts.length ? systemParts.join('\n\n') : undefined
  if (rest.length === 1 && rest[0]!.role === 'user') {
    return { instructions, input: rest[0]!.content }
  }
  if (rest.length === 0) {
    return { instructions, input: instructions ? '' : ' ' }
  }
  return { instructions, input: rest }
}

/**
 * Build a DeepSeek Responses API body for itinerary generation.
 * - thinking forced off via `reasoning.effort: "none"` (default is ON)
 * - optional server-side `web_search` with `tool_choice: "auto"` (model chooses; never required)
 * - JSON mode via `text.format.type: "json_object"`
 */
export function buildDeepSeekResponsesBody(
  messages: OpenAIChatMessage[],
  options?: ChatCallOptions,
): Record<string, unknown> {
  const thinking: ResolvedThinking =
    options?.thinking ??
    ({ enabled: false, effort: 'off', source: 'auto' } satisfies ResolvedThinking)
  const { instructions, input } = splitMessagesForResponses(messages)
  const budget = completionTokenBudget(thinking, options?.task)
  // true | 'auto' | undefined → allow tool; false → omit. Never force via tool_choice.
  const allowWeb = options?.webSearch !== false

  const body: Record<string, unknown> = {
    model: DEEPSEEK_RESPONSES_MODEL,
    input,
    // Critical: omit → thinking ON; itinerary must force none.
    reasoning: deepSeekResponsesReasoning(thinking),
    max_output_tokens: budget,
    temperature: 0.7,
  }
  if (instructions) body.instructions = instructions
  if (options?.responseFormat === 'json_object' || options?.json) {
    body.text = { format: { type: 'json_object' } }
  }
  if (allowWeb) {
    body.tools = [{ type: 'web_search' }]
    // Explicit auto — do not use "required" or { type: "web_search" }.
    body.tool_choice = 'auto'
  }
  return body
}

async function callDeepSeekResponses(
  messages: OpenAIChatMessage[],
  options?: ChatCallOptions,
): Promise<string> {
  const { extractResponsesText, consumeResponsesStream } = await import('./stream')
  type ResponsesPayload = import('./stream').OpenAIResponsesPayload

  // Force thinking off for itinerary Responses calls regardless of UI mode.
  const forcedThinking: ResolvedThinking = {
    enabled: false,
    effort: 'off',
    source: 'auto',
  }
  const body = buildDeepSeekResponsesBody(messages, {
    ...options,
    thinking: forcedThinking,
    // Default allow (model decides); only false forbids the tool.
    webSearch: options?.webSearch === false ? false : (options?.webSearch ?? 'auto'),
  })
  const useStream = typeof options?.onDelta === 'function'
  if (useStream) body.stream = true
  const url = deepSeekResponsesUrl()
  const { authFetch } = await import('../../../features/auth/services/authFetch')

  let attempt = 0
  let lastError: unknown = null
  while (attempt < 3) {
    let res: Response
    try {
      res = await authFetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(useStream ? { Accept: 'text/event-stream' } : {}),
        },
        body: JSON.stringify(body),
        signal: options?.signal,
      })
    } catch (err) {
      const sig = options?.signal
      const reason = sig ? (sig as { reason?: unknown }).reason : undefined
      const reasonStr = reason ? String(reason) : ''
      if (sig?.aborted || /timeout/i.test(reasonStr)) {
        const isTimeout = /timeout/i.test(reasonStr)
        throw new LlmRequestError(
          isTimeout ? runtimeCopy('mcddf6b7f3d', undefined) : runtimeCopy('mdf6c507959', undefined),
          isTimeout ? 'timeout' : 'aborted',
        )
      }
      throw err
    }

    if (res.ok) {
      try {
        if (useStream) {
          const { text } = await consumeResponsesStream(
            res,
            options?.signal,
            undefined,
            (full) => options?.onDelta?.('', full),
          )
          if (text) {
            options?.onDelta?.('', text)
            return text
          }
          lastError = new LlmRequestError(
            runtimeCopy('me08e92d810', undefined),
            'empty',
          )
        } else {
          const data = await readResponseJson<ResponsesPayload>(res, 'deepseek')
          if (data.error?.message) {
            throw new LlmRequestError(
              data.error.message,
              data.error.code || data.error.type || 'responses_error',
            )
          }
          if (data.status === 'failed') {
            throw new LlmRequestError(
              data.error?.message || runtimeCopy('m27a262e0b5', undefined),
              data.error?.code || 'failed',
            )
          }

          const text = extractResponsesText(data)
          const reasoningTok = data.usage?.output_tokens_details?.reasoning_tokens ?? 0
          const outputTok = data.usage?.output_tokens ?? 0
          const usageBits = [
            outputTok ? `output_tokens=${outputTok}` : '',
            reasoningTok ? `reasoning_tokens=${reasoningTok}` : '',
          ]
            .filter(Boolean)
            .join(' · ')

          if (data.status === 'incomplete') {
            const reason = data.incomplete_details?.reason || 'unknown'
            if (attempt < 2 && reason === 'max_output_tokens') {
              const current = Number(body.max_output_tokens ?? 24576) || 24576
              body.max_output_tokens = Math.min(Math.max(current * 2, 65536), 131072)
              // Keep thinking off on retry.
              body.reasoning = { effort: 'none' }
              attempt++
              await new Promise((r) => setTimeout(r, 200 * attempt))
              continue
            }
            throw new LlmRequestError(
              runtimeCopy('m7d7b9521cb', { p0: (reason), p1: (usageBits ? ` · ${usageBits}` : '') }),
              'truncated',
            )
          }

          if (text) return text

          lastError = new LlmRequestError(
            runtimeCopy('m518b87e7a7', { p0: (data.status || 'unknown'), p1: (body.model), p2: (usageBits ? ` · ${usageBits}` : '') }),
            'empty',
          )
        }
      } catch (parseError) {
        if (parseError instanceof LlmRequestError) throw parseError
        lastError = parseError
      }
    } else {
      const errText = await res.text().catch(() => '')
      if (
        attempt < 2 &&
        (res.status === 408 ||
          res.status === 425 ||
          res.status === 502 ||
          res.status === 503 ||
          res.status === 504)
      ) {
        attempt++
        await new Promise((r) => setTimeout(r, 250 * attempt))
        continue
      }
      const mapped = friendlyLlmError(res.status, errText, 'deepseek')
      throw new LlmRequestError(
        `${mapped.message}\nHTTP ${res.status} · model=${body.model} · backend=deepseek-responses${errText ? ` · body=${errText.slice(0, 180)}` : ''}`,
        mapped.code,
        res.status,
      )
    }
    attempt++
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 250 * attempt))
    }
  }
  throw (
    lastError ??
    new LlmRequestError(runtimeCopy('m3e597483de', undefined), 'empty')
  )
}

export function friendlyLlmError(
  status: number,
  body: string,
  provider: LlmProvider | ChatBackend,
): LlmRequestError {
  let code = ''
  let apiMessage = ''
  try {
    const parsed = JSON.parse(body) as {
      error?: { message?: string; code?: string; status?: string; type?: string }
    }
    apiMessage = parsed.error?.message || ''
    code = parsed.error?.code || parsed.error?.status || parsed.error?.type || ''
  } catch {
    /* ignore */
  }

  const label =
    provider === 'deepseek'
      ? getActiveLlmLabel()
      : provider === 'openai' || provider === 'gemini'
        ? getProviderLabel(provider)
        : String(provider)

  if (status === 429 || code === 'insufficient_quota' || /quota|rate limit/i.test(apiMessage)) {
    if (provider === 'deepseek') {
      return new LlmRequestError(runtimeCopy('m8b48b81e6a', undefined), code || 'insufficient_quota')
    }
    if (provider === 'openai') {
      return new LlmRequestError(
        runtimeCopy('me132b02501', undefined),
        code || 'insufficient_quota',
      )
    }
    return new LlmRequestError(runtimeCopy('m13f04e3fb3', undefined), code || 'rate_limit')
  }
  const combined = `${apiMessage} ${body}`
  if (
    /Missing Authorization bearer token|Invalid or expired session|Invalid user/i.test(
      combined,
    )
  ) {
    return new LlmRequestError(runtimeCopy('m595b9a7d22', undefined), code || 'auth_error')
  }
  if (/invite-allowlisted|Allowlist check failed/i.test(combined)) {
    return new LlmRequestError(runtimeCopy('m41daba2dee', undefined), code || 'auth_error')
  }
  if (status === 401 || status === 403 || /invalid.?key|incorrect api key/i.test(apiMessage)) {
    const keyHint =
      provider === 'deepseek'
        ? runtimeCopy('ma8e87884a7', undefined)
        : provider === 'openai'
          ? runtimeCopy('maa30d7d259', undefined)
          : runtimeCopy('m63da103e91', undefined)
    return new LlmRequestError(keyHint, code || 'auth_error')
  }

  if (
    /unsupported image|invalid image|formats: webp, png, jpeg/i.test(apiMessage) ||
    /unsupported image/i.test(body)
  ) {
    const locale = getLocale()
    const msg =
      locale === 'en'
        ? localizedCopy('md773dda0fa', undefined, 'en')
        : localizedCopy('md773dda0fa', undefined, 'zh-CN')
    return new LlmRequestError(msg, code || 'unsupported_image')
  }

  const detail = apiMessage || body.slice(0, 160) || `HTTP ${status}`
  return new LlmRequestError(runtimeCopy('m6f6a6028ea', { p0: (label), p1: (detail) }), code || String(status))
}

/**
 * Read + parse a JSON HTTP body without letting bare SyntaxError
 * ("Unexpected end of JSON input") leak into the UI.
 */
export async function readResponseJson<T>(
  res: Response,
  provider: LlmProvider | ChatBackend,
): Promise<T> {
  const raw = await res.text()
  if (!raw.trim()) {
    const emptyHint =
      provider === 'deepseek'
        ? runtimeCopy('mc91c6b3209', undefined)
        : provider === 'gemini'
          ? runtimeCopy('m08a0997259', undefined)
          : runtimeCopy('m55e27b70ec', undefined)
    throw new LlmRequestError(emptyHint, 'empty_body')
  }
  try {
    return JSON.parse(raw) as T
  } catch {
    const parseHint =
      provider === 'deepseek'
        ? runtimeCopy('m0edfcddea7', undefined)
        : provider === 'gemini'
          ? runtimeCopy('m91dc08fb74', undefined)
          : runtimeCopy('mba44192dcd', undefined)
    throw new LlmRequestError(parseHint, 'invalid_json')
  }
}

export async function callGemini(
  system: string,
  user: string,
  options?: { signal?: AbortSignal },
): Promise<string> {
  // Key injected by /api/gemini (Vite proxy or Vercel) — never send from the browser.
  const url = `/api/gemini/v1beta/models/${GEMINI_MODEL}:generateContent`
  const { authFetch } = await import('../../../features/auth/services/authFetch')
  const res = await authFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 4096,
      },
    }),
    signal: options?.signal,
  })
  if (!res.ok) {
    throw friendlyLlmError(res.status, await res.text(), 'gemini')
  }
  const data = await readResponseJson<{
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  }>(res, 'gemini')
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || ''
  if (!text.trim()) throw new LlmRequestError(runtimeCopy('m230c1aada0', undefined), 'empty')
  return text.trim()
}

/** gpt-5 / o-series often only allow default temperature (1) and max_completion_tokens. */
export function openaiUsesRestrictedSampling(model: string): boolean {
  return /^(o\d|gpt-5)/i.test(model.trim())
}

export function buildOpenAIChatBody(
  messages: OpenAIChatMessage[],
  thinking: ResolvedThinking,
  task?: LlmTaskKind,
  overrideModel?: string,
): Record<string, unknown> {
  const model = overrideModel || getOpenAIModel()
  const backend = chatBackendForModel(model)
  const thinkingOn = thinking.enabled
  const budget = completionTokenBudget(thinking, task)
  const body: Record<string, unknown> = {
    model,
    // Reasoning models spend tokens before visible content; keep headroom for JSON replies.
    max_completion_tokens: budget,
    messages,
  }

  if (backend === 'deepseek') {
    // DeepSeek V4: thinking.type + optional reasoning_effort (see api-docs.deepseek.com/guides/thinking_mode).
    Object.assign(body, deepSeekThinkingParams(thinking))
    // Thinking mode ignores temperature/top_p/penalties; omit so we don't pretend they apply.
    if (!thinkingOn && !openaiUsesRestrictedSampling(model)) {
      body.temperature = 0.7
    }
  } else {
    // GPT-5.6 keeps the classifier's native none|low|medium|high tiers.
    body.reasoning_effort = thinkingOn ? uiEffortToOpenAI(thinking.effort) : 'none'
    if (!thinkingOn && !openaiUsesRestrictedSampling(model)) {
      body.temperature = 0.7
    }
  }

  return body
}

export function extractOpenAIMessageText(data: {
  choices?: Array<{
    message?: { content?: string | Array<{ type?: string; text?: string }>; refusal?: string }
  }>
}): string {
  const choice = data.choices?.[0]
  const message = choice?.message
  if (!message) return ''

  if (typeof message.content === 'string') return message.content.trim()
  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => (typeof part?.text === 'string' ? part.text : ''))
      .join('')
      .trim()
  }
  return ''
}

export function prepareOpenAIChatBody(
  messages: OpenAIChatMessage[],
  options?: ChatCallOptions,
  stream = false,
): { body: Record<string, unknown>; backend: ChatBackend; url: string } {
  const model = options?.model || getOpenAIModel()
  const backend = chatBackendForModel(model)
  const url = chatCompletionsUrl(model)
  const thinking =
    options?.thinking ??
    resolveThinkingForTask(getThinkingMode(), options?.userText, options?.task || 'default')
  const body = buildOpenAIChatBody(messages, thinking, options?.task, model)

  // DeepSeek chat uses max_tokens (OpenAI-compatible); thinking needs more headroom for CoT.
  if (backend === 'deepseek') {
    applyCompletionBudget(body, backend, completionTokenBudget(thinking, options?.task))
  }
  if (stream) body.stream = true
  if (options?.responseFormat === 'json_object') {
    body.response_format = { type: 'json_object' }
  }

  return { body, backend, url }
}

/**
 * Drop params the running backend has just rejected so the next retry
 * is well-formed (e.g. older DeepSeek rejects `temperature`, GPT-5 only
 * accepts `max_completion_tokens`). Returns true if a change was made.
 */
export function adaptOpenAIBodyForError(body: Record<string, unknown>, errText: string): boolean {
  const lower = errText.toLowerCase()
  if (lower.includes('temperature') && 'temperature' in body) {
    delete body.temperature
    return true
  }
  if (lower.includes('max_tokens') && 'max_tokens' in body) {
    delete body.max_tokens
    body.max_completion_tokens = body.max_completion_tokens || 65536
    return true
  }
  if (
    lower.includes('max_completion_tokens') &&
    lower.includes('max_tokens') &&
    !('max_tokens' in body)
  ) {
    delete body.max_completion_tokens
    body.max_tokens = 65536
    return true
  }
  return false
}

export async function callOpenAIMessages(
  messages: OpenAIChatMessage[],
  options?: ChatCallOptions,
): Promise<string> {
  if (!isLlmConfigured()) {
    throw new LlmRequestError(runtimeCopy('m3bb953077e', undefined), 'missing_key')
  }
  if (options?.signal?.aborted) {
    throw new LlmRequestError(runtimeCopy('mdf6c507959', undefined), 'aborted')
  }

  // DeepSeek itinerary: Responses API with thinking off + optional web_search.
  // Skip chat-completions preflight / generic research injection entirely.
  if (shouldUseDeepSeekResponses(options?.task)) {
    return callDeepSeekResponses(messages, {
      ...options,
      thinking: { enabled: false, effort: 'off', source: 'auto' },
      preflight: false,
      // Allow tool by default; model chooses via tool_choice auto (not forced).
      webSearch: options?.webSearch === false ? false : (options?.webSearch ?? 'auto'),
    })
  }

  const { resolveModelCallPreflight, addGenericWebResearch } = await import('./prompts-runtime')
  const preflight = await resolveModelCallPreflight(messages, options)
  const effectiveOptions: ChatCallOptions = { ...options, thinking: preflight.thinking }
  const effectiveMessages = await addGenericWebResearch(
    messages,
    effectiveOptions,
    preflight,
  )
  const { body, backend, url } = prepareOpenAIChatBody(effectiveMessages, effectiveOptions)
  const provider: LlmProvider | ChatBackend = backend
  const { authFetch } = await import('../../../features/auth/services/authFetch')

  let attempt = 0
  let lastError: unknown = null
  while (attempt < 3) {
    let res: Response
    try {
      res = await authFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: effectiveOptions.signal,
      })
    } catch (err) {
      const sig = effectiveOptions.signal
      const reason = sig ? (sig as any).reason : undefined
      const reasonStr = reason ? String(reason) : ''
      if (sig?.aborted || /timeout/i.test(reasonStr)) {
        const isTimeout = /timeout/i.test(reasonStr)
        throw new LlmRequestError(
          isTimeout ? runtimeCopy('mcddf6b7f3d', undefined) : runtimeCopy('mdf6c507959', undefined),
          isTimeout ? 'timeout' : 'aborted',
        )
      }
      throw err
    }
    if (res.ok) {
      try {
        const data = await readResponseJson<{
          choices?: Array<{
            finish_reason?: string
            message?: {
              content?: string | Array<{ type?: string; text?: string }>
              refusal?: string
              reasoning_content?: string
            }
          }>
          usage?: {
            completion_tokens?: number
            completion_tokens_details?: { reasoning_tokens?: number }
          }
        }>(res, provider)
        const choice = data.choices?.[0]
        const refusal = choice?.message?.refusal?.trim()
        if (refusal) {
          throw new LlmRequestError(runtimeCopy('m839907924a', { p0: (refusal) }), 'refusal')
        }
        const text = extractOpenAIMessageText(data)
        const finish = choice?.finish_reason || ''
        const reasoningLen = String(choice?.message?.reasoning_content || '').length
        const usageBits = [
          data.usage?.completion_tokens != null
            ? `completion_tokens=${data.usage.completion_tokens}`
            : '',
          data.usage?.completion_tokens_details?.reasoning_tokens != null
            ? `reasoning_tokens=${data.usage.completion_tokens_details.reasoning_tokens}`
            : reasoningLen
              ? `reasoning_chars=${reasoningLen}`
              : '',
        ]
          .filter(Boolean)
          .join(' · ')

        // finish_reason=length means the shared completion budget ran out (often on CoT).
        // Never return a partial JSON body; retry with a larger budget / softer thinking.
        if (finish === 'length') {
          if (attempt < 2) {
            adaptBodyAfterLengthTruncation(body, backend, attempt)
            attempt++
            await new Promise((r) => setTimeout(r, 200 * attempt))
            continue
          }
          const detail = [
            truncationDebugBits(body, backend, finish, text.length),
            usageBits,
            text
              ? runtimeCopy('m48bf294dc2', undefined)
              : runtimeCopy('m55b91da217', undefined),
          ]
            .filter(Boolean)
            .join(' · ')
          throw new LlmRequestError(
            runtimeCopy('mf36fb17e4a', { p0: (detail) }),
            'truncated',
          )
        }

        if (text) return text

        const thinkingState = body.thinking as { type?: string } | undefined
        const thinkingAlreadyOff =
          backend === 'deepseek'
            ? thinkingState?.type === 'disabled'
            : body.reasoning_effort === 'none'

        if (attempt < 2 && !thinkingAlreadyOff) {
          adaptBodyAfterReasoningOnlyEmpty(body, backend)
          attempt++
          await new Promise((r) => setTimeout(r, 200 * attempt))
          continue
        }

        const reasoningTok =
          data.usage?.completion_tokens_details?.reasoning_tokens ?? 0
        const completionTok = data.usage?.completion_tokens ?? 0
        const usageBitsExtended = [
          usageBits,
          reasoningTok > 0 && completionTok > 0 && reasoningTok >= completionTok
            ? runtimeCopy('m4c8f1dec82', undefined)
            : '',
        ]
          .filter(Boolean)
          .join(' · ')

        lastError = new LlmRequestError(
          runtimeCopy('m22a7bf1365', { p0: (backend), p1: (finish || 'unknown'), p2: (body.model || getOpenAIModel()), p3: (usageBitsExtended ? ` · ${usageBitsExtended}` : '') }),
          'empty',
        )
      } catch (parseError) {
        if (parseError instanceof LlmRequestError) throw parseError
        lastError = parseError
      }
    } else {
      const errText = await res.text().catch(() => '')
      // Schema-fixing retry: drop a rejected param and try once more.
      if (attempt < 2 && adaptOpenAIBodyForError(body, errText)) {
        attempt++
        continue
      }
      // Retry on transient upstream hiccups.
      if (
        attempt < 2 &&
        (res.status === 408 ||
          res.status === 425 ||
          res.status === 502 ||
          res.status === 503 ||
          res.status === 504)
      ) {
        attempt++
        await new Promise((r) => setTimeout(r, 250 * attempt))
        continue
      }
      const mapped = friendlyLlmError(res.status, errText, provider)
      throw new LlmRequestError(
        `${mapped.message}\nHTTP ${res.status} · model=${body.model || getOpenAIModel()} · backend=${backend}${errText ? ` · body=${errText.slice(0, 180)}` : ''}`,
        mapped.code,
        res.status,
      )
    }
    attempt++
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 250 * attempt))
    }
  }
  throw (
    lastError ??
    new LlmRequestError(
      runtimeCopy('m9fc69be2e0', { p0: (backend) }),
      backend === 'deepseek' ? 'empty' : 'empty_body',
    )
  )
}

export async function callOpenAIMessagesStream(
  messages: OpenAIChatMessage[],
  options?: ChatStreamOptions,
): Promise<string> {
  if (!isLlmConfigured()) {
    throw new LlmRequestError(runtimeCopy('m3bb953077e', undefined), 'missing_key')
  }
  if (options?.signal?.aborted) {
    throw new LlmRequestError(runtimeCopy('mdf6c507959', undefined), 'aborted')
  }
  const { body, backend, url } = prepareOpenAIChatBody(messages, options, true)
  const provider: LlmProvider | ChatBackend = backend
  const { authFetch } = await import('../../../features/auth/services/authFetch')

  let res: Response
  try {
    res = await authFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify(body),
      signal: options?.signal,
    })
  } catch (err) {
    const sig = options?.signal
    const reason = sig ? (sig as any).reason : undefined
    const reasonStr = reason ? String(reason) : ''
    if (sig?.aborted || /timeout/i.test(reasonStr)) {
      const isTimeout = /timeout/i.test(reasonStr)
      throw new LlmRequestError(
        isTimeout ? runtimeCopy('mcddf6b7f3d', undefined) : runtimeCopy('mdf6c507959', undefined),
        isTimeout ? 'timeout' : 'aborted',
      )
    }
    throw err
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw friendlyLlmError(res.status, errText, provider)
  }
  if (!res.body) {
    throw new LlmRequestError(runtimeCopy('m8d410c9c95', undefined), 'empty')
  }

  let receivedContent = false
  try {
    return await consumeChatStream(res, messages, {
      ...options,
      onDelta: (delta, fullText) => {
        if (fullText.trim()) receivedContent = true
        options?.onDelta?.(delta, fullText)
      },
    })
  } catch (error) {
    // Only retry an entirely empty completion; never replay partial output.
    if (!receivedContent && error instanceof LlmRequestError && error.code === 'empty' &&
        options?.retryEmpty !== false && !options?.signal?.aborted) {
      return callOpenAIMessagesStream(messages, { ...options, retryEmpty: false, thinking: { enabled: false, effort: 'off', source: 'auto' } })
    }
    throw error
  }
}

async function consumeChatStream(
  res: Response,
  _messages: OpenAIChatMessage[],
  options: ChatStreamOptions | undefined,
): Promise<string> {
  const body = res.body!
  const reader = body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  let text = ''
  let reasoning = ''
  let dataJson = ''
  let finishReason: string | undefined
  let finished = false
  const onAbort = () => {
    try {
      void reader.cancel().catch(() => {})
    } catch {
      /* ignore */
    }
  }
  if (options?.signal) {
    if (options.signal.aborted) onAbort()
    else options.signal.addEventListener('abort', onAbort, { once: true })
  }
  try {
    while (true) {
      const { value, done } = await reader.read()
      buffer += done ? decoder.decode() + '\n\n' : decoder.decode(value, { stream: true })
      let boundary: RegExpExecArray | null
      while ((boundary = /\r?\n\r?\n/.exec(buffer)) !== null) {
        const block = buffer.slice(0, boundary.index)
        buffer = buffer.slice(boundary.index + boundary[0].length)
        const ev = parseChatStreamBlock(block)
        if (!ev) continue
        if (ev.type === 'done') { finished = true; break }
        if (ev.type === 'error') {
          const err = ev.error as { message?: string; code?: string; type?: string } | undefined
          throw new LlmRequestError(err?.message || 'stream error', err?.code || err?.type || 'stream')
        }
        const choice = ev.choice as
          | {
              finish_reason?: string
              delta?: {
                content?: string
                reasoning_content?: string
                reasoning?: string
              }
            }
          | undefined
        if (choice) {
          if (typeof choice.finish_reason === 'string') finishReason = choice.finish_reason
          const delta = choice.delta
          if (delta) {
            if (typeof delta.content === 'string' && delta.content) {
              text += delta.content
              options?.onDelta?.(delta.content, text)
            }
            const reasoningDelta =
              delta.reasoning_content ?? (delta as { reasoning?: string }).reasoning
            if (typeof reasoningDelta === 'string' && reasoningDelta) {
              reasoning += reasoningDelta
              options?.onReasoningDelta?.(reasoningDelta, reasoning)
            }
          }
        }
        if (ev.raw) dataJson = ev.raw
      }
      if (options?.signal?.aborted) throw new LlmRequestError(runtimeCopy('mdf6c507959', undefined), 'aborted')
      if (done || finished) {
        if (!done) await reader.cancel()
        break
      }
    }
  } finally {
    reader.releaseLock()
    if (options?.signal) options.signal.removeEventListener('abort', onAbort)
  }

  if (!text.trim()) {
    if (dataJson) {
      try {
        const data = JSON.parse(dataJson) as {
          choices?: Array<{
            message?: { content?: string | Array<{ type?: string; text?: string }> }
          }>
        }
        text = extractOpenAIMessageText(data)
      } catch {
        /* ignore */
      }
    }
    if (!text.trim()) {
      throw new LlmRequestError(
        `${finishReason ? `Stream ended with finish_reason=${finishReason}` : 'No content from stream'}.`,
        'empty',
      )
    }
  }
  // A provider can emit a valid-looking prefix before hitting its output cap.
  // Do not repair or apply actions from an explicitly incomplete completion.
  if (finishReason === 'length') {
    throw new LlmRequestError(
      runtimeCopy('mf36fb17e4a', { p0: `finish_reason=length · content_chars=${text.length}` }),
      'truncated',
    )
  }
  // Touch the unused warning so TS doesn't strip the variable; the param
  // documents intent (the messages we just streamed) and is relied on by
  // error paths in the outer call site.
  void _messages
  void reasoning
  return text
}

type ChatStreamEvent = {
  type: 'data' | 'done' | 'error'
  choice?: unknown
  error?: { message?: string; code?: string; type?: string }
  raw?: string
}

function parseChatStreamBlock(block: string): ChatStreamEvent | null {
  const dataLines: string[] = []
  for (const line of block.split(/\r?\n/)) {
    if (!line || line.startsWith(':')) continue
    const colon = line.indexOf(':')
    const field = colon < 0 ? line : line.slice(0, colon)
    const value = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '')
    if (field === 'data') dataLines.push(value)
  }
  if (!dataLines.length) return null
  const data = dataLines.join('\n')
  if (data === '[DONE]') return { type: 'done' }
  try {
    const parsed = JSON.parse(data) as Record<string, unknown>
    if (parsed.error && typeof parsed.error === 'object') {
      return { type: 'error', error: parsed.error as { message?: string; code?: string; type?: string } }
    }
    const parsedWithChoices = parsed as Record<string, unknown> & { choices?: unknown[] }
    return { type: 'data', choice: parsedWithChoices.choices?.[0], raw: data }
  } catch {
    return null
  }
}

/** Multi-turn chat completion (OpenAI / DeepSeek). Throws on failure. */
export async function openaiChat(
  messages: OpenAIChatMessage[],
  options?: ChatCallOptions,
): Promise<string> {
  if (!isLlmConfigured()) {
    throw new LlmRequestError(runtimeCopy('m3bb953077e', undefined), 'missing_key')
  }
  return callOpenAIMessages(messages, options)
}

/**
 * Streaming multi-turn chat (OpenAI / DeepSeek `stream: true` SSE).
 * Invokes `onDelta` for each content chunk; returns the full assistant text.
 * Optional `onReasoningDelta` receives CoT tokens when the API emits them
 * (kept separate from content so JSON reply parsing stays intact).
 * Non-chat helpers should keep using `openaiChat` / `generateText`.
 */
export async function openaiChatStream(
  messages: OpenAIChatMessage[],
  options?: ChatStreamOptions,
): Promise<string> {
  if (!isLlmConfigured()) {
    throw new LlmRequestError(runtimeCopy('m3bb953077e', undefined), 'missing_key')
  }
  return callOpenAIMessagesStream(messages, options)
}

export function providerOrder(preferred: LlmProvider): LlmProvider[] {
  // Re-exported only to keep stage-1 backward compat with callers
  // that imported the symbol from `services/llm`. The implementation
  // lives in provider-state; this is a placeholder that returns the
  // preferred provider alone (current behavior).
  void preferred
  return ['openai']
}
