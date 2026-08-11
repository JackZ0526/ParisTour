function hasCjk(text: string) {
  return /[\u3400-\u9fff]/.test(text)
}

function labelsEqual(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

function trimLabel(s?: string) {
  return (s || '').trim()
}

function normalizeLabel(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Token / substring similarity for place names (0–1).
 * Used to reject Google payloads whose Latin title doesn't match the itinerary label
 * (e.g. Chez Paul vs Jardins du Trocadéro).
 */
export function nameSimilarity(query: string, displayName: string): number {
  const q = normalizeLabel(query.replace(/\bparis\b/gi, '').trim())
  const n = normalizeLabel(displayName)
  if (!q || !n) return 0
  if (q === n) return 1
  if (n.includes(q) || q.includes(n)) return 0.85
  const qTokens = new Set(q.split(' ').filter((t) => t.length > 1))
  const nTokens = new Set(n.split(' ').filter((t) => t.length > 1))
  if (!qTokens.size || !nTokens.size) return 0
  let overlap = 0
  for (const t of qTokens) if (nTokens.has(t)) overlap += 1
  return overlap / Math.max(qTokens.size, nTokens.size)
}

/**
 * Known cross-script aliases for landmarks whose Chinese and local names have
 * no useful token overlap. Keep this deliberately small: it only relaxes the
 * identity check for well-known, unambiguous Paris landmarks.
 */
const PLACE_ALIAS_GROUPS: string[][] = [
  ['埃菲尔铁塔', '艾菲尔铁塔', 'Tour Eiffel', 'Eiffel Tower'],
  ['凯旋门', 'Arc de Triomphe'],
  ['卢浮宫', 'Musée du Louvre', 'Musee du Louvre', 'Louvre Museum'],
  ['巴黎圣母院', 'Cathédrale Notre-Dame de Paris', 'Notre-Dame de Paris'],
  ['奥赛博物馆', "Musée d'Orsay", "Musee d'Orsay", 'Orsay Museum'],
  ['圣心堂', 'Basilique du Sacré-Cœur', 'Sacre Coeur Basilica'],
]

function aliasGroupFor(label: string): string[] | undefined {
  const normalized = normalizeLabel(label.replace(/\bparis\b/gi, '').trim())
  return PLACE_ALIAS_GROUPS.find((items) =>
    items.some((item) => {
      const alias = normalizeLabel(item)
      return normalized === alias || normalized.includes(alias) || alias.includes(normalized)
    }),
  )
}

function aliasCandidates(label: string): string[] {
  const group = aliasGroupFor(label)
  return group ? [label, ...group] : [label]
}

/** Alias-aware similarity used when proving two localized titles are one place. */
export function placeIdentitySimilarity(query: string, displayName: string): number {
  const group = aliasGroupFor(query)
  const display = normalizeLabel(displayName)
  // These are nearby places that contain the landmark name but are not the
  // landmark itself. Reject them before substring similarity can bless them.
  if (group === PLACE_ALIAS_GROUPS[0] && /\b(jardin|garden|parc|champ de mars)\b/.test(display)) {
    return 0
  }
  if (group === PLACE_ALIAS_GROUPS[1] && /\bcarrousel\b/.test(display)) {
    return 0
  }

  let best = nameSimilarity(query, displayName)
  for (const alias of aliasCandidates(query)) {
    best = Math.max(best, nameSimilarity(alias, displayName))
  }
  return best
}

/** Minimum similarity before treating Google details as the same place. */
export const PLACE_NAME_MATCH_MIN = 0.35

/**
 * True when Google's Latin/original identity aligns with the itinerary place label.
 * Without a Latin Google name, refuse Google CJK (avoids nearby-landmark zh bleed).
 */
export function googleIdentityMatchesPlace(
  placeOriginal: string,
  googleOriginal?: string,
  googleName?: string,
): boolean {
  const place = trimLabel(placeOriginal)
  if (!place) return false
  const identity =
    [googleOriginal, googleName].map(trimLabel).find((s) => s && !hasCjk(s)) ||
    ''
  if (!identity) return false
  return placeIdentitySimilarity(place, identity) >= PLACE_NAME_MATCH_MIN
}

export type PlaceChineseOptions = {
  /**
   * When true, ignore CJK in `name` / `nameLocal` (e.g. recommend LLM labels).
   * Official Chinese then comes only from Google or `llmZh`.
   */
  excludePropCjk?: boolean
}

export type PlaceTitleLines = {
  title: string
  subtitle?: string
  /** True when `title` came from an LLM translation, not an official/Google Chinese name. */
  titleIsLlmTranslated?: boolean
}

/**
 * Shared bilingual place naming: Chinese primary + original/local subtitle when different.
 * Optional `llmZh` fills in when no official Chinese name exists.
 * Prefers Google zh displayName over prop CJK only when Google identity matches the place.
 */
export function placeTitleLines(
  name: string,
  nameLocal?: string,
  googleName?: string,
  googleOriginal?: string,
  llmZh?: string,
  options?: PlaceChineseOptions,
): PlaceTitleLines {
  const propCandidates = options?.excludePropCjk
    ? []
    : [name, nameLocal].map(trimLabel).filter(Boolean)
  const googleTrusted = googleIdentityMatchesPlace(
    placeOriginalLabel(name, nameLocal),
    googleOriginal,
    googleName,
  )
  const googleCandidates = googleTrusted
    ? [googleName, googleOriginal].map(trimLabel).filter(Boolean)
    : []
  const candidates = [...propCandidates, ...googleCandidates]

  const officialZh =
    googleCandidates.find((s) => hasCjk(s)) ||
    propCandidates.find((s) => hasCjk(s))
  const original =
    [...propCandidates, ...googleCandidates].find((s) => !hasCjk(s)) ||
    candidates.find((s) => officialZh && !labelsEqual(s, officialZh))

  const llm = trimLabel(llmZh)
  if (!officialZh && llm && hasCjk(llm)) {
    const subtitle =
      (original && !labelsEqual(original, llm) ? original : undefined) ||
      candidates.find((s) => !labelsEqual(s, llm))
    return subtitle
      ? { title: llm, subtitle, titleIsLlmTranslated: true }
      : { title: llm, titleIsLlmTranslated: true }
  }

  const title = officialZh || candidates[0] || '地点详情'
  const subtitle =
    [...propCandidates, ...googleCandidates].find(
      (s) => !labelsEqual(s, title) && !hasCjk(s),
    ) || candidates.find((s) => !labelsEqual(s, title))

  return subtitle ? { title, subtitle } : { title }
}

/** Prefer original / non-Chinese label (itinerary list, map markers). */
export function placeOriginalLabel(
  name: string,
  nameLocal?: string,
  googleName?: string,
  googleOriginal?: string,
): string {
  const candidates = [nameLocal, name, googleOriginal, googleName]
    .map(trimLabel)
    .filter(Boolean)

  return (
    candidates.find((s) => !hasCjk(s)) ||
    candidates[0] ||
    '地点'
  )
}

/**
 * Prefer official Chinese: Google zh displayName → prop CJK (catalog) → LLM zh.
 * Google zh is only used when the matched place's Latin/original name aligns with
 * the itinerary label (rejects nearby gardens/landmarks from locationBias).
 * Does not return a value identical to the original/non-Chinese label.
 */
export function placeChineseLabel(
  name: string,
  nameLocal?: string,
  googleName?: string,
  googleOriginal?: string,
  llmZh?: string,
  options?: PlaceChineseOptions,
): { zh?: string; isLlmTranslated?: boolean } {
  const propCandidates = options?.excludePropCjk
    ? []
    : [name, nameLocal].map(trimLabel).filter(Boolean)
  const placeOriginal =
    propCandidates.find((s) => !hasCjk(s)) ||
    placeOriginalLabel(name, nameLocal)
  const googleTrusted = googleIdentityMatchesPlace(
    placeOriginal,
    googleOriginal,
    googleName,
  )
  const googleCandidates = googleTrusted
    ? [googleName, googleOriginal].map(trimLabel).filter(Boolean)
    : []
  const all = [...propCandidates, ...googleCandidates]

  const original = all.find((s) => !hasCjk(s)) || all[0]

  const googleZh = googleCandidates.find((s) => hasCjk(s))
  if (googleZh && !(original && labelsEqual(googleZh, original))) {
    return { zh: googleZh }
  }

  const propZh = propCandidates.find((s) => hasCjk(s))
  if (propZh && !(original && labelsEqual(propZh, original))) {
    return { zh: propZh }
  }

  const llm = trimLabel(llmZh)
  if (llm && hasCjk(llm) && !(original && labelsEqual(llm, original))) {
    return { zh: llm, isLlmTranslated: true }
  }

  return {}
}

/** Single-line bilingual label for compact chips. */
export function formatPlaceLabel(
  name: string,
  nameLocal?: string,
  googleName?: string,
  googleOriginal?: string,
  llmZh?: string,
  options?: PlaceChineseOptions,
): string {
  const { title, subtitle } = placeTitleLines(
    name,
    nameLocal,
    googleName,
    googleOriginal,
    llmZh,
    options,
  )
  return subtitle ? `${title} · ${subtitle}` : title
}
