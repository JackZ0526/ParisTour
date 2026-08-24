/**
 * SSE + JSON helpers for streaming LLM responses.
 *
 * Extracted from llm.ts so the 134KB monolith stops being a soup of
 * types / state / transport / parsing.
 *
 * Public surface kept as `extractPartialJsonStringField` + a stream
 * parser for the OpenAI Responses API (also used by DeepSeek since they
 * expose an OpenAI-compatible /responses endpoint with identical event
 * names), plus `openaiWebSearchModel` / `openaiResponsesWithWebSearch`
 * for the public web-search entry point.
 */
import { isLlmConfigured } from '../../../config/llmModels'
import { LlmRequestError } from './errors'
import { getOpenAIModel, isDeepSeekModel } from './model-state'
import { friendlyLlmError } from './transport'

// ── Partial JSON string field extraction (streaming) ──

/**
 * Extract a (possibly incomplete) JSON string field while tokens stream
 * in. Returns null until the field's opening quote is seen.
 */
export function extractPartialJsonStringField(
  text: string,
  field: string,
): string | null {
  const key = `"${field}"`
  let searchFrom = 0
  while (searchFrom < text.length) {
    const keyAt = text.indexOf(key, searchFrom)
    if (keyAt < 0) return null
    let i = keyAt + key.length
    while (i < text.length && /\s/.test(text[i]!)) i++
    if (text[i] !== ':') {
      searchFrom = keyAt + 1
      continue
    }
    i++
    while (i < text.length && /\s/.test(text[i]!)) i++
    if (i >= text.length) return null
    if (text[i] !== '"') {
      searchFrom = keyAt + 1
      continue
    }
    i++
    let out = ''
    while (i < text.length) {
      const c = text[i]!
      if (c === '\\') {
        if (i + 1 >= text.length) return out
        const n = text[i + 1]!
        if (n === 'n') out += '\n'
        else if (n === 'r') out += '\r'
        else if (n === 't') out += '\t'
        else if (n === '"' || n === '\\' || n === '/') out += n
        else if (n === 'u') {
          const hex = text.slice(i + 2, i + 6)
          if (hex.length < 4) return out
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
            out += n
            i += 2
            continue
          }
          out += String.fromCharCode(parseInt(hex, 16))
          i += 6
          continue
        } else {
          out += n
        }
        i += 2
        continue
      }
      if (c === '"') return out
      out += c
      i++
    }
    return out
  }
  return null
}

function readPartialJsonString(
  text: string,
  start: number,
): { value: string; index: number; complete: boolean } {
  let i = start
  let out = ''
  while (i < text.length) {
    const c = text[i]!
    if (c === '\\') {
      if (i + 1 >= text.length) return { value: out, index: i, complete: false }
      const n = text[i + 1]!
      if (n === 'n') out += '\n'
      else if (n === 'r') out += '\r'
      else if (n === 't') out += '\t'
      else if (n === '"' || n === '\\' || n === '/') out += n
      else if (n === 'u') {
        const hex = text.slice(i + 2, i + 6)
        if (hex.length < 4) return { value: out, index: i, complete: false }
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
          out += n
          i += 2
          continue
        }
        out += String.fromCharCode(parseInt(hex, 16))
        i += 6
        continue
      } else {
        out += n
      }
      i += 2
      continue
    }
    if (c === '"') return { value: out, index: i + 1, complete: true }
    out += c
    i++
  }
  return { value: out, index: i, complete: false }
}

/**
 * Extract a (possibly incomplete) JSON string array while tokens stream in.
 * Returns null until the field's opening `[` is seen.
 */
