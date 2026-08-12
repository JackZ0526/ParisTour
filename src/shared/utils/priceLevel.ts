/** Map provider price-level enums to display chip text (`€€ · 钱包暂安`). */
export function formatPriceLevelLabel(priceLevel: string | undefined | null): string | null {
  if (!priceLevel) return null

  const key = priceLevel
    .trim()
    .toUpperCase()
    .replace(/^PRICE_LEVEL_/, '')

  switch (key) {
    case 'FREE':
      return '€0 · 白嫖快乐'
    case 'INEXPENSIVE':
      return '€ · 学生党续命'
    case 'MODERATE':
      return '€€ · 钱包暂安'
    case 'EXPENSIVE':
      return '€€€ · 约会烧钱档'
    case 'VERY_EXPENSIVE':
      return '€€€€ · 存款消失术'
    default:
      return null
  }
}
