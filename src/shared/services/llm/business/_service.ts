/**
 * Internal helpers shared by the business LLM call sites.
 *
 * NOT re-exported from `llm.ts` — the public surface of the LLM layer
 * is the `openaiChat*` / `generate*` / `recommend*` functions in
 * `business/*.ts`. This module is the glue between those call sites
 * and the lower-level transport / state modules.
 *
 * Owns:
 *   - `generateText` — high-level LLM call: provider fallback + JSON repair.
 *   - `callProvider` / `callOpenAI` — provider dispatch.
 *   - `providerOrder` — preferred→fallback order (OpenAI/Gemini switch).
 *   - `extractJsonObject` — lenient JSON extraction re-export.
 */
import { isLlmConfigured, ENABLE_LLM_PROVIDER_SWITCH } from '../../../../config/llmModels'
import { LlmRequestError } from '../errors'
import {
  getLlmProvider,
  isProviderConfigured,
  setLlmProvider,
  getProviderLabel,
} from '../provider-state'
import { callGemini, callOpenAIMessages } from '../transport'
import { extractJsonObject } from '../json'
import type {
  ChatCallOptions,
  LlmProvider,
  LlmTaskKind,
} from '../types'

export { extractJsonObject }

/**
 * Provider fallback order. When `ENABLE_LLM_PROVIDER_SWITCH` is off
 * (default) we only use OpenAI; on we try the user's preferred provider
 * first, then the other one if it's configured.
 */
export function providerOrder(preferred: LlmProvider): LlmProvider[] {
  if (!ENABLE_LLM_PROVIDER_SWITCH) {
    return isProviderConfigured('openai') ? ['openai'] : []
  }
  const other: LlmProvider = preferred === 'openai' ? 'gemini' : 'openai'
  return [preferred, other].filter(isProviderConfigured)
}

async function callOpenAI(
  system: string,
  user: string,
  options?: ChatCallOptions,
): Promise<string> {
  return callOpenAIMessages(
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    options,
  )
}

async function callProvider(
  provider: LlmProvider,
  system: string,
  user: string,
  options?: ChatCallOptions,
): Promise<string> {
  return provider === 'openai' ? callOpenAI(system, user, options) : callGemini(system, user, options)
}

/**
 * High-level LLM call for business modules.
 *
 * - Provider fallback via `providerOrder` (only if ENABLE_LLM_PROVIDER_SWITCH).
 * - If `options.json` is true and the first response doesn't parse as
 *   JSON, retry once with a "JSON fixer" prompt.
 * - On a fallback success, switch the global provider so the user sees
 *   the new pick.
 *
 * Returns the raw assistant text (string or null). Callers that need
 * JSON should run it through `extractJsonObject` themselves.
 */
export async function generateText(
  system: string,
  user: string,
  options?: {
    strict?: boolean
    task?: LlmTaskKind
    userText?: string
    json?: boolean
    webSearch?: boolean | 'auto'
    preflightContext?: unknown
    signal?: AbortSignal
    onDelta?: (delta: string, fullText: string) => void
  },
): Promise<string | null> {
  const strict = Boolean(options?.strict)
  const chatOpts: ChatCallOptions = {
    task: options?.task || 'default',
    userText: options?.userText ?? user,
    responseFormat: options?.json ? 'json_object' : undefined,
    webSearch: options?.webSearch,
    preflightContext: options?.preflightContext,
    signal: options?.signal,
    onDelta: options?.onDelta,
  }
  const preferred = ENABLE_LLM_PROVIDER_SWITCH ? getLlmProvider() : 'openai'
  const order = providerOrder(preferred)

  if (!order.length) {
    if (strict) {
      throw new LlmRequestError(
        ENABLE_LLM_PROVIDER_SWITCH
          ? '未配置可用的大模型 API Key（OpenAI / Gemini）。'
          : '未配置服务端 DEEPSEEK_API_KEY 或 OPENAI_API_KEY（请写在 .env / Vercel，不要用 VITE_ 前缀）。',
      )
    }
    return null
  }

  let lastError: unknown = null

  for (const provider of order) {
    try {
      let text = await callProvider(provider, system, user, chatOpts)
      if (options?.json && !extractJsonObject(text)) {
        text = await callProvider(
          provider,
          [
            '你是 JSON 修复器。只输出一个有效 JSON 对象，不要 markdown 或解释。',
            '保留原回复语义与字段；只修复引号、逗号、括号、转义或被截断的结构。',
          ].join('\n'),
          text.slice(0, 16000),
          {
            task: options.task || 'default',
            thinking: { enabled: false, effort: 'low' },
            preflight: false,
            webSearch: false,
            responseFormat: 'json_object',
            signal: options.signal,
          },
        )
      }
      if (ENABLE_LLM_PROVIDER_SWITCH && provider !== preferred) {
        const reason =
          lastError instanceof Error ? lastError.message.replace(/。$/, '') : '上一个模型请求失败'
        setLlmProvider(provider, {
          notice: `${reason}，已自动切换到 ${getProviderLabel(provider)}`,
        })
      }
      return text
    } catch (err) {
      lastError = err
    }
  }

  if (strict) {
    throw lastError instanceof Error
      ? lastError
      : new LlmRequestError('所有大模型请求都失败了。')
  }
  return null
}

/**
 * Cheap re-export of `isLlmConfigured` so business modules can import
 * everything they need from this one helper module.
 */
export { isLlmConfigured }