export function extractPartialJsonStringArray(
  text: string,
  field: string,
): string[] | null {
  const key = `"${field}"`
  let searchFrom = 0
  while (searchFrom < text.length) {
    const keyAt = text.indexOf(key, searchFrom)
    if (keyAt < 0) return null
    let i = keyAt + key.length
    while (i < text.length && /\s/.test(text[i]!)) i++
    if (text[i] !== ':') {
      searchFrom = keyAt + 1
      continue
    }
    i++
    while (i < text.length && /\s/.test(text[i]!)) i++
    if (text[i] !== '[') {
      searchFrom = keyAt + 1
      continue
    }
    i++
    const items: string[] = []
    while (i < text.length) {
      while (i < text.length && /[\s,]/.test(text[i]!)) i++
      if (i >= text.length) return items.length ? items : null
      if (text[i] === ']') return items
      if (text[i] !== '"') return items.length ? items : null
      const parsed = readPartialJsonString(text, i + 1)
      items.push(parsed.value)
      if (!parsed.complete) return items
      i = parsed.index
    }
    return items.length ? items : null
  }
  return null
}

/**
 * Safely parse a partial/incomplete JSON string while tokens stream in.
 * Automatically closes unclosed strings, arrays, and objects.
 * Returns `null` if the text cannot be repaired into a valid JSON value yet.
 */
export function parsePartialJson<T = unknown>(raw: string): T | null {
  if (!raw || typeof raw !== 'string') return null
  let text = raw.trim()
  if (!text) return null

  // Strip markdown code fences if model started with ```json or ```
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '')
  }

  // 1. Fast path: already valid complete JSON
  try {
    return JSON.parse(text) as T
  } catch {
    // continue to repair
  }

  // 2. Repair incomplete JSON
  const stack: Array<'{' | '['> = []
  let inString = false
  let isEscaped = false
  let sanitized = ''

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!

    if (inString) {
      if (isEscaped) {
        isEscaped = false
        sanitized += ch
      } else if (ch === '\\') {
        isEscaped = true
        sanitized += ch
      } else if (ch === '"') {
        inString = false
        sanitized += ch
      } else {
        sanitized += ch
      }
    } else {
      if (ch === '"') {
        inString = true
        sanitized += ch
      } else if (ch === '{' || ch === '[') {
        stack.push(ch)
        sanitized += ch
      } else if (ch === '}' || ch === ']') {
        const expected = ch === '}' ? '{' : '['
        if (stack.length > 0 && stack[stack.length - 1] === expected) {
          stack.pop()
        }
        sanitized += ch
      } else if (!/\s/.test(ch)) {
        sanitized += ch
      } else {
        sanitized += ch
      }
    }
  }

  // If ended inside an open string:
  if (inString) {
    if (isEscaped || sanitized.endsWith('\\')) {
      sanitized = sanitized.replace(/\\+$/, '')
    }
    sanitized = sanitized.replace(/\\u[0-9a-fA-F]{0,3}$/, '')
    sanitized += '"'
  }

  sanitized = sanitized.trimEnd()

  if (sanitized.endsWith(',')) {
    sanitized = sanitized.slice(0, -1).trimEnd()
  } else if (sanitized.endsWith(':')) {
    sanitized += '""'
  }

  // Close unclosed brackets/braces in reverse order
  while (stack.length > 0) {
    const open = stack.pop()!
    if (sanitized.endsWith(',')) {
      sanitized = sanitized.slice(0, -1).trimEnd()
    }
    if (open === '{') {
      sanitized += '}'
    } else if (open === '[') {
      sanitized += ']'
    }
  }

  try {
    return JSON.parse(sanitized) as T
  } catch {
    return null
  }
}

// ── OpenAI Responses API payload shape ──

export type OpenAIResponsesPayload = {
  output_text?: string
  output?: Array<{
    type?: string
    content?: Array<{ type?: string; text?: string }>
    /** web_search tool calls: action.type === 'search' carries the actual query. */
    action?: { type?: string; query?: string; url?: string; queries?: unknown }
    /** Some preview versions surface the query directly on the item. */
    query?: string
    [k: string]: unknown
  }>
  error?: { message?: string; code?: string; type?: string }
  status?: string
  incomplete_details?: { reason?: string }
  usage?: {
    input_tokens?: number
    output_tokens?: number
    output_tokens_details?: { reasoning_tokens?: number }
  }
}

