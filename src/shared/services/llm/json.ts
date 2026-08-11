/**
 * Lenient JSON extraction for LLM responses.
 *
 * Strips ```json fences and extracts the first balanced {…} object. Most
 * business call sites use `extractLlmJsonObject` (the public alias);
 * the internal `extractJsonObject` is reused by a few helper paths.
 */

export function extractJsonObject(text: string): Record<string, unknown> | null {
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

export function extractLlmJsonObject(
  text: string,
): Record<string, unknown> | null {
  return extractJsonObject(text)
}
