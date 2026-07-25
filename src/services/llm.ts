import { memoizeLlmCall } from './llmMemo'

/**
 * Lightweight LLM helpers for place blurbs and day titles.
 *
 * Provider switching (OpenAI ↔ Gemini auto-fallback + manual toggle) is temporarily
 * disabled. Flip ENABLE_LLM_PROVIDER_SWITCH to true to restore it; keep VITE_GEMINI_API_KEY in .env.
 */

export type LlmProvider = 'openai' | 'gemini'

/** Temporarily off — set true to re-enable Gemini failover / manual model switch. */
export const ENABLE_LLM_PROVIDER_SWITCH = false

const PROVIDER_STORAGE_KEY = 'paris-tour-llm-provider'
const OPENAI_MODEL_STORAGE_KEY = 'paris-tour-openai-model-v2'
const GEMINI_MODEL = 'gemini-2.0-flash'

/** Selectable OpenAI chat models shown in the UI dropdown (latest only). */
export const OPENAI_MODEL_OPTIONS = [
  { id: 'gpt-5.6-luna', label: 'GPT-5.6 luna（推荐）' },
  { id: 'gpt-5.6-sol', label: 'GPT-5.6 sol' },
  { id: 'gpt-5.6-terra', label: 'GPT-5.6 terra' },
  { id: 'gpt-5.5', label: 'GPT-5.5' },
  { id: 'gpt-5.5-pro', label: 'GPT-5.5 pro' },
  { id: 'gpt-5.4-nano', label: 'GPT-5.4 nano' },
  { id: 'gpt-5.4-mini', label: 'GPT-5.4 mini' },
  { id: 'gpt-5.4', label: 'GPT-5.4' },
] as const

export type OpenAIModelId = (typeof OPENAI_MODEL_OPTIONS)[number]['id']

const OPENAI_MODEL_IDS = new Set<string>(OPENAI_MODEL_OPTIONS.map((m) => m.id))

function geminiKey() {
  return (import.meta.env.VITE_GEMINI_API_KEY as string | undefined)?.trim() || ''
}

function openaiKey() {
  return (import.meta.env.VITE_OPENAI_API_KEY as string | undefined)?.trim() || ''
}

function openaiBase() {
  return (
    (import.meta.env.VITE_OPENAI_BASE_URL as string | undefined)?.trim() ||
    'https://api.openai.com/v1'
  )
}

function defaultOpenAIModel(): string {
  const fromEnv = (import.meta.env.VITE_OPENAI_MODEL as string | undefined)?.trim()
  if (fromEnv && OPENAI_MODEL_IDS.has(fromEnv)) return fromEnv
  return 'gpt-5.6-luna'
}

function readStoredOpenAIModel(): string | null {
  try {
    const v = localStorage.getItem(OPENAI_MODEL_STORAGE_KEY)?.trim()
    if (v && OPENAI_MODEL_IDS.has(v)) return v
  } catch {
    /* ignore */
  }
  return null
}

let activeOpenAIModel = readStoredOpenAIModel() || defaultOpenAIModel()
const openaiModelListeners = new Set<() => void>()

function notifyOpenAIModelListeners() {
  for (const cb of openaiModelListeners) cb()
}

function openaiModel() {
  return activeOpenAIModel || defaultOpenAIModel()
}

export function getOpenAIModel(): string {
  return openaiModel()
}

export function getOpenAIModelLabel(modelId = getOpenAIModel()): string {
  const found = OPENAI_MODEL_OPTIONS.find((m) => m.id === modelId)
  return found?.label || modelId
}

export function setOpenAIModel(modelId: string) {
  const next = modelId.trim()
  if (!next || next === activeOpenAIModel) return
  activeOpenAIModel = next
  try {
    localStorage.setItem(OPENAI_MODEL_STORAGE_KEY, next)
  } catch {
    /* ignore */
  }
  notifyOpenAIModelListeners()
}

export function subscribeOpenAIModel(listener: () => void): () => void {
  openaiModelListeners.add(listener)
  return () => {
    openaiModelListeners.delete(listener)
  }
}

export function isLlmConfigured(): boolean {
  if (ENABLE_LLM_PROVIDER_SWITCH) return Boolean(geminiKey() || openaiKey())
  return Boolean(openaiKey())
}