/** Pull assistant text from a Responses API payload (`output_text` or message parts). */
export function extractResponsesText(data: OpenAIResponsesPayload): string {
  if (typeof data.output_text === 'string' && data.output_text.trim()) {
    return data.output_text.trim()
  }
  const texts: string[] = []
  for (const item of data.output || []) {
    if (item.type !== 'message') continue
    for (const part of item.content || []) {
      if (part.type === 'output_text' && typeof part.text === 'string' && part.text.trim()) {
        texts.push(part.text.trim())
      }
    }
  }
  return texts.join('\n').trim()
}

/**
 * Drop DeepSeek trace tokens (`ws_call_id=...`, `ws_id=...`) and whitespace.
 * Returns null if the string is empty after cleanup.
 */
export function cleanQueryString(s: string): string | null {
  if (!s) return null
  // Remove known tracing tokens used by the web_search tool.
  // Some runtimes include them as query params (?ws_call_id=...&ws_id=...),
  // others emit them as standalone tokens: "ws_call_id=call_... ws_id=..."
  const noTrail = s
    // query-param style
    .replace(/[?&](?:ws_call_id|ws_id)=[^\s&]*/g, ' ')
    // standalone tokens
    .replace(/(?:^|\s)(?:ws_call_id|ws_id)=[^\s&]+/g, ' ')

  const trimmed = noTrail.replace(/\s+/g, ' ').trim()
  return trimmed || null
}

/**
 * Collect the actual search queries the model issued through the
 * built-in `web_search` tool, in order. OpenAI Responses API exposes
 * these in a few shapes depending on the model/tool version:
 *   - `output[].action.query`     (newer web_search tool, action.type === 'search')
 *   - `output[].query`            (some preview versions surface it directly)
 *   - `output[].action.url` / `input` is also valid for `open_page` actions
 *     but those are page opens, not new searches, so we only harvest `query`.
 */
export function extractWebSearchQueries(data: OpenAIResponsesPayload): string[] {
  const queries: string[] = []
  for (const item of data.output || []) {
    if (item.type !== 'web_search_call') continue
    for (const q of readAllQueriesFromWebSearchItem(item)) {
      if (!queries.includes(q)) queries.push(q)
    }
  }
  return queries
}

function readQueryFromWebSearchItem(item: Record<string, unknown>): string | null {
  const first = readAllQueriesFromWebSearchItem(item)
  return first[0] ?? null
}

/**
 * Extract all queries the model issued for a single web_search_call
 * item. Across OpenAI / DeepSeek versions the field shape has shifted.
 */
function readAllQueriesFromWebSearchItem(item: Record<string, unknown>): string[] {
  const out: string[] = []
  const action = (item as { action?: { query?: unknown; queries?: unknown } }).action
  if (action && typeof action === 'object') {
    if (typeof action.query === 'string') {
      const clean = cleanQueryString(action.query)
      if (clean) out.push(clean)
    }
    if (Array.isArray(action.queries)) {
      for (const q of action.queries) {
        if (typeof q === 'string') {
          const clean = cleanQueryString(q)
          if (clean) out.push(clean)
        }
      }
    }
  }
  if (typeof item.query === 'string') {
    const clean = cleanQueryString(item.query)
    if (clean && !out.includes(clean)) out.push(clean)
  }
  for (const v of Object.values(item)) {
    if (v && typeof v === 'object') {
      const nested = (v as Record<string, unknown>).query
      if (typeof nested === 'string') {
        const clean = cleanQueryString(nested)
        if (clean && !out.includes(clean)) out.push(clean)
      }
    }
  }
  return out
}

// ── SSE parsing ──

type SseEvent = {
  type: string
  [k: string]: unknown
}

