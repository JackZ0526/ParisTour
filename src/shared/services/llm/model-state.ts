/**
 * LLM model + thinking-mode runtime state.
 *
 * Pulled out of the 134KB llm.ts so the active-model state machine and
 * the thinking-mode state machine are colocated but no longer share a
 * 3000-line file with HTTP transport.
 */
import {
  DEEPSEEK_MODEL_IDS,
  OPENAI_MODEL_IDS,
  OPENAI_MODEL_OPTIONS,
  defaultOpenAIModelFromEnv,
  llmStorageKeys,
} from '../../../config/llmModels'
import { isLockedThinkingMode } from './thinking'
import type { ThinkingEffortUi, ThinkingMode, ThinkingToggle } from './types'
import { getLocale, translate, type TranslationKey } from '../../i18n'

type ThinkingActiveMode = 'auto' | ThinkingEffortUi

type ThinkingStore = {
  mode: ThinkingMode
  /** Last locked effort (低/中/高); restored when 自动 turns off. */
  lastEffort: ThinkingEffortUi
  /** Mode restored when master 思考 turns back on (auto or locked effort). */
  lastActiveMode: ThinkingActiveMode
}

function defaultThinkingStore(): ThinkingStore {
  return { mode: 'auto', lastEffort: 'medium', lastActiveMode: 'auto' }
}

function normalizeThinkingMode(raw: unknown): ThinkingMode | null {
  if (raw === 'auto' || raw === 'off' || raw === 'low' || raw === 'medium' || raw === 'high') {
    return raw
  }
  return null
}

function normalizeEffort(raw: unknown): ThinkingEffortUi {
  if (raw === 'low' || raw === 'medium' || raw === 'high') return raw
  return 'medium'
}

function normalizeActiveMode(
  raw: unknown,
  fallback: ThinkingActiveMode,
): ThinkingActiveMode {
  if (raw === 'auto' || raw === 'low' || raw === 'medium' || raw === 'high') return raw
  return fallback
}

function storeFromMode(
  mode: ThinkingMode,
  lastEffort?: ThinkingEffortUi,
  lastActiveMode?: ThinkingActiveMode,
): ThinkingStore {
  const effort =
    mode === 'low' || mode === 'medium' || mode === 'high'
      ? mode
      : normalizeEffort(lastEffort)
  const active: ThinkingActiveMode =
    mode === 'off'
      ? normalizeActiveMode(lastActiveMode, effort)
      : mode === 'auto'
        ? 'auto'
        : effort
  return { mode, lastEffort: effort, lastActiveMode: active }
}

function persistThinking(store: ThinkingStore) {
  try {
    localStorage.setItem(llmStorageKeys.thinking, JSON.stringify(store))
  } catch {
    /* ignore */
  }
}

/** Migrate v1 `{enabled,effort}` → v2 `{mode,lastEffort}`. */
function migrateLegacyThinking(raw: string, preferMode?: ThinkingMode): ThinkingStore {
  const base = defaultThinkingStore()
  if (preferMode) return storeFromMode(preferMode)
  try {
    const parsed = JSON.parse(raw) as { enabled?: boolean; effort?: unknown; mode?: unknown }
    const fromMode = normalizeThinkingMode(parsed.mode)
    if (fromMode) return storeFromMode(fromMode, normalizeEffort(parsed.effort))
    if (typeof parsed.enabled === 'boolean') {
      if (!parsed.enabled) return storeFromMode('off', normalizeEffort(parsed.effort))
      return storeFromMode(normalizeEffort(parsed.effort))
    }
  } catch {
    /* ignore */
  }
  return base
}

function readStoredThinking(preferMode?: ThinkingMode): ThinkingStore {
  if (preferMode) {
    const store = storeFromMode(preferMode)
    persistThinking(store)
    return store
  }
  try {
    const raw = localStorage.getItem(llmStorageKeys.thinking)
    if (raw) {
      const parsed = JSON.parse(raw) as { mode?: unknown; lastEffort?: unknown }
      const mode = normalizeThinkingMode(parsed.mode)
      if (mode) return storeFromMode(mode, normalizeEffort(parsed.lastEffort))
    }
  } catch {
    /* ignore */
  }
  try {
    const legacy = localStorage.getItem(llmStorageKeys.thinkingLegacy)
    if (legacy) {
      const migrated = migrateLegacyThinking(legacy)
      persistThinking(migrated)
      return migrated
    }
  } catch {
    /* ignore */
  }
  return defaultThinkingStore()
}

