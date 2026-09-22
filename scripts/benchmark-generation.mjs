/** Live, isolated service-level benchmark. No user trip state is read or written. */
import { createServer } from 'vite'
import { writeFile, readFile, mkdir } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'
const variant = process.env.BENCH_VARIANT || 'fast'
const scenario = process.env.BENCH_SCENARIO || 'recommend'
const locale = process.env.BENCH_LOCALE || 'zh-CN'
if (!['en', 'zh-CN'].includes(locale)) throw new Error('Unsupported benchmark locale')
const out = process.env.BENCH_OUT || '/tmp/paristour-generation-benchmark.json'
const fixture = process.env.BENCH_FIXTURE || '/tmp/paristour-generation-candidates.json'
process.env.VITE_GENERATION_VARIANT = variant
process.env.VITE_ENABLE_CLOUD_SYNC_ON_LOCAL = 'false'
const memoryStorage = () => {
  const entries = new Map()
  return { getItem: (k) => entries.get(k) ?? null, setItem: (k, v) => entries.set(k, String(v)), removeItem: (k) => entries.delete(k), clear: () => entries.clear(), key: (i) => [...entries.keys()][i] ?? null, get length() { return entries.size } }
}
globalThis.localStorage = memoryStorage()
globalThis.sessionStorage = memoryStorage()
globalThis.window = Object.assign(new EventTarget(), { location: { hostname: '127.0.0.1', origin: 'http://127.0.0.1:5186', search: '' }, localStorage, sessionStorage, setTimeout, clearTimeout, setInterval, clearInterval })
globalThis.document = Object.assign(new EventTarget(), { visibilityState: 'visible', documentElement: { lang: 'zh-CN', setAttribute() {} } })
const rawFetch = globalThis.fetch
// Explicit fault injection for resilience measurements, never enabled by application code.
const fault = process.env.BENCH_JEV_FAULT
if (fault && !['503', 'stall'].includes(fault)) throw new Error('Unsupported Jev fault')
const requests = []
globalThis.fetch = async (url, init) => {
  const path = typeof url === 'string' && url.startsWith('/') ? `http://127.0.0.1:5186${url}` : url
  const started = performance.now()
  const measurement = { path: new URL(String(path)).pathname }
  if (typeof init?.body === 'string' && measurement.path.endsWith('/chat/completions')) {
    try {
      const body = JSON.parse(init.body)
      if (body.messages?.some((m) => typeof m.content === 'string' && m.content.startsWith('Translate each supplied text into English for a decision model.'))) measurement.purpose = 'jev-english-normalization'
    } catch { /* Not a JSON chat request. */ }
  }
  if (measurement.path === '/api/jev') {
    const body = JSON.parse(init.body)
    const state = JSON.parse(body.state)
    measurement.jevKind = body.kind
    measurement.stateHasCJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(JSON.stringify(state))
    measurement.stateBytes = Buffer.byteLength(body.state)
    if (measurement.stateHasCJK) throw new Error('Jev received CJK decision data')
  }
  let response
  try {
    const ranking = String(path).includes('evaluation-model') && typeof init?.body === 'string' && JSON.parse(init.body).questions?.c0
    if (fault && ranking) {
      measurement.injectedFault = fault
      if (fault === 'stall') {
        await new Promise((_, reject) => {
          if (init.signal?.aborted) reject(init.signal.reason)
          else init.signal?.addEventListener('abort', () => reject(init.signal.reason), { once: true })
        })
      }
      response = Response.json({ error: { message: 'Synthetic provider unavailable', type: 'service_unavailable_error' } }, { status: 503 })
    } else response = await rawFetch(path, init)
  } catch (error) {
    requests.push({ ...measurement, status: 'network-error', errorName: error.name, headersMs: Math.round(performance.now() - started) })
    throw error
  }
  if (!response.ok && String(path).includes('evaluation-model')) {
    const data = await response.clone().json().catch(() => ({}))
    console.log('Evaluation failure:', JSON.stringify(data.error || data.message || { status: response.status }).slice(0, 500))
  }
  requests.push({ ...measurement, status: response.status, headersMs: Math.round(performance.now() - started) })
  return response
}
const server = await createServer({ server: { port: 5186, strictPort: true, host: '127.0.0.1', hmr: false }, logLevel: 'error' })
await server.listen()
const load = (path) => server.ssrLoadModule(`/src/${path}`)
const report = { variant, scenario, locale, faultInjection: fault || null, at: new Date().toISOString(), requests }
try {
  const { setLocale } = await load('shared/i18n/index.ts')
  setLocale(locale)
  const { DEFAULT_RECOMMENDATION_PREFERENCES: preferences } = await load('features/place/services/recommendationPreferences.ts')
  const generator = await load('features/itinerary/services/itineraryGenerate.ts')
  const { setOpenAIModel } = await load('shared/services/llm/model-state.ts')
  const { DEEPSEEK_MODEL_OPTIONS } = await load('config/llmModels.ts')
  setOpenAIModel(DEEPSEEK_MODEL_OPTIONS[0].id)
  const hotel = { id: 'benchmark-hotel', name: 'Hôtel Paris France', address: '72 Rue de Turbigo, 75003 Paris', areaKey: 'marais', lat: 48.8677, lng: 2.3604 }
  let candidates
  try { candidates = JSON.parse(await readFile(fixture, 'utf8')) } catch {
    candidates = await generator.getSharedItineraryCandidates(hotel)
    await writeFile(fixture, JSON.stringify(candidates, null, 2))
  }
  report.candidateCount = candidates.length
  report.candidateSource = 'same frozen real provider candidates; acquisition excluded from generation timing'
  requests.length = 0
  const started = performance.now()
  if (scenario === 'routing') {
    const { planTripChatRequest } = await load('features/chat/services/tripChat.ts')
    const ctx = { hotel: { ...hotel, nearestMetro: 'Temple', source: 'custom' }, hotelCandidates: [], days: [], currentDay: 2, customPlaces: {}, destination: 'Paris' }
    const cases = [
      { en: 'What is the name of my current hotel?', zh: '当前酒店叫什么名字？', intent: 'answer', needsWeb: false },
      { en: 'Move the Louvre from day two to day three.', zh: '把第二天的卢浮宫移到第三天。', intent: 'mutate', needsWeb: false },
      { en: 'Do not remove any existing stops. Recommend a cafe near the hotel.', zh: '不要删除现有地点，推荐一家酒店附近的咖啡馆。', intent: 'recommend', needsWeb: true },
    ]
    report.routing = []
    for (const item of cases) {
      for (const cache of ['cold', 'warm']) {
        const start = performance.now()
        const plan = await planTripChatRequest({ ctx, history: [], userMessage: locale === 'en' ? item.en : item.zh, signal: AbortSignal.timeout(60_000) })
        const passed = plan.intent === item.intent && plan.needsWeb === item.needsWeb
        report.routing.push({ request: locale === 'en' ? item.en : item.zh, cache, ms: Math.round(performance.now() - start), source: plan.source, intent: plan.intent, needsWeb: plan.needsWeb, passed })
        if (!passed) throw new Error('Routing intent or web decision differed from the explicit request')
      }
    }
  } else if (scenario === 'rank') {
    const { rankVerifiedCandidates } = await load('shared/services/llm/jev-ranking.ts')
    const ranked = await rankVerifiedCandidates(candidates.slice(0, Number(process.env.BENCH_RANK_LIMIT || 24)), { day: 2, title: '玛黑漫步', pace: 'relaxed', theme: '咖啡与街区', hotelArea: 'Marais', recommendationPreferences: preferences, currentPlaceNames: [], tripPlaceNames: [] })
    report.rankedCount = ranked?.length ?? 0
  } else if (scenario === 'recommend') {
    const { recommendPlacesForDay } = await load('shared/services/llm/business/place.ts')
    const { RankedRecommendationQueue } = await load('features/place/services/rankedRecommendations.ts')
    const pool = candidates.filter((c) => c.type === 'cafe')
    const context = { day: 2, title: locale === 'en' ? 'Marais stroll' : '玛黑漫步', pace: 'relaxed', theme: locale === 'en' ? 'Coffee and neighborhoods' : '咖啡与街区', hotelArea: 'Marais', recommendationPreferences: preferences, currentPlaceNames: [], tripPlaceNames: [] }
    const queue = new RankedRecommendationQueue()
    let excluded = []
    report.batches = []
    for (let batch = 1; batch <= 3; batch++) {
      const start = performance.now()
      let first = null
      let result
      let fallback = false
      if (variant === 'fast') {
        result = await queue.take({ key: `benchmark-cafe-${locale}`, context, excludeNames: excluded, count: 4, locale, load: async () => pool })
        first = performance.now() - start
        fallback = !result
        if (fallback) first = null
      }
      if (!result) {
        result = await recommendPlacesForDay({ ...context, batch, types: ['cafe'], countPerType: 4, excludeNames: excluded, verifiedCandidates: pool, onProgress: (rows) => { if (rows.length && first == null) first = performance.now() - start } })
      }
      const quality = { knownCandidates: result.every((row) => pool.some((c) => c.name === row.name)), noRepeatedNames: result.every((row) => !excluded.includes(row.name)) && new Set(result.map((row) => row.name)).size === result.length, englishCopyClean: locale !== 'en' || result.every((row) => !/\p{Script=Han}/u.test(`${row.reason} ${row.intro}`)) }
      report.batches.push({ batch, firstUsableMs: Math.round(first ?? performance.now() - start), completeMs: Math.round(performance.now() - start), names: result.map((row) => row.name), count: result.length, fallback, quality })
      if (result.length !== 4 || Object.values(quality).some((ok) => !ok)) throw new Error('Recommendation quality validation failed')
      excluded.push(...result.map((row) => row.name))
    }
    queue.clear()
  } else {
    const { samePlace } = await load('shared/utils/placeIdentity.ts')
    let days = [], customPlaces = {}
    const enrichment = []
    report.days = []
    const dayCount = scenario === 'all' ? 5 : 3
    const generate = async (dayNumber) => {
      const start = performance.now()
      const occupiedPlaces = days.flatMap((d) => d.stops.map((s) => ({ ...customPlaces[s.placeId], day: d.day, name: customPlaces[s.placeId]?.name || '', placeId: s.placeId })))
      const result = await generator.buildGeneratedSingleDay({ fast: variant === 'fast', destination: 'Paris', dayCount, dayNumber, calendarDate: `2026-10-${11 + dayNumber}`, tripStartDate: '2026-10-12', tripEndDate: `2026-10-${11 + dayCount}`, itineraryStartDate: '2026-10-12', hotel, existingDays: days, existingCustomPlaces: customPlaces, occupiedPlaces, recommendationPreferences: preferences, verifiedCandidates: candidates, signal: AbortSignal.timeout(135_000) })
      return { result, dayNumber, start }
    }
    const publish = ({ result, dayNumber, start }) => {
      const day = result.days.find((d) => d.day === dayNumber)
      days = [...days.filter((d) => d.day !== dayNumber), day]
      customPlaces = { ...customPlaces, ...result.customPlaces }
      report.days.push({ day: dayNumber, usableMs: Math.round(performance.now() - started), taskMs: Math.round(performance.now() - start), title: day.title, theme: day.theme, summary: day.summary, stops: day.stops.map((s) => ({ time: s.time, note: s.note, duration: s.duration, name: customPlaces[s.placeId]?.name || s.placeId, placeId: s.placeId })) })
      if (result.enrich) enrichment.push(result.enrich().catch(() => { report.enrichmentFailed = true }))
    }
    if (scenario === 'day') publish(await generate(2))
    else {
      publish(await generate(1))
      if (variant === 'fast') {
        const { runConflictSafePool } = await load('shared/services/asyncPool.ts')
        await runConflictSafePool([2, 3, 4], 2, generate, ({ result, dayNumber }) => {
          const day = result.days.find((d) => d.day === dayNumber)
          return day.stops.some((stop) => result.customPlaces[stop.placeId]?.type === 'attraction' && days.some((other) => other.stops.some((s) => s.placeId === stop.placeId || (customPlaces[s.placeId] && samePlace(customPlaces[s.placeId], result.customPlaces[stop.placeId])))))
        }, publish)
      } else {
        for (const group of [[2, 3], [4]]) {
          const results = await Promise.all(group.map(generate))
          results.forEach(publish)
        }
      }
      publish(await generate(5))
    }
    report.routeReadyMs = Math.round(performance.now() - started)
    const { getPlace } = await load('features/place/constants/places.ts')
    const attractions = days.flatMap((day) => day.stops.filter((stop) => stop.placeId !== 'hotel-selected').map((stop) => getPlace(stop.placeId, customPlaces)).filter((p) => p.type === 'attraction').map((p) => p.googlePlaceId || p.name))
    report.quality = {
      correctDayCount: days.length === (scenario === 'day' ? 1 : dayCount),
      noRepeatedAttractions: new Set(attractions).size === attractions.length,
      hotelReturns: days.filter((d) => d.day < dayCount).every((d) => d.stops.at(-1)?.placeId === 'hotel-selected'),
      arrivalCheckIn: scenario !== 'all' || days.find((d) => d.day === 1)?.stops[0]?.placeId === 'hotel-selected',
      departureAirport: scenario !== 'all' || days.find((d) => d.day === dayCount)?.stops.some((s) => s.placeId === 'attr-cdg'),
      englishCopyClean: locale !== 'en' || days.every((d) => !/\p{Script=Han}/u.test(JSON.stringify({ title: d.title, theme: d.theme, summary: d.summary, stops: d.stops.map((s) => ({ note: s.note, duration: s.duration, time: s.time })) }))),
    }
    await Promise.all(enrichment)
    if (Object.entries(report.quality).some(([key, ok]) => !ok && !(variant === 'baseline' && key === 'noRepeatedAttractions'))) throw new Error('Itinerary quality validation failed')
  }
  report.totalMs = Math.round(performance.now() - started)
  const { getGenerationTimings } = await load('shared/services/generationPerformance.ts')
  report.timings = getGenerationTimings()
} catch (error) {
  report.error = String(error?.message || error).slice(0, 600)
  process.exitCode = 1
} finally {
  await mkdir(new URL('../docs/benchmarks/', import.meta.url), { recursive: true })
  await writeFile(out, JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ variant, scenario, error: report.error, totalMs: report.totalMs, routeReadyMs: report.routeReadyMs, batches: report.batches?.map(({batch,completeMs,count})=>({batch,completeMs,count})), out }))
  await server.close()
}