function parseSseEvent(rawEvent: string): SseEvent | null {
  const dataLines: string[] = []
  let eventType: string | null = null
  for (const line of rawEvent.split('\n')) {
    if (!line) continue
    if (line.startsWith(':')) continue // comment
    const colon = line.indexOf(':')
    const field = colon < 0 ? line : line.slice(0, colon)
    const value = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '')
    if (field === 'event') {
      eventType = value
    } else if (field === 'data') {
      dataLines.push(value)
    }
  }
  if (dataLines.length === 0) return null
  const raw = dataLines.join('\n').trim()
  if (!raw) return null
  if (raw === '[DONE]') return { type: 'done' }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const type =
      (eventType as string | null) ||
      (typeof parsed.type === 'string' ? parsed.type : null) ||
      (typeof parsed.event === 'string' ? parsed.event : null) ||
      'message'
    return { type, ...parsed }
  } catch {
    return null
  }
}

// ── OpenAI Responses API SSE consumer ──

/**
 * Parse an OpenAI Responses API SSE stream. Yields the assistant text
 * and the list of search queries the model issued via the `web_search`
 * tool. Event shapes:
 *   - `response.output_item.added` — fires once per output item; for
 *     `web_search_call` items we read `action.query` (or fall back to
 *     `item.query` / nested `action.query` for older versions).
 *   - `response.output_text.delta` — concatenated to assemble the reply.
 *   - `response.completed`         — final response, used as a safety net
 *     in case any of the above were missed.
 */
export async function consumeResponsesStream(
  res: Response,
  signal?: AbortSignal,
  onWebSearchQuery?: (q: string) => void,
  onTextDelta?: (fullText: string) => void,
): Promise<{ text: string; webSearchQueries: string[] }> {
  const body = res.body
  if (!body) {
    // Fallback to a single-shot read if the runtime gives us no stream.
    const data = (await res.json()) as OpenAIResponsesPayload
    if (data.error?.message)
      throw new LlmRequestError(
        data.error.message,
        data.error.code || data.error.type,
      )
    return {
      text: extractResponsesText(data),
      webSearchQueries: extractWebSearchQueries(data),
    }
  }

  const reader = body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  let text = ''
  const webSearchQueries: string[] = []
  let finalData: OpenAIResponsesPayload | null = null

  const onAbort = () => {
    try {
      reader.cancel()
    } catch {
      /* ignore */
    }
  }
  if (signal) {
    if (signal.aborted) onAbort()
    else signal.addEventListener('abort', onAbort, { once: true })
  }

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      // SSE events are separated by a blank line.
      let boundary: number
      while ((boundary = buffer.indexOf('\n\n')) >= 0) {
        const rawEvent = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        const event = parseSseEvent(rawEvent)
        if (!event) continue

        // Surface every streaming event in the console so we can see the
        // real payload shape — the `action.query` field has moved
        // between OpenAI versions and we want to be empirical.
        if (import.meta.env.DEV && typeof console !== 'undefined') console.debug('[responses:event]', event.type, event)

        if (
          event.type === 'response.output_text.delta' ||
          event.type === 'response.text.delta'
        ) {
          const delta = (event as { delta?: string }).delta
          if (typeof delta === 'string') {
            text += delta
            onTextDelta?.(text)
          }
        } else if (event.type === 'response.output_item.added') {
          const item = (event as { item?: Record<string, unknown> }).item
          if (item && item.type === 'web_search_call') {
            const q = readQueryFromWebSearchItem(item)
            if (q && !webSearchQueries.includes(q)) {
              webSearchQueries.push(q)
              onWebSearchQuery?.(q)
            }
          }
        } else if (event.type === 'response.output_item.done') {
          // DeepSeek (and OpenAI) only attach the `action` object on the
          // *done* event, not on added. For DeepSeek it's an array under
          // `action.queries`; for OpenAI it's `action.query` (string).
          // Read it here as the authoritative source.
          const item = (event as { item?: Record<string, unknown> }).item
          if (item && item.type === 'web_search_call') {
            for (const q of readAllQueriesFromWebSearchItem(item)) {
              if (!webSearchQueries.includes(q)) {
                webSearchQueries.push(q)
                onWebSearchQuery?.(q)
              }
            }
          }
        } else if (event.type === 'response.completed' || event.type === 'response.done') {
          const resp = (event as { response?: OpenAIResponsesPayload }).response
          if (resp) finalData = resp
        } else if (event.type === 'error') {
          const err = (event as {
            error?: { message?: string; code?: string; type?: string }
          }).error
          if (err?.message) throw new LlmRequestError(err.message, err.code || err.type)
        }
      }
    }
  } finally {
    if (signal) signal.removeEventListener('abort', onAbort)
  }

  // Safety net: if we somehow missed the item.added events (older
  // runtimes sometimes drop them), pull queries out of the final
  // payload.
  if (webSearchQueries.length === 0 && finalData) {
    webSearchQueries.push(...extractWebSearchQueries(finalData))
  }
  // Also fall back to the final output_text if we never got any delta.
  if (!text && finalData) text = extractResponsesText(finalData)

  return { text: text.trim(), webSearchQueries }
}