/** Migrate legacy stored ids to current model ids. */
function migrateStoredModel(raw: string): { model: string; thinkingMode?: ThinkingMode } {
  const id = raw.trim()
  if (OPENAI_MODEL_IDS.has(id)) return { model: id }
  if (id === 'deepseek-reasoner') return { model: 'deepseek-v4-flash', thinkingMode: 'medium' }
  if (id === 'deepseek-chat' || /^deepseek/i.test(id)) {
    return { model: 'deepseek-v4-flash' }
  }
  if (/^gpt-5\.6/i.test(id)) return { model: 'gpt-5.6-luna' }
  if (/^gpt-/i.test(id)) return { model: 'gpt-5.6-luna' }
  return { model: defaultOpenAIModelFromEnv() }
}

function readStoredOpenAIModel(): { model: string | null; thinkingMode?: ThinkingMode } {
  try {
    const v = localStorage.getItem(llmStorageKeys.openaiModel)?.trim()
    if (!v) return { model: null }
    const migrated = migrateStoredModel(v)
    if (migrated.model !== v) {
      try {
        localStorage.setItem(llmStorageKeys.openaiModel, migrated.model)
      } catch {
        /* ignore */
      }
    }
    return migrated
  } catch {
    /* ignore */
  }
  return { model: null }
}

// ── Active state (module-level, single source of truth) ──
const storedModelBoot = readStoredOpenAIModel()
let activeOpenAIModel = storedModelBoot.model || defaultOpenAIModelFromEnv()
let activeThinking = readStoredThinking(storedModelBoot.thinkingMode)
const openaiModelListeners = new Set<() => void>()
const thinkingListeners = new Set<() => void>()

function notifyOpenAIModelListeners() {
  for (const cb of openaiModelListeners) cb()
}
function notifyThinkingListeners() {
  for (const cb of thinkingListeners) cb()
}

function openaiModel() {
  return activeOpenAIModel || defaultOpenAIModelFromEnv()
}

// ── Public API ──
export function getOpenAIModel(): string {
  return openaiModel()
}

export function isDeepSeekModel(modelId: string): boolean {
  const id = modelId.trim()
  return DEEPSEEK_MODEL_IDS.has(id) || /^deepseek/i.test(id)
}

/** Thinking / effort controls for DeepSeek V4 and GPT-5.6. */
export function supportsThinkingControls(modelId?: string): boolean {
  const id = (modelId && modelId.trim()) || openaiModel()
  return isDeepSeekModel(id) || /^gpt-5\.6/i.test(id) || /^gpt-/i.test(id)
}

export function getOpenAIModelLabel(modelId = getOpenAIModel()): string {
  const found = OPENAI_MODEL_OPTIONS.find((m) => m.id === modelId)
  return found?.label || modelId
}

export function getOpenAIModelShortLabel(modelId = getOpenAIModel()): string {
  const found = OPENAI_MODEL_OPTIONS.find((m) => m.id === modelId)
  return found?.shortLabel || getOpenAIModelLabel(modelId)
}

export function getThinkingMode(): ThinkingMode {
  return activeThinking.mode
}

/** True when mode is not `off` (includes `auto` and locked low/medium/high). */
export function getThinkingEnabled(): boolean {
  return activeThinking.mode !== 'off'
}

/** Locked effort when mode is low/medium/high; otherwise last manual effort. */
export function getThinkingEffort(): ThinkingEffortUi {
  const mode = activeThinking.mode
  if (mode === 'low' || mode === 'medium' || mode === 'high') return mode
  return activeThinking.lastEffort || 'medium'
}

function thinkingModeLabelKey(mode: ThinkingMode): TranslationKey {
  switch (mode) {
    case 'auto': return 'llm.thinkingModeAuto'
    case 'off': return 'llm.thinkingModeOff'
    case 'low': return 'llm.thinkingModeLow'
    case 'medium': return 'llm.thinkingModeMedium'
    case 'high': return 'llm.thinkingModeHigh'
  }
}

