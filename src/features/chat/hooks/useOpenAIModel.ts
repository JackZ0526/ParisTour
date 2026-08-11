import { useSyncExternalStore } from 'react'
import {
  getOpenAIModel,
  getThinkingMode,
  resolveLlmBusyVisual,
  setOpenAIModel,
  setThinkingMode,
  subscribeOpenAIModel,
  subscribeThinking,
  type LlmTaskKind,
  type ThinkingMode,
} from '../../../shared/services/llm/llm'

/** React binding for the global LLM model (module store + localStorage). */
export function useOpenAIModel(): [string, (modelId: string) => void] {
  const model = useSyncExternalStore(
    subscribeOpenAIModel,
    getOpenAIModel,
    getOpenAIModel,
  )
  return [model, setOpenAIModel]
}

/** Model + thinking mode for the FAB picker. */
export function useLlmSettings() {
  const model = useSyncExternalStore(
    subscribeOpenAIModel,
    getOpenAIModel,
    getOpenAIModel,
  )
  const thinkingMode = useSyncExternalStore(
    subscribeThinking,
    getThinkingMode,
    getThinkingMode,
  )

  return {
    model,
    setModel: setOpenAIModel,
    thinkingMode,
    setThinkingMode: setThinkingMode as (mode: ThinkingMode) => void,
  }
}

/**
 * Resolved busy visual for an in-flight LLM call.
 * Prefer `task` so auto mode can resolve off for lightweight tasks.
 */
export function useLlmBusyMode(options?: {
  task?: LlmTaskKind
  userText?: string
  thinkingEnabled?: boolean
}) {
  useSyncExternalStore(subscribeThinking, getThinkingMode, getThinkingMode)
  const visual = resolveLlmBusyVisual(options)
  return {
    visual,
    thinkingOn: visual === 'thinking',
    mode: visual === 'thinking' ? ('thinking' as const) : ('generating' as const),
    label: (labels: { thinking: string; generating: string }) =>
      visual === 'thinking' ? labels.thinking : labels.generating,
  }
}
