const PRICE_COPY: Record<number, string> = {
  0: '€0 · 白嫖快乐',
  1: '€ · 学生党续命',
  2: '€€ · 钱包暂安',
  3: '€€€ · 约会烧钱档',
  4: '€€€€ · 存款消失术',
}

function symbolCount(value: string): number {
  const runs = [...value.matchAll(/([$€£¥])\1{0,3}/g)]
  if (!runs.length) return 0
  return Math.min(4, Math.max(...runs.map((match) => match[0].length)))
}

/** Map Google `priceLevel` or Tripadvisor `$` / `€€€` text → display chip. */
export function formatPriceLevelLabel(priceLevel: string | undefined | null): string | null {
  if (!priceLevel) return null

  const raw = priceLevel.trim()
  if (!raw) return null

  if (/\d/.test(raw) && /[$€£¥]/.test(raw)) return raw

  const key = raw.toUpperCase().replace(/^PRICE_LEVEL_/, '')
  switch (key) {
    case 'FREE':
      return PRICE_COPY[0]
    case 'INEXPENSIVE':
      return PRICE_COPY[1]
    case 'MODERATE':
      return PRICE_COPY[2]
    case 'EXPENSIVE':
      return PRICE_COPY[3]
    case 'VERY_EXPENSIVE':
      return PRICE_COPY[4]
    default:
      break
  }

  const count = symbolCount(raw)
  if (count >= 1) return PRICE_COPY[count] || null
  return null
}
