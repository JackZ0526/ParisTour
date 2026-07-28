import type { FlightInfo } from '../types'
import { memoizeLlmCall } from './llmMemo'

/**
 * Lightweight LLM helpers for place blurbs and day titles.
 *
 * API keys NEVER ship to the browser. All OpenAI / Gemini calls go through
 * `/api/openai` and `/api/gemini` (Vite dev proxy or Vercel serverless), which
 * inject OPENAI_API_KEY / GEMINI_API_KEY server-side.
 *
 * Provider switching (OpenAI ↔ Gemini) is temporarily disabled.
 * Flip ENABLE_LLM_PROVIDER_SWITCH to true to restore it.
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

/** Public (non-secret) model id for the UI — not an API key. */
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
  // Keys live only on the server. Opt out with VITE_LLM_ENABLED=false.
  const flag = (import.meta.env.VITE_LLM_ENABLED as string | undefined)?.trim().toLowerCase()
  if (flag === '0' || flag === 'false' || flag === 'off') return false
  return true
}

export function isProviderConfigured(provider: LlmProvider): boolean {
  if (provider === 'gemini' && !ENABLE_LLM_PROVIDER_SWITCH) return false
  return isLlmConfigured()
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
  // Key injected by /api/gemini (Vite proxy or Vercel) — never send from the browser.
  const url = `/api/gemini/v1beta/models/${GEMINI_MODEL}:generateContent`
  const { authFetch } = await import('./authFetch')
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
  // Key injected by /api/openai — never send Authorization from the browser.
  const url = '/api/openai/chat/completions'
  const headers = {
    'Content-Type': 'application/json',
  }

  let body = buildOpenAIChatBody(messages)

  const { authFetch } = await import('./authFetch')
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await authFetch(url, {
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
  if (!isLlmConfigured()) {
    throw new LlmRequestError('大模型已关闭（VITE_LLM_ENABLED=false）。', 'missing_key')
  }
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
  if (!isLlmConfigured()) {
    throw new LlmRequestError('大模型已关闭（VITE_LLM_ENABLED=false）。', 'missing_key')
  }

  const url = '/api/openai/responses'
  const { authFetch } = await import('./authFetch')

  const res = await authFetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
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
          : '未配置服务端 OPENAI_API_KEY（请写在 .env / Vercel，不要用 VITE_ 前缀）。',
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
      '你是巴黎旅行文案助手。用简洁中文写地点简介，2–3 句，面向秋季游客，不要用列表，不要夸张营销套话。若类型是 cafe/咖啡馆，按「喝咖啡、吃面包甜点或 brunch」的小店来写，不要写成正餐餐厅；法语 café 常指餐厅，此处不是那个意思。'
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
    '你是巴黎秋季行程住宿顾问。为酒店详情页写简洁中文点评。只输出 JSON，不要 markdown。'
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
      'tripFit：2–3 句说明它与本次行程（地铁出行、迪士尼日、自驾日、抵达日倒时差等）以及 userPreferences 的匹配关系；若无偏好则按行程常识写',
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
    '你是巴黎秋季行程顾问。为地点详情页写简洁中文点评。只输出 JSON，不要 markdown。'
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
  /** Chinese label for hotel district (e.g. 16区特罗卡德罗) — use this in 落脚点 copy */
  hotelAreaLabel?: string
  /** Calendar date for this itinerary day (YYYY-MM-DD), after timezone-aware start */
  calendarDate?: string
  /** Total daytime days in this itinerary (not a fixed 7) */
  totalDays?: number
}): Promise<{ title: string; theme: string; summary: string } | null> {
  if (!input.placeNames.length) {
    return {
      title: `第 ${input.day} 天`,
      theme: '自由安排',
      summary: '今天还没有安排地点，添加景点后会自动生成标题与总结。',
    }
  }

  const totalDays = input.totalDays && input.totalDays > 0 ? input.totalDays : undefined
  const hotelLabel = (input.hotelAreaLabel || input.hotelArea || '').trim()
  const key = `day-copy:${input.day}|${totalDays || ''}|${input.calendarDate || ''}|${input.pace}|${hotelLabel}|${input.placeNames.join('>')}`
  return memoizeLlmCall(key, async () => {
    const lengthHint = totalDays ? `${totalDays} 日行程` : '本次行程'
    const baseRule = hotelLabel
      ? `若提到酒店落脚片区，必须写「${hotelLabel}」，不要写成其他区（如圣日耳曼、玛黑）。`
      : '不要编造错误的酒店落脚片区。'
    const system =
      `你是巴黎${lengthHint}编辑。根据当天地点列表，用简体中文生成短标题、主题与总结。标题 2–6 字（如「西侧经典」「左岸轻松」），主题一句话，总结 2 句说明节奏与亮点。${baseRule}只输出 JSON。`
    const user = JSON.stringify({
      day: input.day,
      totalDays: totalDays || null,
      calendarDate: input.calendarDate || null,
      pace: input.pace,
      hotelArea: input.hotelArea || '',
      hotelAreaLabel: hotelLabel || null,
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

export interface ItineraryStartInput {
  tripStartDate: string
  tripEndDate?: string | null
  destination?: string
  hotelName?: string | null
  outbound: {
    flightNumber: string
    airline?: string
    from?: FlightInfo['from']
    to?: FlightInfo['to']
    duration?: string
    status?: string
    rawNote?: string
  }
}

export interface ItineraryStartResult {
  /** Paris local arrival calendar date YYYY-MM-DD */
  arrivalDateParis: string
  /** Paris local arrival time if known, e.g. 14:35 */
  arrivalTimeParis?: string
  /** Calendar date that itinerary Day 1 should map to */
  itineraryStartDate: string
  /** True when Day 1 stays on trip startDate */
  startsOnTripStartDate: boolean
  /** Short Chinese explanation for the itinerary section */
  reasonZh: string
}

/**
 * Given Vancouver→Paris outbound flight + trip dates, ask the LLM whether
 * itinerary Day 1 should start on the trip start date or the next Paris day
 * (overnight / timezone shift).
 */
export async function resolveItineraryStart(
  input: ItineraryStartInput,
): Promise<ItineraryStartResult | null> {
  const start = input.tripStartDate?.trim()
  if (!start || !input.outbound?.flightNumber) return null
  if (!isLlmConfigured()) return null

  const dest = (input.destination || '巴黎').trim() || '巴黎'
  const out = input.outbound
  const cacheKey = [
    'itinerary-start',
    start,
    input.tripEndDate || '',
    dest,
    out.flightNumber,
    out.from?.scheduled || '',
    out.from?.actual || '',
    out.to?.scheduled || '',
    out.to?.actual || '',
    out.duration || '',
  ].join('|')

  return memoizeLlmCall(cacheKey, async () => {
    const system =
      '你是跨时区旅行规划助手。根据温哥华（America/Vancouver）出发、巴黎（Europe/Paris）抵达的去程航班，判断行程 Day 1 应对齐哪个巴黎日历日。只输出 JSON，不要 markdown。'
    const user = JSON.stringify({
      trip: {
        startDate: start,
        endDate: input.tripEndDate || null,
        destination: dest,
        hotel: input.hotelName || null,
        originCity: '温哥华',
        originAirportHint: 'YVR',
        arrivalCity: '巴黎',
        arrivalAirportHint: 'CDG',
      },
      outboundFlight: {
        flightNumber: out.flightNumber,
        airline: out.airline || null,
        from: out.from || null,
        to: out.to || null,
        duration: out.duration || null,
        status: out.status || null,
        note: out.rawNote || null,
      },
      rules: [
        '时区：温哥华 PDT/PST 与巴黎 CEST/CET 通常差 8–9 小时；YVR→CDG 直飞约 9–10 小时，傍晚起飞常次日下午抵达巴黎',
        'arrivalDateParis / arrivalTimeParis：巴黎当地抵达日历日与时刻（能从航班信息推断则写；不确定可据常规 AF375 类班次合理推断并在 reasonZh 说明）',
        'itineraryStartDate：行程第 1 天对应的巴黎日历日。若抵达已是次日、或抵达过晚不适合安排完整 Day 1，则用抵达日（常为 startDate 的次日）；若同日上午/中午抵达且可开始行程，则用 startDate',
        'startsOnTripStartDate：itineraryStartDate 是否等于 trip.startDate',
        'reasonZh：一句简体中文，面向旅客，说明时差/过夜航班与行程起算日，例如「去程抵达已是巴黎时间 11月10日，行程从第2个日历日起算」',
        '日期一律 YYYY-MM-DD；不要编造与航班信息明显矛盾的抵达日',
      ],
      format: {
        arrivalDateParis: 'YYYY-MM-DD',
        arrivalTimeParis: 'HH:MM?',
        itineraryStartDate: 'YYYY-MM-DD',
        startsOnTripStartDate: 'boolean',
        reasonZh: 'string',
      },
    })

    const text = await generateText(system, user)
    if (!text) return fallbackItineraryStart(start, out, input.tripEndDate)

    const parsed = extractJsonObject(text)
    if (!parsed) return fallbackItineraryStart(start, out, input.tripEndDate)

    const arrivalDateParis = normalizeIsoDate(parsed.arrivalDateParis) || start
    let itineraryStartDate =
      normalizeIsoDate(parsed.itineraryStartDate) || arrivalDateParis || start
    const end = normalizeIsoDate(input.tripEndDate)
    if (end && itineraryStartDate > end) {
      itineraryStartDate = end
    }
    const arrivalTimeParis = String(parsed.arrivalTimeParis || '').trim() || undefined
    const startsOnTripStartDate =
      typeof parsed.startsOnTripStartDate === 'boolean'
        ? parsed.startsOnTripStartDate
        : itineraryStartDate === start
    const reasonZh =
      String(parsed.reasonZh || '').trim() ||
      (startsOnTripStartDate
        ? `去程预计巴黎当地 ${formatZhMonthDay(arrivalDateParis)} 抵达，行程从出发日当天起算。`
        : `去程抵达已是巴黎时间 ${formatZhMonthDay(arrivalDateParis)}，行程从该日起算。`)

    return {
      arrivalDateParis,
      arrivalTimeParis,
      itineraryStartDate,
      startsOnTripStartDate,
      reasonZh,
    }
  }).catch(() => fallbackItineraryStart(start, out, input.tripEndDate))
}

function normalizeIsoDate(value: unknown): string | null {
  const raw = String(value || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null
  const d = new Date(`${raw}T12:00:00`)
  if (Number.isNaN(d.getTime())) return null
  return raw
}

function formatZhMonthDay(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00`)
  if (Number.isNaN(d.getTime())) return isoDate
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

function addOneCalendarDay(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00`)
  d.setDate(d.getDate() + 1)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Heuristic when LLM is unavailable: overnight YVR→CDG usually arrives next Paris day. */
function fallbackItineraryStart(
  tripStartDate: string,
  outbound: ItineraryStartInput['outbound'],
  tripEndDate?: string | null,
): ItineraryStartResult {
  const arriveText = `${outbound.to?.scheduled || ''} ${outbound.to?.actual || ''} ${outbound.rawNote || ''}`
  const explicitNext =
    /(\+1|次日|隔日|第二天|翌日|已是|跨日)/i.test(arriveText) ||
    /\b\d{4}-\d{2}-\d{2}\b/.test(arriveText)
  // Typical AF375 / YVR evening departure → CDG afternoon next day
  const assumeOvernight = true
  let arrivalDateParis =
    normalizeIsoDate(outbound.to?.scheduled?.match(/\d{4}-\d{2}-\d{2}/)?.[0]) ||
    (assumeOvernight || explicitNext ? addOneCalendarDay(tripStartDate) : tripStartDate)
  const end = normalizeIsoDate(tripEndDate)
  if (end && arrivalDateParis > end) {
    arrivalDateParis = end
  }
  const startsOnTripStartDate = arrivalDateParis === tripStartDate
  return {
    arrivalDateParis,
    arrivalTimeParis: undefined,
    itineraryStartDate: arrivalDateParis,
    startsOnTripStartDate,
    reasonZh: startsOnTripStartDate
      ? `去程预计巴黎当地 ${formatZhMonthDay(arrivalDateParis)} 抵达，行程从出发日当天起算。`
      : `温哥华–巴黎时差下，去程抵达多半已是巴黎时间 ${formatZhMonthDay(arrivalDateParis)}，行程从该日起算。`,
  }
}

function fallbackDayCopy(input: {
  day: number
  pace: string
  placeNames: string[]
  totalDays?: number
}): { title: string; theme: string; summary: string } {
  const highlights = input.placeNames.slice(0, 3).join('、')
  const lastDay = input.totalDays && input.totalDays > 0 ? input.totalDays : undefined
  const title =
    input.pace === '乐园日'
      ? '迪士尼日'
      : input.pace === '自驾日'
        ? '近郊自驾'
        : input.day === 1
          ? '抵达巴黎'
          : lastDay != null && input.day === lastDay
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

/**
 * French "café" often means a restaurant/brasserie. Our `cafe` type is coffee + pastry/brunch only.
 * Shared across recommend / full-plan / single-day regen prompts.
 */
const CAFE_VS_RESTAURANT_RULE =
  '类型区分（硬规则）：type=cafe 只指「咖啡馆」——以精品咖啡、面包/甜点、轻食或 brunch/早午餐为主的小店（specialty coffee、boulangerie-pâtisserie 可坐、brunch spot），不是正餐。法语里 café / café-restaurant / brasserie 常指吃饭的餐厅，禁止标成 cafe。午餐与晚餐正餐必须用 type=restaurant（bistro、brasserie、餐厅等）。不要用 cafe 顶替正餐，也不要用 restaurant 顶替早间咖啡/甜点/brunch 站。'

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
    '你是巴黎秋季旅行顾问。根据游客当天已有行程，推荐互补、少重复、步行友好的地点。不要推荐卢浮宫或凡尔赛。只输出 JSON。注意：cafe=咖啡馆（咖啡/面包甜点/brunch），不是法语里当餐厅用的 café。'
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
      CAFE_VS_RESTAURANT_RULE,
      'cafe 类：优先 Google 高分 specialty coffee、烘焙店可坐位、brunch/早午餐小店；不要推荐以正餐为主的 brasserie / café-restaurant',
      'restaurant 类：正餐（午餐/晚餐），可含 bistro、brasserie、各国菜；不要用咖啡店/纯甜品店凑数',
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
  /** Itinerary daytime day count when known */
  dayCount?: number
}): Promise<HotelRecommendation[]> {
  if (!isLlmConfigured()) {
    throw new LlmRequestError('未配置 OpenAI API Key，无法推荐酒店。', 'missing_key')
  }

  const batch = Math.max(1, input?.batch || 1)
  const count = Math.max(1, Math.min(8, input?.count || 5))
  const preferences = input?.preferences?.trim() || ''
  const dayCount = input?.dayCount && input.dayCount > 0 ? input.dayCount : undefined
  const tripLabel = dayCount ? `${dayCount}日巴黎行程` : '巴黎行程'
  const system =
    `你是巴黎秋季旅行住宿顾问。为温哥华出发的${tripLabel}推荐真实可搜到的酒店。只输出 JSON。`
  const user = JSON.stringify({
    trip: dayCount
      ? `Paris autumn ${dayCount}-day, metro-first, avoid Louvre/Versailles focus`
      : 'Paris autumn trip, metro-first, avoid Louvre/Versailles focus',
    dayCount: dayCount || null,
    batch,
    count,
    userPreferences: preferences || null,
    avoidAlso: input?.excludeNames || [],
    rules: [
      `恰好推荐 ${count} 家真实酒店（中档为主，可含 1 家稍高档）`,
      'area 统一写成「N区 (Français / 中文)」格式，例如「4区 (Marais / 玛黑)」「9区 (Opéra / 歌剧院)」「16区 (Trocadéro / 特罗卡德罗)」',
      '优先 3–4区玛黑 / 2区大林荫道 / 9区歌剧院 / 6区圣日耳曼 / 5区拉丁区 等地铁便利区',
      '若提供 userPreferences，必须优先满足（区位、预算、风格、安静/便利等）',
      'name 用 Google Maps 可搜到的正式店名；尽量附带含邮编的 address（如 75004 Paris）',
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
          area: '4区 (Marais / 玛黑)',
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
      reason: String(row.reason || '地铁便利，适合本次行程').trim(),
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

export interface DestinationSuggestion {
  name: string
  subtitle?: string
}

/**
 * Suggest popular travel destinations for quick-select chips.
 * Returns Chinese labels with optional local/English subtitle.
 */
export async function suggestPopularDestinations(options?: {
  /** Names/subtitles from the current chip batch to avoid */
  excludeNames?: string[]
  /** Currently selected destination (also avoided when refreshing) */
  currentDestination?: string
  /** Bump when asking for a fresh batch */
  batch?: number
  /** Target chip count (clamped to 6–10) */
  count?: number
}): Promise<DestinationSuggestion[]> {
  if (!isLlmConfigured()) {
    throw new LlmRequestError('未配置 OpenAI API Key，无法生成热门目的地。', 'missing_key')
  }

  const count = Math.min(10, Math.max(6, options?.count ?? 8))
  const batch = Math.max(1, options?.batch || 1)
  const avoidAlso = [
    ...(options?.excludeNames || []),
    ...(options?.currentDestination?.trim() ? [options.currentDestination.trim()] : []),
  ]
  const exclude = toExcludeSet(avoidAlso)

  const system =
    '你是旅行灵感助手。为中文用户推荐当下热门旅游城市/目的地。只输出 JSON，不要解释。'
  const user = JSON.stringify({
    count,
    batch,
    avoidAlso,
    currentDestination: options?.currentDestination?.trim() || '',
    rules: [
      `推荐 ${count} 个热门旅游目的地（城市为主，可含个别地区）`,
      'name 用简体中文常见称呼（如 巴黎、东京、巴塞罗那）',
      'subtitle 用当地官方或英文常用名（如 Paris、Tokyo）',
      '覆盖欧亚美等不同区域，避免全是同一国家',
      '不要编造不存在的地名',
      '严禁推荐 avoidAlso 与 currentDestination 中已出现的城市（含中英文名）',
      'batch>1 时必须给出明显不同的新名单，不要复用上一批',
    ],
    format: {
      destinations: [{ name: '巴黎', subtitle: 'Paris' }],
    },
  })

  const text = await generateText(system, user, { strict: true })
  if (!text) {
    throw new LlmRequestError('大模型没有返回热门目的地。')
  }

  const parsed = extractJsonObject(text)
  const list = (parsed?.destinations as unknown[]) || []
  if (!Array.isArray(list) || !list.length) {
    throw new LlmRequestError('无法解析热门目的地列表。')
  }

  const out: DestinationSuggestion[] = []
  const seen = new Set<string>()
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const name = String(row.name || '').trim()
    if (!name) continue
    const key = name.toLowerCase()
    const subtitle = String(row.subtitle || '').trim() || undefined
    const subKey = subtitle?.toLowerCase()
    if (exclude.has(key) || (subKey && exclude.has(subKey)) || seen.has(key)) continue
    out.push({ name, subtitle })
    seen.add(key)
    if (subKey) seen.add(subKey)
  }

  if (!out.length) {
    throw new LlmRequestError('热门目的地列表为空。')
  }

  return out.slice(0, 10)
}

export interface FullItineraryPlaceDraft {
  key: string
  name: string
  nameLocal?: string
  type: PlaceTypeForItinerary
  area?: string
  description?: string
  ratingHint?: string
  durationHint?: string
}

export type PlaceTypeForItinerary =
  | 'cafe'
  | 'attraction'
  | 'restaurant'
  | 'transport'
  | 'hotel'

export interface FullItineraryStopDraft {
  time: string
  placeKey: string
  note: string
  transport?: string
  walkLevel?: '很少走' | '短步行' | '中等步行'
  duration?: string
}

export interface FullItineraryDayDraft {
  day: number
  title: string
  theme: string
  pace: '轻松' | '适中' | '乐园日' | '自驾日'
  summary: string
  metroHintFromArea?: Record<string, string>
  stops: FullItineraryStopDraft[]
}

export interface FullItineraryDraft {
  days: FullItineraryDayDraft[]
  places: FullItineraryPlaceDraft[]
}

export interface GenerateFullItineraryInput {
  destination: string
  dayCount: number
  tripStartDate: string
  tripEndDate: string
  itineraryStartDate: string
  nights?: number
  hotel: {
    name: string
    address: string
    area?: string
    areaKey?: string
    lat: number
    lng: number
    nearestMetro?: string
  }
  outbound?: {
    flightNumber: string
    airline?: string
    from?: FlightInfo['from']
    to?: FlightInfo['to']
    duration?: string
    status?: string
    rawNote?: string
  } | null
  returnFlight?: {
    flightNumber: string
    airline?: string
    from?: FlightInfo['from']
    to?: FlightInfo['to']
    duration?: string
    status?: string
    rawNote?: string
  } | null
  preferences?: string
}

/**
 * Generate a complete multi-day Paris itinerary as structured JSON.
 * Caller resolves place names via Google Places and persists the result.
 */
export async function generateFullItinerary(
  input: GenerateFullItineraryInput,
): Promise<FullItineraryDraft> {
  if (!isLlmConfigured()) {
    throw new LlmRequestError('未配置 OpenAI API Key，无法生成行程。', 'missing_key')
  }

  const n = Math.max(1, Math.min(30, Math.floor(input.dayCount) || 1))
  const disneyDay = n >= 3 ? n - 1 : null
  const hotelArea =
    input.hotel.area ||
    input.hotel.areaKey ||
    '巴黎市区'

  const system =
    '你是巴黎秋季旅行规划师。根据旅客的日期、航班与酒店，生成完整多日行程。只输出 JSON，不要 markdown，不要解释。文案用简体中文，可带一点俏皮但不油腻。注意：cafe=咖啡馆（咖啡/面包甜点/brunch），不是法语里当餐厅用的 café。'

  const user = JSON.stringify({
    trip: {
      destination: input.destination || '巴黎',
      dayCount: n,
      nights: input.nights ?? Math.max(0, n - 1),
      tripStartDate: input.tripStartDate,
      tripEndDate: input.tripEndDate,
      itineraryStartDate: input.itineraryStartDate,
      preferences: input.preferences || null,
    },
    hotel: {
      name: input.hotel.name,
      address: input.hotel.address,
      area: hotelArea,
      areaKey: input.hotel.areaKey || null,
      lat: input.hotel.lat,
      lng: input.hotel.lng,
      nearestMetro: input.hotel.nearestMetro || null,
    },
    outboundFlight: input.outbound || null,
    returnFlight: input.returnFlight || null,
    hardRules: [
      `必须输出恰好 ${n} 天（day 字段为 1..${n}），每天都有 title/theme/pace/summary/stops`,
      'Day 1：抵达日。第一站必须是酒店办理入住（placeKey 用 "hotel-selected"，type hotel）。轻行程、倒时差优先；Day 1 不强制咖啡馆开场。',
      '除最后一天外：每一天的最后一站必须是回酒店过夜（placeKey "hotel-selected"，type hotel）。Day 1 若还有出门行程，则首站入住酒店 + 末站回酒店过夜（可两个 hotel-selected）；中间日早晨从酒店出发（酒店为原点，不必写在 stops 开头），末站仍须写回酒店。',
      '除 Day 1 与迪士尼日外：若当天安排了景点/餐饮，第一站（离开酒店后的第一站）必须是高分精品咖啡馆（type=cafe：咖啡/面包甜点/brunch 小店，真实可搜店名；不是正餐餐厅）。',
      disneyDay
        ? `倒数第二天（Day ${disneyDay}）必须是巴黎迪士尼全日：pace=乐园日。出游站只允许一个 "attr-disney"（Disneyland Paris），不要咖啡馆、不要餐厅站、不要其他景点；园内用餐不必单独写站。末站回酒店过夜（"hotel-selected"）。即当天 stops 实质上只有：迪士尼 + 回酒店。`
        : '行程不足 3 天时可不安排独立迪士尼日。',
      '必去（硬规则）：整个行程必须包含香榭丽舍大街（placeKey "attr-champs"）与凯旋门（placeKey "attr-arc"），可安排在同一天（二者相邻、顺路），不要拆成无关的重复街段。',
      '最后一天（返程日）：酒店仅作默认出发原点，不要把 hotel-selected 写入当天 stops（也不要末站回酒店）。完全由返程航班起飞时间倒推。国际航班预留 3–3.5 小时到 CDG（含交通）。若约 10:00 起床后时间紧张，可只安排机场一站（placeKey "attr-cdg"），不要硬塞景点；此时午餐/晚餐可省略。若上午仍有空档，可在去机场前安排一顿午餐或轻量咖啡馆（咖啡/甜点/brunch，非正餐 brasserie）。',
      '去重（硬规则）：整个行程不要重复同一景点/地标（同一正式名或同一 placeKey 只出现一次）；同一天内也不要重复。酒店 "hotel-selected"、机场 "attr-cdg" 除外；迪士尼日仅允许一个 "attr-disney"。',
      '每天行程开始约 10:00（自然醒）；不要安排 7–8 点观光（机场相关除外）。迪士尼日也尽量 10:00 左右出门，不要 7:45 强行早起。',
      CAFE_VS_RESTAURANT_RULE,
      '餐饮（硬规则）：除「仅酒店→机场」或时间过紧的返程日、以及迪士尼日外，每天必须安排午餐与晚餐两顿正餐（type=restaurant，约 12:00–14:00 与 19:00–21:00）。推荐高分、性价比高的真实可搜餐厅；不局限于法餐，意餐/亚洲菜/bistro 等均可。饭店须顺路、靠近当日片区聚类，少绕路少额外步行。正餐不得用 cafe 类型代替。',
      'Day 1 餐饮：抵达办入住后若仍有空档，再安排午餐和/或晚餐；落地过晚可只安排晚餐。',
      '动线：同日景点尽量同片区聚类，控制步行（walkLevel 优先 很少走/短步行）；跨区用地铁，少换乘。',
      '文案一致（硬规则）：note 只写本站在做什么（氛围/吃什么/看点），不要写「乘X号线回酒店」「地铁去下一站」等离开本站的具体交通；回酒店/去下一站由时间线站点之间的 Google 导航展示。walkLevel 表示到达本站这一段的步行强度，须与 transport 一致：若 transport 含地铁/公交则 walkLevel 不要写短步行/很少走。',
      '不要安排卢浮宫或凡尔赛作为行程重点。',
      'places[] 列出所有非特殊地点：key 与 stops.placeKey 对应；name 必须是 Google Maps 可搜到的正式名；附 area（如 玛黑/16区）。',
      '特殊 placeKey 固定："hotel-selected"（酒店）、"attr-disney"（迪士尼）、"attr-cdg"（戴高乐机场）、"attr-champs"（香榭丽舍大街）、"attr-arc"（凯旋门）——这些可不必重复写在 places[]。',
      'metroHintFromArea 至少给 custom 一条中文地铁/交通提示。',
      'time 用 HH:MM；最后一天去机场可用「按航班倒推」。',
    ],
    format: {
      places: [
        {
          key: 'cafe-day2',
          name: 'Café Kitsuné Palais Royal',
          nameLocal: 'string?',
          type: 'cafe|attraction|restaurant|transport|hotel',
          area: 'string?',
          description: 'string',
          ratingHint: 'string?',
          durationHint: 'string?',
        },
      ],
      days: [
        {
          day: 1,
          title: '抵达巴黎',
          theme: '落地 · 安顿',
          pace: '轻松|适中|乐园日|自驾日',
          summary: 'string',
          metroHintFromArea: { custom: 'string' },
          stops: [
            {
              time: 'HH:MM',
              placeKey: 'hotel-selected',
              note: 'string',
              transport: 'string?',
              walkLevel: '很少走|短步行|中等步行',
              duration: 'string?',
            },
          ],
        },
      ],
    },
  })

  const text = await generateText(system, user, { strict: true })
  if (!text) {
    throw new LlmRequestError('大模型没有返回行程。')
  }

  const parsed = extractJsonObject(text)
  if (!parsed) {
    throw new LlmRequestError('无法解析行程 JSON，请再试一次。')
  }

  const rawPlaces = Array.isArray(parsed.places) ? (parsed.places as unknown[]) : []
  const rawDays = Array.isArray(parsed.days) ? (parsed.days as unknown[]) : []
  if (!rawDays.length) {
    throw new LlmRequestError('行程天数为空，请再试一次。')
  }

  const places: FullItineraryPlaceDraft[] = []
  const seenKeys = new Set<string>()
  for (const item of rawPlaces) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const key = String(row.key || row.id || '').trim()
    const name = String(row.name || '').trim()
    if (!key || !name || seenKeys.has(key)) continue
    seenKeys.add(key)
    const typeRaw = String(row.type || 'attraction').toLowerCase()
    let type: PlaceTypeForItinerary = 'attraction'
    if (typeRaw.includes('cafe') || typeRaw.includes('coffee')) type = 'cafe'
    else if (typeRaw.includes('restaurant') || typeRaw.includes('food')) type = 'restaurant'
    else if (typeRaw.includes('hotel')) type = 'hotel'
    else if (typeRaw.includes('transport') || typeRaw.includes('airport')) type = 'transport'
    places.push({
      key,
      name,
      nameLocal: String(row.nameLocal || '').trim() || undefined,
      type,
      area: String(row.area || '').trim() || undefined,
      description: String(row.description || '').trim() || undefined,
      ratingHint: String(row.ratingHint || '').trim() || undefined,
      durationHint: String(row.durationHint || '').trim() || undefined,
    })
  }

  const days: FullItineraryDayDraft[] = []
  for (const item of rawDays) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const dayNum = Number(row.day)
    if (!Number.isFinite(dayNum) || dayNum < 1) continue
    const stopsRaw = Array.isArray(row.stops) ? (row.stops as unknown[]) : []
    const stops: FullItineraryStopDraft[] = []
    for (const s of stopsRaw) {
      if (!s || typeof s !== 'object') continue
      const stop = s as Record<string, unknown>
      const placeKey = String(stop.placeKey || stop.placeId || '').trim()
      if (!placeKey) continue
      const walk = String(stop.walkLevel || '').trim()
      stops.push({
        time: String(stop.time || '10:00').trim() || '10:00',
        placeKey,
        note: String(stop.note || '').trim() || '按当天节奏灵活调整。',
        transport: String(stop.transport || '').trim() || undefined,
        walkLevel:
          walk === '很少走' || walk === '短步行' || walk === '中等步行'
            ? walk
            : '短步行',
        duration: String(stop.duration || '').trim() || undefined,
      })
    }
    const paceRaw = String(row.pace || '适中').trim()
    let pace: FullItineraryDayDraft['pace'] = '适中'
    if (paceRaw === '轻松' || paceRaw === '适中' || paceRaw === '乐园日' || paceRaw === '自驾日') {
      pace = paceRaw
    } else if (/disney|迪士尼|乐园/i.test(paceRaw)) pace = '乐园日'
    else if (/自驾/i.test(paceRaw)) pace = '自驾日'
    else if (/轻松/i.test(paceRaw)) pace = '轻松'

    const metro =
      row.metroHintFromArea && typeof row.metroHintFromArea === 'object'
        ? (row.metroHintFromArea as Record<string, string>)
        : { custom: '按导航或地铁前往下一个地点。' }

    days.push({
      day: dayNum,
      title: String(row.title || `第 ${dayNum} 天`).trim().slice(0, 16),
      theme: String(row.theme || '').trim() || '巴黎日程',
      pace,
      summary: String(row.summary || '').trim() || '今天按地图与体力微调即可。',
      metroHintFromArea: metro,
      stops,
    })
  }

  if (!days.length) {
    throw new LlmRequestError('无法解析行程天数，请再试一次。')
  }

  return { days, places }
}

export interface OccupiedPlaceBrief {
  day: number
  name: string
  placeId?: string
  type?: string
}

export interface GenerateSingleDayItineraryInput {
  destination: string
  dayCount: number
  dayNumber: number
  calendarDate?: string
  tripStartDate: string
  tripEndDate: string
  itineraryStartDate: string
  nights?: number
  hotel: GenerateFullItineraryInput['hotel']
  outbound?: GenerateFullItineraryInput['outbound']
  returnFlight?: GenerateFullItineraryInput['returnFlight']
  /** Places already used on other days — avoid duplicates. */
  occupiedPlaces: OccupiedPlaceBrief[]
  preferences?: string
}

export interface SingleDayItineraryDraft {
  day: FullItineraryDayDraft
  places: FullItineraryPlaceDraft[]
}

function parseItineraryPlaces(rawPlaces: unknown[]): FullItineraryPlaceDraft[] {
  const places: FullItineraryPlaceDraft[] = []
  const seenKeys = new Set<string>()
  for (const item of rawPlaces) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const key = String(row.key || row.id || '').trim()
    const name = String(row.name || '').trim()
    if (!key || !name || seenKeys.has(key)) continue
    seenKeys.add(key)
    const typeRaw = String(row.type || 'attraction').toLowerCase()
    let type: PlaceTypeForItinerary = 'attraction'
    if (typeRaw.includes('cafe') || typeRaw.includes('coffee')) type = 'cafe'
    else if (typeRaw.includes('restaurant') || typeRaw.includes('food')) type = 'restaurant'
    else if (typeRaw.includes('hotel')) type = 'hotel'
    else if (typeRaw.includes('transport') || typeRaw.includes('airport')) type = 'transport'
    places.push({
      key,
      name,
      nameLocal: String(row.nameLocal || '').trim() || undefined,
      type,
      area: String(row.area || '').trim() || undefined,
      description: String(row.description || '').trim() || undefined,
      ratingHint: String(row.ratingHint || '').trim() || undefined,
      durationHint: String(row.durationHint || '').trim() || undefined,
    })
  }
  return places
}

function parseItineraryDay(row: Record<string, unknown>, fallbackDay: number): FullItineraryDayDraft | null {
  const dayNum = Number(row.day)
  const day = Number.isFinite(dayNum) && dayNum >= 1 ? dayNum : fallbackDay
  const stopsRaw = Array.isArray(row.stops) ? (row.stops as unknown[]) : []
  const stops: FullItineraryStopDraft[] = []
  for (const s of stopsRaw) {
    if (!s || typeof s !== 'object') continue
    const stop = s as Record<string, unknown>
    const placeKey = String(stop.placeKey || stop.placeId || '').trim()
    if (!placeKey) continue
    const walk = String(stop.walkLevel || '').trim()
    stops.push({
      time: String(stop.time || '10:00').trim() || '10:00',
      placeKey,
      note: String(stop.note || '').trim() || '按当天节奏灵活调整。',
      transport: String(stop.transport || '').trim() || undefined,
      walkLevel:
        walk === '很少走' || walk === '短步行' || walk === '中等步行'
          ? walk
          : '短步行',
      duration: String(stop.duration || '').trim() || undefined,
    })
  }
  if (!stops.length) return null

  const paceRaw = String(row.pace || '适中').trim()
  let pace: FullItineraryDayDraft['pace'] = '适中'
  if (paceRaw === '轻松' || paceRaw === '适中' || paceRaw === '乐园日' || paceRaw === '自驾日') {
    pace = paceRaw
  } else if (/disney|迪士尼|乐园/i.test(paceRaw)) pace = '乐园日'
  else if (/自驾/i.test(paceRaw)) pace = '自驾日'
  else if (/轻松/i.test(paceRaw)) pace = '轻松'

  const metro =
    row.metroHintFromArea && typeof row.metroHintFromArea === 'object'
      ? (row.metroHintFromArea as Record<string, string>)
      : { custom: '按导航或地铁前往下一个地点。' }

  return {
    day,
    title: String(row.title || `第 ${day} 天`).trim().slice(0, 16),
    theme: String(row.theme || '').trim() || '巴黎日程',
    pace,
    summary: String(row.summary || '').trim() || '今天按地图与体力微调即可。',
    metroHintFromArea: metro,
    stops,
  }
}

/**
 * Regenerate a single itinerary day with the same hard rules as full generation,
 * while avoiding places already used on other days.
 */
export async function generateSingleDayItinerary(
  input: GenerateSingleDayItineraryInput,
): Promise<SingleDayItineraryDraft> {
  if (!isLlmConfigured()) {
    throw new LlmRequestError('未配置 OpenAI API Key，无法生成行程。', 'missing_key')
  }

  const n = Math.max(1, Math.min(30, Math.floor(input.dayCount) || 1))
  const dayNumber = Math.max(1, Math.min(n, Math.floor(input.dayNumber) || 1))
  const disneyDay = n >= 3 ? n - 1 : null
  const isFirst = dayNumber === 1
  const isLast = dayNumber === n && n > 1
  const isDisney = disneyDay != null && dayNumber === disneyDay
  const hotelArea =
    input.hotel.area ||
    input.hotel.areaKey ||
    '巴黎市区'

  const roleRules: string[] = []
  if (isFirst) {
    roleRules.push(
      '今天是 Day 1 抵达日。第一站必须是酒店办理入住（placeKey 用 "hotel-selected"，type hotel）。轻行程、倒时差优先；不强制咖啡馆开场。',
      '若 Day 1 还有出门行程，则首站入住酒店 + 末站回酒店过夜（可两个 hotel-selected）。',
      'Day 1 餐饮：抵达办入住后若仍有空档，再安排午餐和/或晚餐；落地过晚可只安排晚餐。',
    )
  } else if (isLast) {
    roleRules.push(
      '今天是最后一天（返程日）：酒店仅作默认出发原点，不要把 hotel-selected 写入当天 stops（也不要末站回酒店）。完全由返程航班起飞时间倒推。',
      '国际航班预留 3–3.5 小时到 CDG（含交通）。若约 10:00 起床后时间紧张，可只安排机场一站（placeKey "attr-cdg"），不要硬塞景点；此时午餐/晚餐可省略。若上午仍有空档，可在去机场前安排一顿午餐或轻量咖啡馆（咖啡/甜点/brunch，非正餐 brasserie）。',
    )
  } else if (isDisney) {
    roleRules.push(
      `今天是倒数第二天（Day ${dayNumber}）巴黎迪士尼全日：pace=乐园日。出游站只允许一个 "attr-disney"（Disneyland Paris），不要咖啡馆、不要餐厅站、不要其他景点；园内用餐不必单独写站。末站回酒店过夜（"hotel-selected"）。即当天 stops 实质上只有：迪士尼 + 回酒店。`,
    )
  } else {
    roleRules.push(
      '中间日：早晨从酒店出发（酒店为原点，不必写在 stops 开头），末站必须回酒店过夜（placeKey "hotel-selected"，type hotel）。',
      '若当天安排了景点/餐饮，第一站（离开酒店后的第一站）必须是高分精品咖啡馆（type=cafe：咖啡/面包甜点/brunch 小店，真实可搜店名；不是正餐餐厅）。',
      '餐饮（硬规则）：必须安排午餐与晚餐两顿正餐（type=restaurant，约 12:00–14:00 与 19:00–21:00）。推荐高分、性价比高的真实可搜餐厅。正餐不得用 cafe 类型代替。',
      '若 occupiedElsewhere 尚未包含香榭丽舍/凯旋门，今天应优先安排 placeKey "attr-champs" 与 "attr-arc"（可同日、顺路）。',
    )
  }

  const occupiedNames = input.occupiedPlaces
    .map((p) => p.name?.trim())
    .filter(Boolean)
  const occupiedIds = input.occupiedPlaces
    .map((p) => p.placeId?.trim())
    .filter(Boolean)

  const system =
    '你是巴黎秋季旅行规划师。根据旅客的日期、航班与酒店，只重新规划指定的那一天行程。只输出 JSON，不要 markdown，不要解释。文案用简体中文，可带一点俏皮但不油腻。注意：cafe=咖啡馆（咖啡/面包甜点/brunch），不是法语里当餐厅用的 café。'

  const user = JSON.stringify({
    trip: {
      destination: input.destination || '巴黎',
      dayCount: n,
      nights: input.nights ?? Math.max(0, n - 1),
      tripStartDate: input.tripStartDate,
      tripEndDate: input.tripEndDate,
      itineraryStartDate: input.itineraryStartDate,
      preferences: input.preferences || null,
    },
    regenerate: {
      dayNumber,
      calendarDate: input.calendarDate || null,
      role: isFirst ? 'arrival' : isLast ? 'return' : isDisney ? 'disney' : 'mid',
    },
    hotel: {
      name: input.hotel.name,
      address: input.hotel.address,
      area: hotelArea,
      areaKey: input.hotel.areaKey || null,
      lat: input.hotel.lat,
      lng: input.hotel.lng,
      nearestMetro: input.hotel.nearestMetro || null,
    },
    outboundFlight: input.outbound || null,
    returnFlight: input.returnFlight || null,
    occupiedElsewhere: {
      names: occupiedNames,
      placeIds: occupiedIds,
      detail: input.occupiedPlaces.slice(0, 80),
    },
    hardRules: [
      `只输出 Day ${dayNumber} 这一天（day 字段必须为 ${dayNumber}），以及 places[] 中当天用到的非特殊地点。`,
      ...roleRules,
      CAFE_VS_RESTAURANT_RULE,
      '去重（硬规则）：不要使用 occupiedElsewhere 中已出现的景点/地标（同一正式名或同一 placeId）；当天内也不要重复。酒店 "hotel-selected"、机场 "attr-cdg" 除外；迪士尼日仅允许一个 "attr-disney"。',
      '每天行程开始约 10:00（自然醒）；不要安排 7–8 点观光（机场相关除外）。迪士尼日也尽量 10:00 左右出门。',
      '动线：同日景点尽量同片区聚类，控制步行（walkLevel 优先 很少走/短步行）；跨区用地铁，少换乘。',
      '文案一致（硬规则）：note 只写本站在做什么（氛围/吃什么/看点），不要写「乘X号线回酒店」「地铁去下一站」等离开本站的具体交通；回酒店/去下一站由时间线站点之间的 Google 导航展示。walkLevel 表示到达本站这一段的步行强度，须与 transport 一致：若 transport 含地铁/公交则 walkLevel 不要写短步行/很少走。',
      '不要安排卢浮宫或凡尔赛作为行程重点。',
      'places[] 列出所有非特殊地点：key 与 stops.placeKey 对应；name 必须是 Google Maps 可搜到的正式名；附 area（如 玛黑/16区）。',
      '特殊 placeKey 固定："hotel-selected"（酒店）、"attr-disney"（迪士尼）、"attr-cdg"（戴高乐机场）、"attr-champs"（香榭丽舍大街）、"attr-arc"（凯旋门）——这些可不必重复写在 places[]。',
      'metroHintFromArea 至少给 custom 一条中文地铁/交通提示。',
      'time 用 HH:MM；最后一天去机场可用「按航班倒推」。',
    ],
    format: {
      places: [
        {
          key: 'cafe-day',
          name: 'Café Kitsuné Palais Royal',
          nameLocal: 'string?',
          type: 'cafe|attraction|restaurant|transport|hotel',
          area: 'string?',
          description: 'string',
          ratingHint: 'string?',
          durationHint: 'string?',
        },
      ],
      day: {
        day: dayNumber,
        title: 'string',
        theme: 'string',
        pace: '轻松|适中|乐园日|自驾日',
        summary: 'string',
        metroHintFromArea: { custom: 'string' },
        stops: [
          {
            time: 'HH:MM',
            placeKey: 'string',
            note: 'string',
            transport: 'string?',
            walkLevel: '很少走|短步行|中等步行',
            duration: 'string?',
          },
        ],
      },
    },
  })

  const text = await generateText(system, user, { strict: true })
  if (!text) {
    throw new LlmRequestError('大模型没有返回单日行程。')
  }

  const parsed = extractJsonObject(text)
  if (!parsed) {
    throw new LlmRequestError('无法解析单日行程 JSON，请再试一次。')
  }

  const rawPlaces = Array.isArray(parsed.places) ? (parsed.places as unknown[]) : []
  const places = parseItineraryPlaces(rawPlaces)

  let dayRow: Record<string, unknown> | null = null
  if (parsed.day && typeof parsed.day === 'object' && !Array.isArray(parsed.day)) {
    dayRow = parsed.day as Record<string, unknown>
  } else if (Array.isArray(parsed.days) && parsed.days[0] && typeof parsed.days[0] === 'object') {
    dayRow = parsed.days[0] as Record<string, unknown>
  }
  if (!dayRow) {
    throw new LlmRequestError('单日行程为空，请再试一次。')
  }

  const day = parseItineraryDay(dayRow, dayNumber)
  if (!day) {
    throw new LlmRequestError('无法解析单日行程站点，请再试一次。')
  }

  return {
    day: { ...day, day: dayNumber },
    places,
  }
}
