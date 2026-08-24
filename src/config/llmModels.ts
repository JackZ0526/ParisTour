/**
 * LLM model picker configuration.
 *
 * Owns the model list, storage keys, and provider switch. The actual
 * transport / stream parsing / prompt building lives in `services/llm.ts`
 * and `services/llm/prompts.ts`.
 */

import type { TranslationKey } from '../shared/i18n/types'

/** Temporarily off — set true to re-enable Gemini failover / manual model switch. */
export const ENABLE_LLM_PROVIDER_SWITCH = false

const PROVIDER_STORAGE_KEY = 'paris-tour-llm-provider'
/** Bumped so DeepSeek becomes the fresh default when no explicit env model is set. */
const OPENAI_MODEL_STORAGE_KEY = 'paris-tour-openai-model-v3'
/** v2: single ThinkingMode (auto|off|low|medium|high); migrates v1 {enabled,effort}. */
const THINKING_STORAGE_KEY = 'paris-tour-llm-thinking-v2'
const THINKING_STORAGE_KEY_LEGACY = 'paris-tour-llm-thinking-v1'

export const llmStorageKeys = {
  provider: PROVIDER_STORAGE_KEY,
  openaiModel: OPENAI_MODEL_STORAGE_KEY,
  thinking: THINKING_STORAGE_KEY,
  thinkingLegacy: THINKING_STORAGE_KEY_LEGACY,
} as const

/** Hard-coded fallback when no env var or stored value is available. */
export const DEFAULT_LLM_MODEL_ID = 'deepseek-v4-flash-vision-exp' as const

/** Hard-coded fallback model id for the Gemini provider (off by default). */
export const GEMINI_MODEL = 'gemini-2.0-flash'

/** DeepSeek V4 models shown in the global picker. */
export const DEEPSEEK_MODEL_OPTIONS = [
  {
    id: 'deepseek-v4-flash-vision-exp',
    label: 'DeepSeek V4 Flash Vision',
    shortLabel: 'V4 Vision',
    descriptionKey: 'llm.deepseekV4FlashVisionDesc' as TranslationKey,
    provider: 'deepseek' as const,
  },
  {
    id: 'deepseek-v4-pro',
    label: 'DeepSeek V4 Pro',
    shortLabel: 'V4 Pro',
    descriptionKey: 'llm.deepseekV4ProDesc' as TranslationKey,
    provider: 'deepseek' as const,
  },
] as const

/**
 * Returns true if the model supports multimodal image/vision input.
 * DeepSeek V4 Pro is text-only; V4 Flash Vision Exp, OpenAI GPT-5.6, and Gemini support vision.
 */
export function isModelVisionCapable(modelId?: string | null): boolean {
  if (!modelId) return true
  if (/deepseek-v4-pro/i.test(modelId)) return false
  if (/deepseek-v4-flash-vision/i.test(modelId)) return true
  if (/deepseek/i.test(modelId)) return false
  return true
}

/** GPT-5.6 variants kept in the picker (older GPT-5.5/5.4 dropped). */
export const OPENAI_ONLY_MODEL_OPTIONS = [
  {
    id: 'gpt-5.6-luna',
    label: 'GPT-5.6 luna',
    shortLabel: '5.6 luna',
    descriptionKey: 'llm.gpt56LunaDesc' as TranslationKey,
    provider: 'openai' as const,
  },
  {
    id: 'gpt-5.6-sol',
    label: 'GPT-5.6 sol',
    shortLabel: '5.6 sol',
    descriptionKey: 'llm.gpt56SolDesc' as TranslationKey,
    provider: 'openai' as const,
  },
  {
    id: 'gpt-5.6-terra',
    label: 'GPT-5.6 terra',
    shortLabel: '5.6 terra',
    descriptionKey: 'llm.gpt56TerraDesc' as TranslationKey,
    provider: 'openai' as const,
  },
] as const

/** Selectable chat models for the FAB picker. */
export const OPENAI_MODEL_OPTIONS = [
  ...DEEPSEEK_MODEL_OPTIONS,
  ...OPENAI_ONLY_MODEL_OPTIONS,
] as const

export type OpenAIModelId = (typeof OPENAI_MODEL_OPTIONS)[number]['id']

/** Pre-built lookup sets for fast membership checks (used by transport code). */
export const OPENAI_MODEL_IDS: ReadonlySet<string> = new Set(
  OPENAI_MODEL_OPTIONS.map((m) => m.id),
)
export const DEEPSEEK_MODEL_IDS: ReadonlySet<string> = new Set(
  DEEPSEEK_MODEL_OPTIONS.map((m) => m.id),
)

/**
 * Read default model id from env vars. Both are public (non-secret) — used to
 * bake a default into the FAB picker at build time, then re-overridable by
 * the user via localStorage.
 */
export function defaultOpenAIModelFromEnv(): string {
  const fromDeepseekEnv = (
    import.meta.env.VITE_DEEPSEEK_MODEL as string | undefined
  )?.trim()
  if (fromDeepseekEnv && OPENAI_MODEL_IDS.has(fromDeepseekEnv)) return fromDeepseekEnv
  const fromOpenAiEnv = (import.meta.env.VITE_OPENAI_MODEL as string | undefined)?.trim()
  if (fromOpenAiEnv && OPENAI_MODEL_IDS.has(fromOpenAiEnv)) return fromOpenAiEnv
  return DEFAULT_LLM_MODEL_ID
}

/**
 * True unless `VITE_LLM_ENABLED` is explicitly turned off. Keys live only on
 * the server, so this is the only client-side kill switch.
 */
export function isLlmConfigured(): boolean {
  const flag = (import.meta.env.VITE_LLM_ENABLED as string | undefined)?.trim().toLowerCase()
  if (flag === '0' || flag === 'false' || flag === 'off') return false
  return true
}
