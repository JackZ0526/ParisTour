/**
 * LLM provider runtime state (openai | gemini, switch notice).
 *
 * The "off" provider (gemini) is gated behind ENABLE_LLM_PROVIDER_SWITCH;
 * if it's off, getLlmProvider() coerces back to 'openai'.
 */
import { ENABLE_LLM_PROVIDER_SWITCH, GEMINI_MODEL, isLlmConfigured, llmStorageKeys } from '../../../config/llmModels'
import { getActiveLlmLabel, getOpenAIModel } from './model-state'
import type { LlmProvider } from './types'

function readStoredProvider(): LlmProvider | null {
  try {
    const v = localStorage.getItem(llmStorageKeys.provider)
    if (v === 'openai' || v === 'gemini') return v
  } catch {
    /* ignore */
  }
  return null
}

function defaultProvider(): LlmProvider {
  return 'openai'
}

let activeProvider: LlmProvider = readStoredProvider() || defaultProvider()
let switchNotice: string | null = null
const providerListeners = new Set<() => void>()

function notifyProviderListeners() {
  for (const cb of providerListeners) cb()
}

export function isProviderConfigured(provider: LlmProvider): boolean {
  if (provider === 'gemini' && !ENABLE_LLM_PROVIDER_SWITCH) return false
  return isLlmConfigured()
}

export function getProviderModelName(provider: LlmProvider): string {
  return provider === 'openai' ? getOpenAIModel() : GEMINI_MODEL
}

export function getProviderLabel(provider: LlmProvider): string {
  return provider === 'openai' ? `OpenAI · ${getOpenAIModel()}` : `Gemini · ${GEMINI_MODEL}`
}

export function getLlmProvider(): LlmProvider {
  if (!isProviderConfigured(activeProvider)) {
    activeProvider = defaultProvider()
  }
  return activeProvider
}

export function setLlmProvider(
  provider: LlmProvider,
  options?: { notice?: string | null },
) {
  if (!isProviderConfigured(provider)) return
  const prev = activeProvider
  activeProvider = provider
  try {
    localStorage.setItem(llmStorageKeys.provider, provider)
  } catch {
    /* ignore */
  }
  if (options?.notice !== undefined) {
    switchNotice = options.notice
  } else if (prev !== provider) {
    switchNotice = `已切换到 ${getProviderLabel(provider)}`
  }
  notifyProviderListeners()
}

/** Toggle between configured providers. Returns the new provider. */
export function toggleLlmProvider(): LlmProvider {
  const current = getLlmProvider()
  const next: LlmProvider = current === 'openai' ? 'gemini' : 'openai'
  if (isProviderConfigured(next)) {
    setLlmProvider(next, {
      notice: `已手动切换到 ${getProviderLabel(next)}`,
    })
    return next
  }
  return current
}

export function canSwitchLlmProvider(): boolean {
  return ENABLE_LLM_PROVIDER_SWITCH && isLlmConfigured()
}

export function consumeLlmSwitchNotice(): string | null {
  const notice = switchNotice
  switchNotice = null
  return notice
}

export function peekLlmSwitchNotice(): string | null {
  return switchNotice
}

export function subscribeLlmProvider(listener: () => void): () => void {
  providerListeners.add(listener)
  return () => {
    providerListeners.delete(listener)
  }
}

// Re-export so chat / model-picker keep importing `getActiveLlmLabel` from
// `./llm` (stage 1 backward compat).
export { getActiveLlmLabel }
