import { readFile } from 'node:fs/promises'

const llm = await readFile(new URL('../src/services/llm.ts', import.meta.url), 'utf8')
const chat = await readFile(new URL('../src/services/tripChat.ts', import.meta.url), 'utf8')
const preferences = await readFile(
  new URL('../src/services/recommendationPreferences.ts', import.meta.url),
  'utf8',
)

const failures = []
const requireText = (source, value, label) => {
  if (!source.includes(value)) failures.push(`missing: ${label}`)
}
const forbidText = (source, value, label) => {
  if (source.includes(value)) failures.push(`forbidden: ${label}`)
}

requireText(llm, "response_format = { type: 'json_object' }", 'JSON response format')
requireText(llm, 'verifiedCandidates', 'verified recommendation candidates')
requireText(llm, 'recommendationPreferences', 'structured recommendation preferences')
requireText(chat, "intent: 'answer' | 'recommend' | 'mutate'", 'chat intent routing')
requireText(chat, '<app_state_data>', 'application-state data boundary')
requireText(chat, '<untrusted_research_data>', 'research prompt-injection boundary')
requireText(preferences, 'DEFAULT_RECOMMENDATION_PREFERENCES', 'editable defaults')
forbidText(llm, 'AF375 类班次合理推断', 'model-inferred flight arrival')
forbidText(chat, '${dayRange}?', 'invalid pseudo-JSON optional day')

if (failures.length) {
  console.error(`Prompt contract check failed:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}

console.log('Prompt contract check passed.')