export function isProviderConfigured(provider: LlmProvider): boolean {
  if (provider === 'gemini' && !ENABLE_LLM_PROVIDER_SWITCH) return false
  return provider === 'openai' ? Boolean(openaiKey()) : Boolean(geminiKey())
}

export function getProviderModelName(provider: LlmProvider): string {
  return provider === 'openai' ? openaiModel() : GEMINI_MODEL
}

export function getProviderLabel(provider: LlmProvider): string {
  return provider === 'openai' ? `OpenAI · ${openaiModel()}` : `Gemini · ${GEMINI_MODEL}`
}

function readStoredProvider(): LlmProvider | null {
  try {
    const v = localStorage.getItem(PROVIDER_STORAGE_KEY)
    if (v === 'openai' || v === 'gemini') return v
  } catch {
    /* ignore */
  }
  return null
}

function defaultProvider(): LlmProvider {
  if (openaiKey()) return 'openai'
  if (geminiKey()) return 'gemini'
  return 'openai'
}

let activeProvider: LlmProvider = readStoredProvider() || defaultProvider()
let switchNotice: string | null = null
const providerListeners = new Set<() => void>()

function notifyProviderListeners() {
  for (const cb of providerListeners) cb()
}

export function getLlmProvider(): LlmProvider {
  if (!isProviderConfigured(activeProvider)) {
    activeProvider = defaultProvider()
  }
  return activeProvider
}

