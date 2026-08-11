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
import { LlmRequestError } from './errors'
import {
  getActiveLlmLabel,
  getOpenAIModel,
  getThinkingMode,
  isDeepSeekModel,
} from './model-state'
import { getProviderLabel } from './provider-state'
import { deepSeekThinkingParams, resolveThinkingForTask, uiEffortToOpenAI } from './thinking'
import type {
  ChatCallOptions,
  ChatStreamOptions,
  LlmProvider,
  LlmTaskKind,
  OpenAIChatMessage,
  ResolvedThinking,
} from './types'

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
      return new LlmRequestError('DeepSeek 额度不足或触发限流（429）。', code || 'insufficient_quota')
    }
    if (provider === 'openai') {
      return new LlmRequestError(
        'OpenAI 额度不足或触发限流（429）。',
        code || 'insufficient_quota',
      )
    }
    return new LlmRequestError('Gemini 额度不足或触发限流。', code || 'rate_limit')
  }
  if (status === 401 || status === 403 || /invalid.?key|incorrect api key/i.test(apiMessage)) {
    const keyHint =
      provider === 'deepseek'
        ? 'DeepSeek API Key 无效（检查 DEEPSEEK_API_KEY）。'
        : provider === 'openai'
          ? 'OpenAI API Key 无效。'
          : 'Gemini API Key 无效。'
    return new LlmRequestError(keyHint, code || 'auth_error')
  }

  const detail = apiMessage || body.slice(0, 160) || `HTTP ${status}`
  return new LlmRequestError(`${label} 请求失败：${detail}`, code || String(status))
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
        ? 'DeepSeek 返回了空响应（可能被网关中断），请稍后再试。'
        : provider === 'gemini'
          ? 'Gemini 返回了空响应，请稍后再试。'
          : '模型返回了空响应（可能被网关中断），请稍后再试。'
    throw new LlmRequestError(emptyHint, 'empty_body')
  }
  try {
    return JSON.parse(raw) as T
  } catch {
    const parseHint =
      provider === 'deepseek'
        ? 'DeepSeek 响应不完整或无法解析，请再试一次。'
        : provider === 'gemini'
          ? 'Gemini 响应不完整或无法解析，请再试一次。'
          : '模型响应不完整或无法解析，请再试一次。'
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
  if (!text.trim()) throw new LlmRequestError('Gemini 没有返回内容。', 'empty')
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
): Record<string, unknown> {
  const model = getOpenAIModel()
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
  const model = getOpenAIModel()
  const backend = chatBackendForModel(model)
  const url = chatCompletionsUrl(model)
  const thinking =
    options?.thinking ??
    resolveThinkingForTask(getThinkingMode(), options?.userText, options?.task || 'default')
  const body = buildOpenAIChatBody(messages, thinking, options?.task)

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
    throw new LlmRequestError('大模型已关闭（VITE_LLM_ENABLED=false）。', 'missing_key')
  }
  if (options?.signal?.aborted) {
    throw new LlmRequestError('请求已取消。', 'aborted')
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
          isTimeout ? '请求超时（已终止）。' : '请求已取消。',
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
          throw new LlmRequestError(`模型拒绝回答：${refusal}`, 'refusal')
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
              ? '最终回复被截断（有部分 content）。'
              : '最终 content 为空（额度可能全用在内部推理上）。',
          ]
            .filter(Boolean)
            .join(' · ')
          throw new LlmRequestError(
            `模型输出被截断。\n${detail}`,
            'truncated',
          )
        }

        if (text) return text
        lastError = new LlmRequestError(
          `${backend} 没有返回内容（finish_reason=${finish || 'unknown'} · model=${body.model || getOpenAIModel()}${usageBits ? ` · ${usageBits}` : ''}）。`,
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
      `${backend} 没有返回内容。`,
      backend === 'deepseek' ? 'empty' : 'empty_body',
    )
  )
}

export async function callOpenAIMessagesStream(
  messages: OpenAIChatMessage[],
  options?: ChatStreamOptions,
): Promise<string> {
  if (!isLlmConfigured()) {
    throw new LlmRequestError('大模型已关闭（VITE_LLM_ENABLED=false）。', 'missing_key')
  }
  if (options?.signal?.aborted) {
    throw new LlmRequestError('请求已取消。', 'aborted')
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
        isTimeout ? '请求超时（已终止）。' : '请求已取消。',
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
    throw new LlmRequestError('流式响应没有正文。', 'empty')
  }

  return consumeChatStream(res, messages, options)
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
  const onAbort = () => {
    try {
      reader.cancel()
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
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let boundary: number
      while ((boundary = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        const ev = parseChatStreamBlock(block)
        if (!ev) continue
        if (ev.type === 'done') break
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
        if (ev.raw) {
          dataJson = (dataJson ? dataJson + '\n' : '') + ev.raw
        }
      }
    }
  } finally {
    if (options?.signal) options.signal.removeEventListener('abort', onAbort)
  }

  if (!text) {
    if (dataJson) {
      try {
        const data = JSON.parse(dataJson.slice(dataJson.lastIndexOf('{'))) as {
          choices?: Array<{
            message?: { content?: string | Array<{ type?: string; text?: string }> }
          }>
        }
        text = extractOpenAIMessageText(data)
      } catch {
        /* ignore */
      }
    }
    if (!text) {
      throw new LlmRequestError(
        `${finishReason ? `Stream ended with finish_reason=${finishReason}` : 'No content from stream'}.`,
        'empty',
      )
    }
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
  for (const line of block.split('\n')) {
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
    throw new LlmRequestError('大模型已关闭（VITE_LLM_ENABLED=false）。', 'missing_key')
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
    throw new LlmRequestError('大模型已关闭（VITE_LLM_ENABLED=false）。', 'missing_key')
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