// ── Public OpenAI Responses web_search entry point ──

/**
 * Model id used for the web-search research step (Responses API + web_search tool).
 * - OpenAI: pass through whatever the user picked.
 * - DeepSeek: their Responses API supports `web_search` too, but only on
 *   `deepseek-v4-flash` (per DeepSeek docs). If the user is on a different
 *   DeepSeek variant, fall back to v4-flash for the search step.
 */
export function openaiWebSearchModel(): string {
  const current = getOpenAIModel()
  if (!isDeepSeekModel(current)) return current
  // DeepSeek Responses API with web_search tool requires deepseek-v4-flash
  return 'deepseek-v4-flash'
}

/**
 * OpenAI / DeepSeek Responses API with built-in web_search tool.
 * Used for fresher public web data (prices, hours, weather detail, etc.).
 * Routes to `/api/openai/responses` or `/api/deepseek/responses` based on model.
 * DeepSeek Responses currently requires `deepseek-v4-flash` (see openaiWebSearchModel).
 */
export async function openaiResponsesWithWebSearch(input: {
  instructions: string
  user: string
  /** Override model; defaults to current OpenAI pick or gpt-5.6-luna. */
  model?: string
  signal?: AbortSignal
  /** Called the moment each `web_search_call` item is observed in the stream,
   *  before the response completes. Lets the UI show the model's *actual*
   *  query while the search is still in flight, not after. */
  onWebSearchQuery?: (query: string) => void
}): Promise<{ text: string; webSearchQueries: string[] }> {
  if (!isLlmConfigured()) {
    throw new LlmRequestError('大模型已关闭（VITE_LLM_ENABLED=false）。', 'missing_key')
  }

  const { authFetch } = await import('../../../features/auth/services/authFetch')
  const model = (input.model && input.model.trim()) || openaiWebSearchModel()

  // Pick the right Responses endpoint based on the chosen model.
  // Both OpenAI and DeepSeek expose an OpenAI-compatible /responses endpoint
  // with the same SSE event names, so the same stream parser works for both.
  const isDs = isDeepSeekModel(model)
  const endpoint = isDs ? '/api/deepseek/responses' : '/api/openai/responses'

  const res = await authFetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      tools: [{ type: 'web_search' }],
      tool_choice: isDs ? 'auto' : 'required',
      instructions: input.instructions,
      input: input.user,
      stream: true,
      // DeepSeek defaults thinking ON; research step only needs factual text.
      ...(isDs ? { reasoning: { effort: 'none' } } : {}),
    }),
    signal: input.signal,
  })

  if (!res.ok) {
    throw friendlyLlmError(res.status, await res.text(), 'openai')
  }

  // Stream the SSE response so we can harvest the web_search_call's real
  // query at `response.output_item.added` time. The non-stream payload also
  // includes it, but the field shape moves between OpenAI versions and the
  // streaming event has been stable since the tool shipped.
  const { text, webSearchQueries } = await consumeResponsesStream(
    res,
    input.signal,
    input.onWebSearchQuery,
  )
  if (!text) throw new LlmRequestError('OpenAI 联网查询没有返回内容。', 'empty')
  return { text, webSearchQueries }
}