export function setLlmProvider(provider: LlmProvider, options?: { notice?: string | null }) {
  if (!isProviderConfigured(provider)) return
  const prev = activeProvider
  activeProvider = provider
  try {
    localStorage.setItem(PROVIDER_STORAGE_KEY, provider)
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
  return (
    ENABLE_LLM_PROVIDER_SWITCH &&
    Boolean(openaiKey()) &&
    Boolean(geminiKey())
  )
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

export class LlmRequestError extends Error {
  code?: string
  constructor(message: string, code?: string) {
    super(message)
    this.name = 'LlmRequestError'
    this.code = code
  }
}

function friendlyLlmError(status: number, body: string, provider: LlmProvider): LlmRequestError {
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

  if (status === 429 || code === 'insufficient_quota' || /quota|rate limit/i.test(apiMessage)) {
    if (provider === 'openai') {
      return new LlmRequestError(
        'OpenAI 额度不足或触发限流（429）。',
        code || 'insufficient_quota',
      )
    }
    return new LlmRequestError('Gemini 额度不足或触发限流。', code || 'rate_limit')
  }
  if (status === 401 || status === 403 || /invalid.?key|incorrect api key/i.test(apiMessage)) {
    return new LlmRequestError(
      provider === 'openai' ? 'OpenAI API Key 无效。' : 'Gemini API Key 无效。',
      code || 'auth_error',
    )
  }

  const detail = apiMessage || body.slice(0, 160) || `HTTP ${status}`
  return new LlmRequestError(`${getProviderLabel(provider)} 请求失败：${detail}`, code || String(status))
}

async function callGemini(system: string, user: string): Promise<string> {
  const key = geminiKey()
  if (!key) throw new LlmRequestError('未配置 Gemini API Key。', 'missing_key')

  const url = `/api/gemini/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(key)}`
  const res = await fetch(url, {
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
  })
  if (!res.ok) {
    throw friendlyLlmError(res.status, await res.text(), 'gemini')
  }
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  }
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || ''
  if (!text.trim()) throw new LlmRequestError('Gemini 没有返回内容。', 'empty')
  return text.trim()
}

/** gpt-5 / o-series often only allow default temperature (1) and max_completion_tokens. */
function openaiUsesRestrictedSampling(model: string): boolean {
  return /^(o\d|gpt-5)/i.test(model.trim())
}

export type OpenAIChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

function buildOpenAIChatBody(messages: OpenAIChatMessage[]): Record<string, unknown> {
  const model = openaiModel()
  const body: Record<string, unknown> = {
    model,
    // Reasoning models spend tokens before visible content; keep headroom for JSON replies.
    max_completion_tokens: 8192,
    messages,
  }
  if (!openaiUsesRestrictedSampling(model)) {
    body.temperature = 0.7
  }
  return body
}

function extractOpenAIMessageText(data: {
  choices?: Array<{
    finish_reason?: string
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

async function callOpenAIMessages(messages: OpenAIChatMessage[]): Promise<string> {
  const key = openaiKey()
  if (!key) throw new LlmRequestError('未配置 OpenAI API Key。', 'missing_key')

  const base = openaiBase().replace(/\/$/, '')
  const useProxy = base.includes('api.openai.com')
  const url = useProxy ? '/api/openai/chat/completions' : `${base}/chat/completions`
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${key}`,
  }

  let body = buildOpenAIChatBody(messages)

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const errText = await res.text()
      const lower = errText.toLowerCase()

      // Auto-adapt to model parameter restrictions, then retry.
      if (attempt < 2 && lower.includes('temperature') && 'temperature' in body) {
        delete body.temperature
        continue
      }
      if (attempt < 2 && lower.includes('max_tokens') && 'max_tokens' in body) {
        delete body.max_tokens
        body.max_completion_tokens = body.max_completion_tokens || 8192
        continue
      }
      if (
        attempt < 2 &&
        lower.includes('max_completion_tokens') &&
        lower.includes('max_tokens') &&
        !('max_tokens' in body)
      ) {
        delete body.max_completion_tokens
        body.max_tokens = 8192
        continue
      }

      throw friendlyLlmError(res.status, errText, 'openai')
    }

    const data = (await res.json()) as {
      choices?: Array<{
        finish_reason?: string
        message?: { content?: string | Array<{ type?: string; text?: string }>; refusal?: string }
      }>
    }
    const refusal = data.choices?.[0]?.message?.refusal?.trim()
    if (refusal) {
      throw new LlmRequestError(`模型拒绝回答：${refusal}`, 'refusal')
    }

    const text = extractOpenAIMessageText(data)
    if (text) return text

    const finish = data.choices?.[0]?.finish_reason || ''
    if (finish === 'length') {
      throw new LlmRequestError(
        '模型输出被截断（可能把额度用在了内部推理上）。请换 gpt-5.4-nano，或稍后再试。',
        'truncated',
      )
    }
    throw new LlmRequestError('OpenAI 没有返回内容。', 'empty')
  }

  throw new LlmRequestError('OpenAI 请求失败。')
}

async function callOpenAI(system: string, user: string): Promise<string> {
  return callOpenAIMessages([
    { role: 'system', content: system },
    { role: 'user', content: user },
  ])
}

async function callProvider(provider: LlmProvider, system: string, user: string): Promise<string> {
  return provider === 'openai' ? callOpenAI(system, user) : callGemini(system, user)
}

/** Multi-turn chat completion (OpenAI). Throws on failure. */
export async function openaiChat(messages: OpenAIChatMessage[]): Promise<string> {
  if (!openaiKey()) throw new LlmRequestError('未配置 OpenAI API Key。', 'missing_key')
  return callOpenAIMessages(messages)
}

type OpenAIResponsesPayload = {
  output_text?: string
  output?: Array<{
    type?: string
    content?: Array<{ type?: string; text?: string }>
  }>
  error?: { message?: string; code?: string; type?: string }
}

function extractResponsesText(data: OpenAIResponsesPayload): string {
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
 * OpenAI Responses API with built-in web_search tool.
 * Used when live APIs fail and we need fresher public web data.
 */
export async function openaiResponsesWithWebSearch(input: {
  instructions: string
  user: string
}): Promise<string> {
  const key = openaiKey()
  if (!key) throw new LlmRequestError('未配置 OpenAI API Key。', 'missing_key')

  const base = openaiBase().replace(/\/$/, '')
  const useProxy = base.includes('api.openai.com')
  const url = useProxy ? '/api/openai/responses' : `${base}/responses`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: openaiModel(),
      tools: [{ type: 'web_search' }],
      tool_choice: 'required',
      instructions: input.instructions,
      input: input.user,
    }),
  })

  if (!res.ok) {
    throw friendlyLlmError(res.status, await res.text(), 'openai')
  }

  const data = (await res.json()) as OpenAIResponsesPayload
  if (data.error?.message) {
    throw new LlmRequestError(data.error.message, data.error.code || data.error.type)
  }

  const text = extractResponsesText(data)
  if (!text) throw new LlmRequestError('OpenAI 联网查询没有返回内容。', 'empty')
  return text
}

export function extractLlmJsonObject(text: string): Record<string, unknown> | null {
  return extractJsonObject(text)
}

function providerOrder(preferred: LlmProvider): LlmProvider[] {
  if (!ENABLE_LLM_PROVIDER_SWITCH) {
    return isProviderConfigured('openai') ? ['openai'] : []
  }
  const other: LlmProvider = preferred === 'openai' ? 'gemini' : 'openai'
  return [preferred, other].filter(isProviderConfigured)
}

async function generateText(
  system: string,
  user: string,
  options?: { strict?: boolean },
): Promise<string | null> {
  const strict = Boolean(options?.strict)
  const preferred = ENABLE_LLM_PROVIDER_SWITCH ? getLlmProvider() : 'openai'
  const order = providerOrder(preferred)

  if (!order.length) {
    if (strict) {
      throw new LlmRequestError(
        ENABLE_LLM_PROVIDER_SWITCH
          ? '未配置可用的大模型 API Key（OpenAI / Gemini）。'
          : '未配置 OpenAI API Key（VITE_OPENAI_API_KEY）。',
      )
    }
    return null
  }

  let lastError: unknown = null

  for (const provider of order) {
    try {
      const text = await callProvider(provider, system, user)
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

function extractJsonObject(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = (fenced?.[1] || text).trim()
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>
  } catch {
    return null
  }
}

export async function generatePlaceDescription(input: {
  name: string
  type: string
  address?: string
  googleSummary?: string
}): Promise<string | null> {
  const key = `place-desc:${input.name}|${input.type}|${input.address || ''}|${input.googleSummary || ''}`
  return memoizeLlmCall(key, async () => {
    const system =
      '你是巴黎旅行文案助手。用简洁中文写地点简介，2–3 句，面向秋季游客，不要用列表，不要夸张营销套话。'
    const user = [
      `地点：${input.name}`,
      `类型：${input.type}`,
      input.address ? `地址：${input.address}` : '',
      input.googleSummary ? `参考信息：${input.googleSummary}` : '',
      '请直接输出简介正文，不要标题。',
    ]
      .filter(Boolean)
      .join('\n')

    return generateText(system, user)
  })
}

export interface HotelDetailCopy {
  intro: string
  reason: string
  tripFit: string
}

/** Rich hotel narrative for the detail popup: intro, why recommended, trip fit. */
export async function generateHotelDetailCopy(input: {
  name: string
  area: string
  address: string
  nearestMetro?: string
  ratingHint?: string
  existingDescription?: string
  existingReason?: string
  isBest?: boolean
  userPreferences?: string
  tripDays?: Array<{ day: number; title: string; pace: string; theme: string }>
}): Promise<HotelDetailCopy | null> {
  if (!isLlmConfigured()) return null

  const system =
    '你是巴黎秋季七日行程住宿顾问。为酒店详情页写简洁中文点评。只输出 JSON，不要 markdown。'
  const user = JSON.stringify({
    hotel: {
      name: input.name,
      area: input.area,
      address: input.address,
      nearestMetro: input.nearestMetro || '',
      ratingHint: input.ratingHint || '',
      existingDescription: input.existingDescription || '',
      existingReason: input.existingReason || '',
      isBest: Boolean(input.isBest),
    },
    userPreferences: input.userPreferences || null,
    trip: input.tripDays || [],
    rules: [
      'intro：2–3 句酒店简介（氛围、区位、适合谁），可吸收 existingDescription 但要更完整',
      'reason：1–2 句说明为何出现在推荐列表 / 为何值得考虑',
      'tripFit：2–3 句说明它与七日行程（地铁出行、迪士尼日、自驾日、抵达日倒时差等）以及 userPreferences 的匹配关系；若无偏好则按行程常识写',
      '不要编造具体房价数字；不要推荐卢浮宫/凡尔赛周边作为唯一卖点',
    ],
    format: { intro: 'string', reason: 'string', tripFit: 'string' },
  })

  const text = await generateText(system, user)
  if (!text) return null
  const parsed = extractJsonObject(text)
  if (!parsed) return null

  const intro = String(parsed.intro || parsed.description || '').trim()
  const reason = String(parsed.reason || '').trim()
  const tripFit = String(parsed.tripFit || parsed.fit || '').trim()
  if (!intro && !reason && !tripFit) return null

  return {
    intro: intro || input.existingDescription || `${input.name}，位于${input.area}。`,
    reason: reason || input.existingReason || '适合作为巴黎行程的住宿起点。',
    tripFit:
      tripFit ||
      '地铁便利，便于连接本行程中的右岸经典、左岸轻松日与迪士尼/自驾安排。',
  }
}

/** Rich place narrative for the detail popup (same structure as hotel). */
export async function generatePlaceDetailCopy(input: {
  name: string
  nameLocal?: string
  type: string
  address?: string
  existingDescription?: string
  stopNote?: string
  day?: number
  dayTitle?: string
  dayTheme?: string
  dayPace?: string
  hotelArea?: string
  tripDays?: Array<{ day: number; title: string; pace: string; theme: string }>
}): Promise<HotelDetailCopy | null> {
  if (!isLlmConfigured()) return null

  const system =
    '你是巴黎秋季七日行程顾问。为地点详情页写简洁中文点评。只输出 JSON，不要 markdown。'
  const user = JSON.stringify({
    place: {
      name: input.name,
      nameLocal: input.nameLocal || '',
      type: input.type,
      address: input.address || '',
      existingDescription: input.existingDescription || '',
      stopNote: input.stopNote || '',
    },
    currentDay: {
      day: input.day || null,
      title: input.dayTitle || '',
      theme: input.dayTheme || '',
      pace: input.dayPace || '',
      hotelArea: input.hotelArea || '',
    },
    trip: input.tripDays || [],
    rules: [
      'intro：2–3 句地点简介（氛围、看点、适合谁），可吸收 existingDescription',
      'reason：1–2 句说明为何值得放进行程 / 为何出现在当天；可参考 stopNote',
      'tripFit：固定输出空字符串（地点详情页不展示此项）',
      '不要推荐卢浮宫或凡尔赛；不要编造营业时间与价格',
    ],
    format: { intro: 'string', reason: 'string', tripFit: '' },
  })

  const text = await generateText(system, user)
  if (!text) return null
  const parsed = extractJsonObject(text)
  if (!parsed) return null

  const intro = String(parsed.intro || parsed.description || '').trim()
  const reason = String(parsed.reason || '').trim()
  if (!intro && !reason) return null

  return {
    intro: intro || input.existingDescription || `${input.name}，适合安排进巴黎行程。`,
    reason: reason || input.stopNote || '适合补充进今天的行程节奏。',
    tripFit: '',
  }
}

export async function generateDayCopy(input: {
  day: number
  pace: string
  placeNames: string[]
  hotelArea?: string
}): Promise<{ title: string; theme: string; summary: string } | null> {
  if (!input.placeNames.length) {
    return {
      title: `第 ${input.day} 天`,
      theme: '自由安排',
      summary: '今天还没有安排地点，添加景点后会自动生成标题与总结。',
    }
  }

  const key = `day-copy:${input.day}|${input.pace}|${input.hotelArea || ''}|${input.placeNames.join('>')}`
  return memoizeLlmCall(key, async () => {
    const system =
      '你是巴黎七日行程编辑。根据当天地点列表，用简体中文生成短标题、主题与总结。标题 2–6 字（如「西侧经典」「左岸轻松」），主题一句话，总结 2 句说明节奏与亮点。只输出 JSON。'
    const user = JSON.stringify({
      day: input.day,
      pace: input.pace,
      hotelArea: input.hotelArea || '',
      places: input.placeNames,
      format: { title: 'string', theme: 'string', summary: 'string' },
    })

    const text = await generateText(system, user)
    if (!text) return fallbackDayCopy(input)

    const parsed = extractJsonObject(text)
    if (!parsed) return fallbackDayCopy(input)

    const title = String(parsed.title || '').trim()
    const theme = String(parsed.theme || '').trim()
    const summary = String(parsed.summary || '').trim()
    if (!title || !summary) return fallbackDayCopy(input)

    return {
      title: title.slice(0, 12),
      theme: theme || input.pace,
      summary,
    }
  })
}

function fallbackDayCopy(input: {
  day: number
  pace: string
  placeNames: string[]
}): { title: string; theme: string; summary: string } {
  const highlights = input.placeNames.slice(0, 3).join('、')
  const title =
    input.pace === '乐园日'
      ? '迪士尼日'
      : input.pace === '自驾日'
        ? '近郊自驾'
        : input.day === 1
          ? '抵达巴黎'
          : input.day === 7
            ? '返程日'
            : highlights.slice(0, 6) || `第 ${input.day} 天`

  return {
    title,
    theme: `${input.pace}节奏`,
    summary: highlights
      ? `今天主要安排：${highlights}${input.placeNames.length > 3 ? '等' : ''}。可根据体力微调顺序与停留时间。`
      : '今天还没有安排地点。',
  }
}

export type RecommendPlaceType = 'cafe' | 'attraction' | 'restaurant'

export interface PlaceRecommendation {
  name: string
  nameLocal?: string
  type: RecommendPlaceType
  /** Short why-this-day line */
  reason: string
  /** Richer 2–3 sentence introduction */
  intro: string
  area?: string
}

const RECOMMEND_TYPES: RecommendPlaceType[] = ['cafe', 'attraction', 'restaurant']

function normalizeRecommendType(raw: unknown): RecommendPlaceType {
  const v = String(raw || '').toLowerCase()
  if (v.includes('cafe') || v.includes('coffee') || v === '咖啡馆') return 'cafe'
  if (v.includes('restaurant') || v.includes('food') || v === '餐厅') return 'restaurant'
  return 'attraction'
}

function toExcludeSet(names: string[]): Set<string> {
  return new Set(names.map((n) => n.toLowerCase().trim()).filter(Boolean))
}

/**
 * Recommend places for the current day via LLM only (no local fallback pool).
 */
export async function recommendPlacesForDay(input: {
  day: number
  title: string
  pace: string
  theme?: string
  hotelArea?: string
  currentPlaceNames: string[]
  tripPlaceNames?: string[]
  /** Extra names to avoid (e.g. previous recommendation batch) */
  excludeNames?: string[]
  /** Bump to ask for a fresh batch */
  batch?: number
}): Promise<PlaceRecommendation[]> {
  if (!isLlmConfigured()) return []

  const batch = Math.max(1, input.batch || 1)
  const itineraryExclude = toExcludeSet([
    ...input.currentPlaceNames,
    ...(input.tripPlaceNames || []),
  ])

  const system =
    '你是巴黎秋季旅行顾问。根据游客当天已有行程，推荐互补、少重复、步行友好的地点。不要推荐卢浮宫或凡尔赛。只输出 JSON。'
  const user = JSON.stringify({
    day: input.day,
    title: input.title,
    pace: input.pace,
    theme: input.theme || '',
    hotelArea: input.hotelArea || '',
    alreadyOnThisDay: input.currentPlaceNames,
    alreadyOnTrip: input.tripPlaceNames || [],
    avoidAlso: input.excludeNames || [],
    batch,
    rules: [
      '共推荐至少 12 个地点：attraction / cafe / restaurant 每类至少 4 个',
      '严禁推荐 alreadyOnThisDay 与 alreadyOnTrip 中的地点',
      '尽量避开 avoidAlso（上一批推荐）；batch>1 时必须给出明显不同的新名单，不要复用上一批',
      'name 用可被 Google Maps 搜到的正式名称，可附 nameLocal 中文名',
      'reason：一句话说明为何适合插入今天',
      'intro：2–3 句中文介绍',
    ],
    format: {
      recommendations: [
        {
          name: 'string',
          nameLocal: 'string?',
          type: 'cafe|attraction|restaurant',
          reason: 'string',
          intro: 'string',
          area: 'string?',
        },
      ],
    },
  })

  const text = await generateText(system, user, { strict: true })
  if (!text) {
    throw new LlmRequestError('大模型没有返回内容，请再试一次。')
  }

  const parsed = extractJsonObject(text)
  const list = (parsed?.recommendations as unknown[]) || []
  if (!Array.isArray(list) || !list.length) {
    throw new LlmRequestError('大模型返回了内容，但无法解析成地点列表，请再点「换一批」。')
  }

  const out: PlaceRecommendation[] = []
  const seen = new Set<string>()

  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const name = String(row.name || '').trim()
    if (!name) continue
    const key = name.toLowerCase()
    if (itineraryExclude.has(key) || seen.has(key)) continue
    const type = normalizeRecommendType(row.type)
    if (!RECOMMEND_TYPES.includes(type)) continue
    const reason = String(row.reason || '适合补充进今天的行程').trim()
    const intro = String(row.intro || row.description || reason).trim()
    out.push({
      name,
      nameLocal: String(row.nameLocal || '').trim() || undefined,
      type,
      reason,
      intro: intro || reason,
      area: String(row.area || '').trim() || undefined,
    })
    seen.add(key)
  }

  return out
}

export interface HotelRecommendation {
  name: string
  area: string
  address?: string
  description: string
  nearestMetro?: string
  priceHint?: string
  reason: string
  isBest: boolean
}

/**
 * Recommend Paris stay options via LLM (no local hotel catalog).
 * Caller should resolve names with Google Places afterwards.
 */
export async function recommendHotelsForTrip(input?: {
  batch?: number
  excludeNames?: string[]
  /** Free-text user preferences (area, budget, vibe, etc.) */
  preferences?: string
  /** How many hotels to return (1–8). Default 5. */
  count?: number
}): Promise<HotelRecommendation[]> {
  if (!isLlmConfigured()) {
    throw new LlmRequestError('未配置 OpenAI API Key，无法推荐酒店。', 'missing_key')
  }

  const batch = Math.max(1, input?.batch || 1)
  const count = Math.max(1, Math.min(8, input?.count || 5))
  const preferences = input?.preferences?.trim() || ''
  const system =
    '你是巴黎秋季旅行住宿顾问。为温哥华出发的七日行程推荐真实可搜到的酒店。只输出 JSON。'
  const user = JSON.stringify({
    trip: 'Paris autumn 7-day, metro-first, avoid Louvre/Versailles focus',
    batch,
    count,
    userPreferences: preferences || null,
    avoidAlso: input?.excludeNames || [],
    rules: [
      `恰好推荐 ${count} 家真实酒店（中档为主，可含 1 家稍高档）`,
      '优先 Marais / Opéra / Grands Boulevards / Saint-Germain / Latin 等地铁便利区',
      '若提供 userPreferences，必须优先满足（区位、预算、风格、安静/便利等）',
      'name 用 Google Maps 可搜到的正式店名；尽量附 address',
      count === 1
        ? '仅 1 家时 isBest 必须为 true'
        : '恰好 1 家 isBest=true 作为最优推荐，其余 false',
      'batch>1 时给出明显不同的新名单，避开 avoidAlso',
      'description：2 句中文；reason：一句话为何适合本次行程/用户偏好',
    ],
    format: {
      hotels: [
        {
          name: 'string',
          area: 'string',
          address: 'string?',
          description: 'string',
          nearestMetro: 'string?',
          priceHint: 'string?',
          reason: 'string',
          isBest: 'boolean',
        },
      ],
    },
  })

  const text = await generateText(system, user, { strict: true })
  if (!text) {
    throw new LlmRequestError('大模型没有返回酒店推荐。')
  }

  const parsed = extractJsonObject(text)
  const list = (parsed?.hotels as unknown[]) || []
  if (!Array.isArray(list) || !list.length) {
    throw new LlmRequestError('无法解析酒店推荐列表，请再试一次。')
  }

  const exclude = toExcludeSet(input?.excludeNames || [])
  const out: HotelRecommendation[] = []
  const seen = new Set<string>()

  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const name = String(row.name || '').trim()
    if (!name) continue
    const key = name.toLowerCase()
    if (exclude.has(key) || seen.has(key)) continue
    out.push({
      name,
      area: String(row.area || '巴黎市区').trim() || '巴黎市区',
      address: String(row.address || '').trim() || undefined,
      description: String(row.description || row.reason || '').trim() || `${name}，适合巴黎行程住宿。`,
      nearestMetro: String(row.nearestMetro || '').trim() || undefined,
      priceHint: String(row.priceHint || '').trim() || undefined,
      reason: String(row.reason || '地铁便利，适合七日行程').trim(),
      isBest: Boolean(row.isBest),
    })
    seen.add(key)
  }

  if (!out.length) {
    throw new LlmRequestError('酒店推荐为空，请再试一次。')
  }

  // Ensure exactly one best pick.
  if (!out.some((h) => h.isBest)) {
    out[0].isBest = true
  } else {
    let sawBest = false
    for (const h of out) {
      if (h.isBest) {
        if (sawBest) h.isBest = false
        else sawBest = true
      }
    }
  }

  return out
}