export function getThinkingModeLabel(mode = getThinkingMode()): string {
  return translate(thinkingModeLabelKey(mode), undefined, getLocale())
}

function thinkingEffortLabelKey(effort: ThinkingEffortUi): TranslationKey {
  switch (effort) {
    case 'low': return 'llm.thinkingModeLow'
    case 'medium': return 'llm.thinkingModeMedium'
    case 'high': return 'llm.thinkingModeHigh'
  }
}

export function getThinkingEffortLabel(
  effort: ThinkingEffortUi | ThinkingMode = getThinkingMode(),
): string {
  if (effort === 'auto' || effort === 'off') return getThinkingModeLabel(effort)
  return translate(thinkingEffortLabelKey(effort as ThinkingEffortUi), undefined, getLocale())
}

/** Compact FAB chip label — model short name only (thinking mode lives in the popover / title). */
export function getLlmChipSummary(
  modelId = getOpenAIModel(),
  _mode?: ThinkingMode,
): string {
  return getOpenAIModelShortLabel(modelId)
}

export function thinkingModeToToggle(mode: ThinkingMode): ThinkingToggle {
  if (mode === 'auto') return 'auto'
  if (mode === 'off') return 'off'
  return 'on'
}

export { isLockedThinkingMode }

/** UI chip / panel label. */
export function getActiveLlmLabel(modelId = getOpenAIModel()): string {
  const label = getOpenAIModelLabel(modelId)
  const mode = getThinkingMode()
  const think =
    supportsThinkingControls(modelId) && mode !== 'off'
      ? ` · 思考${getThinkingModeLabel(mode)}`
      : ''
  if (isDeepSeekModel(modelId)) {
    const base = label.startsWith('DeepSeek') ? label : `DeepSeek · ${label}`
    return `${base}${think}`
  }
  return `OpenAI · ${label}${think}`
}

export function setOpenAIModel(modelId: string) {
  const migrated = migrateStoredModel(modelId)
  const next = migrated.model
  if (!next || next === activeOpenAIModel) {
    if (migrated.thinkingMode) setThinkingMode(migrated.thinkingMode)
    return
  }
  activeOpenAIModel = next
  try {
    localStorage.setItem(llmStorageKeys.openaiModel, next)
  } catch {
    /* ignore */
  }
  notifyOpenAIModelListeners()
  if (migrated.thinkingMode) setThinkingMode(migrated.thinkingMode)
}

export function setThinkingMode(mode: ThinkingMode) {
  const next = normalizeThinkingMode(mode) || 'auto'
  const store = storeFromMode(next, activeThinking.lastEffort, activeThinking.lastActiveMode)
  if (
    activeThinking.mode === store.mode &&
    activeThinking.lastEffort === store.lastEffort &&
    activeThinking.lastActiveMode === store.lastActiveMode
  ) {
    return
  }
  activeThinking = store
  persistThinking(activeThinking)
  notifyThinkingListeners()
}

/** Top-level toggle: 自动 / 关 / 开. */
export function setThinkingToggle(toggle: ThinkingToggle) {
  if (toggle === 'auto') {
    setThinkingMode('auto')
    return
  }
  if (toggle === 'off') {
    setThinkingMode('off')
    return
  }
  setThinkingMode(getThinkingEffort())
}

/** Master 思考 toggle: off ↔ restore lastActiveMode. */
export function setThinkingEnabled(enabled: boolean) {
  if (enabled) {
    if (activeThinking.mode !== 'off') return
    const restore = activeThinking.lastActiveMode
    setThinkingMode(restore === 'auto' ? 'auto' : restore)
    return
  }
  setThinkingMode('off')
}

export function setThinkingEffort(effort: ThinkingEffortUi) {
  setThinkingMode(normalizeEffort(effort))
}

export function subscribeOpenAIModel(listener: () => void): () => void {
  openaiModelListeners.add(listener)
  return () => {
    openaiModelListeners.delete(listener)
  }
}

export function subscribeThinking(listener: () => void): () => void {
  thinkingListeners.add(listener)
  return () => {
    thinkingListeners.delete(listener)
  }
}
