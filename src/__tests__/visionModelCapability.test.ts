import { afterEach, describe, expect, it, vi } from 'vitest'
import { getOpenAIModel, setOpenAIModel } from '../shared/services/llm/model-state'
import {
  DEFAULT_LLM_MODEL_ID,
  DEEPSEEK_MODEL_OPTIONS,
  OPENAI_MODEL_OPTIONS,
  defaultOpenAIModelFromEnv,
  isModelVisionCapable,
} from '../config/llmModels'

describe('Vision Model Capability', () => {
  afterEach(() => vi.unstubAllEnvs())
  it('migrates removed model choices to the retained provider model', () => {
    for (const old of ['deepseek-v4-pro', 'deepseek-v4-flash', 'deepseek-v4-flash-vision-exp']) {
      setOpenAIModel(old)
      expect(getOpenAIModel()).toBe('deepseek-flash')
    }
    for (const old of ['gpt-5.6-sol', 'gpt-5.6-terra']) {
      setOpenAIModel(old)
      expect(getOpenAIModel()).toBe('gpt-5.6-luna')
    }
    setOpenAIModel('deepseek-flash')
  })
  it('offers only the two native multimodal models', () => {
    expect(OPENAI_MODEL_OPTIONS.map((m) => m.id)).toEqual(['deepseek-flash', 'gpt-5.6-luna'])
    for (const model of OPENAI_MODEL_OPTIONS) expect(isModelVisionCapable(model.id)).toBe(true)
  })
  it('migrates retired environment defaults', () => {
    vi.stubEnv('VITE_DEEPSEEK_MODEL', 'deepseek-v4-pro')
    expect(defaultOpenAIModelFromEnv()).toBe('deepseek-flash')
    vi.stubEnv('VITE_DEEPSEEK_MODEL', '')
    vi.stubEnv('VITE_OPENAI_MODEL', 'gpt-5.6-terra')
    expect(defaultOpenAIModelFromEnv()).toBe('gpt-5.6-luna')
  })
  it('default model is deepseek-flash', () => {
    expect(DEFAULT_LLM_MODEL_ID).toBe('deepseek-flash')
    expect(DEEPSEEK_MODEL_OPTIONS.some((m) => m.id === 'deepseek-flash')).toBe(true)
  })

  it('correctly identifies vision-capable and text-only models', () => {
    // DeepSeek vision model
    expect(isModelVisionCapable('deepseek-flash')).toBe(true)

    // DeepSeek text-only / reasoning model
    expect(isModelVisionCapable('deepseek-v4-pro')).toBe(false)
    expect(isModelVisionCapable('deepseek-chat')).toBe(false)

    // OpenAI models
    expect(isModelVisionCapable('gpt-5.6-luna')).toBe(true)
    expect(isModelVisionCapable('gpt-5.6-sol')).toBe(true)
    expect(isModelVisionCapable('gpt-5.6-terra')).toBe(true)
    expect(isModelVisionCapable('gpt-4o')).toBe(true)

    // Gemini
    expect(isModelVisionCapable('gemini-2.0-flash')).toBe(true)
  })
})
