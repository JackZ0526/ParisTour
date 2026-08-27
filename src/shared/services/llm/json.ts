/**
 * Lenient JSON extraction for LLM responses.
 *
 * Strips think-tags / ```json fences and extracts the first balanced {…}
 * object. Most business call sites use `extractLlmJsonObject` (the public
 * alias); the internal `extractJsonObject` is reused by a few helper paths.
 */

const PLACE_LIST_KEYS = [
  'recommendations',
  'places',
  'items',
  'results',
  'list',
  'data',
  'result',
  '推荐',
  '地点',
  '地点列表',
  '推荐列表',
  '结果',
]

function stripLlmJsonWrapper(text: string): string {
  return text
    .replace(/<think>[\s\S]*?(<\/think>|$)/gi, '')
    .replace(/<thought>[\s\S]*?(<\/thought>|$)/gi, '')
    .trim()
}

export function extractJsonObject(text: string): Record<string, unknown> | null {
  const stripped = stripLlmJsonWrapper(text)
  const fenced = stripped.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = (fenced?.[1] || stripped).trim()
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>
  } catch {
    return null
  }
}

export function extractLlmJsonObject(
  text: string,
): Record<string, unknown> | null {
  return extractJsonObject(text)
}

function asUnknownArray(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    try {
      const parsed = JSON.parse(trimmed) as unknown
      return Array.isArray(parsed) ? parsed : null
    } catch {
      return null
    }
  }
  return null
}

function looksLikePlaceRow(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  const name = String(
    row.name ?? row.名称 ?? row.店名 ?? row.地名 ?? row.placeName ?? '',
  ).trim()
  const id = String(
    row.googlePlaceId ?? row.placeId ?? row.place_id ?? '',
  ).trim()
  return Boolean(name || id)
}

function flattenTypeGroups(obj: Record<string, unknown>): unknown[] {
  const groups: Array<[string, string[]]> = [
    ['cafe', ['cafe', '咖啡馆', '咖啡']],
    ['attraction', ['attraction', '景点']],
    ['restaurant', ['restaurant', '餐厅', '餐馆']],
  ]
  const out: unknown[] = []
  for (const [type, keys] of groups) {
    for (const key of keys) {
      const rows = asUnknownArray(obj[key])
      if (!rows) continue
      for (const row of rows) {
        if (!row || typeof row !== 'object' || Array.isArray(row)) continue
        const record = row as Record<string, unknown>
        out.push({ ...record, type: record.type || type })
      }
    }
  }
  return out
}

function numericKeyedRows(obj: Record<string, unknown>): unknown[] | null {
  const keys = Object.keys(obj)
  if (!keys.length || keys.length > 24) return null
  if (!keys.every((key) => /^\d+$/.test(key))) return null
  const rows = keys
    .sort((a, b) => Number(a) - Number(b))
    .map((key) => obj[key])
  return rows.some(looksLikePlaceRow) ? rows : null
}

/**
 * Pull a place-row array out of common LLM JSON shapes: `{ recommendations }`,
 * Chinese aliases, `{ cafe, attraction, restaurant }`, a root array, or a
 * numeric-keyed object produced by json_object mode.
 */
export function extractPlaceRecommendationRows(
  value: unknown,
  depth = 0,
): unknown[] {
  if (depth > 3 || value == null) return []

  const direct = asUnknownArray(value)
  if (direct) {
    return direct.every((row) => row && typeof row === 'object') ? direct : []
  }
  if (typeof value !== 'object') return []

  const obj = value as Record<string, unknown>
  for (const key of PLACE_LIST_KEYS) {
    if (!(key in obj)) continue
    const nested = extractPlaceRecommendationRows(obj[key], depth + 1)
    if (nested.length) return nested
  }

  const grouped = flattenTypeGroups(obj)
  if (grouped.length) return grouped

  const numbered = numericKeyedRows(obj)
  if (numbered?.length) return numbered

  if (looksLikePlaceRow(obj)) return [obj]
  return []
}
