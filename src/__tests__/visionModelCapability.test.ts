import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LLM_MODEL_ID,
  DEEPSEEK_MODEL_OPTIONS,
  isModelVisionCapable,
} from '../config/llmModels'

describe('Vision Model Capability', () => {
  it('default model is deepseek-v4-flash-vision-exp', () => {
    expect(DEFAULT_LLM_MODEL_ID).toBe('deepseek-v4-flash-vision-exp')
    expect(DEEPSEEK_MODEL_OPTIONS.some((m) => m.id === 'deepseek-v4-flash-vision-exp')).toBe(true)
  })

  it('correctly identifies vision-capable and text-only models', () => {
    // DeepSeek vision model
    expect(isModelVisionCapable('deepseek-v4-flash-vision-exp')).toBe(true)

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
