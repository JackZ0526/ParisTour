const MAX_PHOTOS = 8
const MIN_PHOTO_WIDTH = 400
const INSTAGRAM_HOSTS = new Set([
  'instagram.com',
  'www.instagram.com',
  'm.instagram.com',
  'instagr.am',
  'www.instagr.am',
])

export function instagramHandleFromUrl(value: string): string | null {
  try {
    const url = new URL(value)
    if (!INSTAGRAM_HOSTS.has(url.hostname.toLowerCase())) return null
    const part = url.pathname.split('/').filter(Boolean)[0]
    if (!part || part.startsWith('p') && part.length === 1) return null
    if (['p', 'reel', 'reels', 'stories', 'explore', 'accounts'].includes(part.toLowerCase())) {
      return null
    }
    return part.replace(/^@/, '')
  } catch {
    return null
  }
}

export function isInstagramUrl(value: string): boolean {
  try {
    return INSTAGRAM_HOSTS.has(new URL(value).hostname.toLowerCase())
  } catch {
    return false
  }
}

export function isPublicHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') return false
    const host = url.hostname.toLowerCase()
    if (
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      host.endsWith('.internal') ||
      host.endsWith('.local')
    ) {
      return false
    }
    if (host === '0.0.0.0' || host === '127.0.0.1' || host === '::1') return false
    if (host.includes(':')) return false
    const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
    if (ipv4) {
      const a = Number(ipv4[1])
      const b = Number(ipv4[2])
      if (a === 10 || a === 127 || a === 0) return false
      if (a === 169 && b === 254) return false
      if (a === 172 && b >= 16 && b <= 31) return false
      if (a === 192 && b === 168) return false
      return false
    }
    return Boolean(host.includes('.'))
  } catch {
    return false
  }
}

export function toPublicHttpsUrl(value: string): string | null {
  try {
    const url = new URL(value.trim())
    if (url.protocol === 'http:') url.protocol = 'https:'
    if (!isPublicHttpsUrl(url.toString())) return null
    return url.toString()
  } catch {
    return null
  }
}

const DIRECTORY_OR_SOCIAL_HOSTS = [
  'instagram.com',
  'instagr.am',
  'facebook.com',
  'fb.com',
  'twitter.com',
  'x.com',
  'tiktok.com',
  'tripadvisor.com',
  'tripadvisor.fr',
  'yelp.com',
  'yelp.fr',
  'thefork.com',
  'lafourchette.com',
  'opentable.com',
  'opentable.fr',
  'booking.com',
  'hotels.com',
  'google.com',
  'google.fr',
  'goo.gl',
  'wikipedia.org',
  'wikimedia.org',
]

function hostMatches(host: string, suffix: string): boolean {
  const h = host.toLowerCase()
  const s = suffix.toLowerCase()
  return h === s || h.endsWith(`.${s}`)
}

/** Google often stores Instagram / Maps / Tripadvisor as `websiteUri`. */
export function isDirectoryOrSocialUrl(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase()
    return DIRECTORY_OR_SOCIAL_HOSTS.some((suffix) => hostMatches(host, suffix))
  } catch {
    return false
  }
}

/** Keep a first-party https site; drop social, directories, and junk punctuation. */
export function officialWebsiteFromCandidate(value: string): string | null {
  const trimmed = value.trim().replace(/[),.;]+$/g, '')
  const safe = toPublicHttpsUrl(trimmed)
  if (!safe || isInstagramUrl(safe) || isDirectoryOrSocialUrl(safe)) return null
  try {
    const url = new URL(safe)
    url.hash = ''
    url.search = ''
    if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/+$/, '') || '/'
    return url.toString()
  } catch {
    return null
  }
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
}

function absUrl(value: string, base: string): string | null {
  try {
    const url = new URL(decodeHtmlEntities(value.trim()), base)
    if (url.protocol === 'http:') url.protocol = 'https:'
    if (url.protocol !== 'https:') return null
    if (url.pathname.endsWith('.svg') || url.pathname.endsWith('.js')) return null
    return url.toString()
  } catch {
    return null
  }
}

const IMAGE_EXT = '(?:jpe?g|webp|png)'
const IMAGE_EXT_WITH_WEBP = `${IMAGE_EXT}(?:\\.webp)?`

/** WordPress and CDNs emit the same photo as `-1024x683.jpg.webp`, `-scaled.jpg`, etc. */
function stripResizedFilename(pathname: string): string {
  return pathname
    .replace(new RegExp(`-(\\d{2,5})x(\\d{2,5})(?=\\.${IMAGE_EXT_WITH_WEBP}$)`, 'i'), '')
    .replace(new RegExp(`-scaled(?=\\.${IMAGE_EXT_WITH_WEBP}$)`, 'i'), '')
    .replace(/\.(jpe?g|png|gif)\.webp$/i, '.$1')
}

function stripCropSizeFilename(pathname: string): string {
  return pathname.replace(
    new RegExp(
      `-(\\d{2,4})-(\\d{2,4})-(?:crop|exact|landscape|auto)(?=\\.${IMAGE_EXT_WITH_WEBP}$)`,
      'i',
    ),
    '',
  )
}

/** Collapse resize/CDN variants of the same file to one original https URL. */
function canonicalizePhotoUrl(url: string): string {
  try {
    let parsed = new URL(decodeHtmlEntities(url))
    if (parsed.protocol === 'http:') parsed.protocol = 'https:'
    const cut = parsed.pathname.indexOf('/:/')
    if (cut !== -1) parsed.pathname = parsed.pathname.slice(0, cut)

    if (/^i\d+\.wp\.com$/i.test(parsed.hostname)) {
      const parts = parsed.pathname.split('/').filter(Boolean)
      if (parts.length >= 2 && parts[0].includes('.')) {
        parsed = new URL(`https://${parts[0]}/${parts.slice(1).join('/')}`)
      }
    }

    parsed.hash = ''
    parsed.pathname = stripResizedFilename(parsed.pathname)
    for (const key of [
      'resize',
      'w',
      'h',
      'fit',
      'crop',
      'ssl',
      'quality',
      'zoom',
      'strip',
      'format',
    ]) {
      parsed.searchParams.delete(key)
    }
    return parsed.toString()
  } catch {
    return url
  }
}

/** If a Google websiteUri 404s on a stale path, retry the site origin. */
export function homepageFallbackUrl(current: string): string | null {
  try {
    const url = new URL(current)
    if (url.pathname === '/' || url.pathname === '') return null
    url.pathname = '/'
    url.search = ''
    url.hash = ''
    return toPublicHttpsUrl(url.toString())
  } catch {
    return null
  }
}

function splitSrcset(value: string): string[] {
  return value
    .split(',')
    .map((part) => part.trim().split(/\s+/)[0])
    .filter(Boolean)
}

function looksLikeImageUrl(value: string): boolean {
  return /\.(?:jpe?g|webp|png)(?:$|[/?#])/i.test(value)
}

/** Hotel-builder filenames often encode size as `-1200-627-crop`. Drop logos/thumbs. */
export function photoDimensionsFromUrl(url: string): { width: number; height: number } {
  const crop = url.match(/-(\d{2,4})-(\d{2,4})-(?:crop|exact|landscape|auto)/i)
  if (crop) return { width: Number(crop[1]), height: Number(crop[2]) }
  const wp = url.match(/-(\d{2,5})x(\d{2,5})(?=\.(?:jpe?g|webp|png))/i)
  if (wp) return { width: Number(wp[1]), height: Number(wp[2]) }
  const resize =
    url.match(/[?&]resize=(\d+)%2C(\d+)/i) || url.match(/[?&]resize=(\d+),(\d+)/i)
  if (resize) return { width: Number(resize[1]), height: Number(resize[2]) }
  const width = Number(url.match(/[?&]w=(\d+)/i)?.[1] || 0)
  const height = Number(url.match(/[?&]h=(\d+)/i)?.[1] || 0)
  if (width || height) return { width, height }
  const godaddy = url.match(/\/rs=(?:w|h):(\d+)/i)
  if (godaddy) {
    const size = Number(godaddy[1])
    return { width: size, height: size }
  }
  return { width: 0, height: 0 }
}

function isTinyPhoto(url: string, width = 0): boolean {
  if (width > 0 && width < MIN_PHOTO_WIDTH) return true
  const crop = url.match(/-(\d{2,4})-(\d{2,4})-(?:crop|exact|landscape|auto)/i)
  if (crop) return Math.max(Number(crop[1]), Number(crop[2])) < MIN_PHOTO_WIDTH
  const godaddy = url.match(/\/rs=(?:w|h):(\d+)/i)
  if (godaddy) return Number(godaddy[1]) < 200
  return false
}

function isLogoPhoto(url: string): boolean {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.toLowerCase()
    const path = parsed.pathname.toLowerCase()
    if (path.includes('/_si/') || path === '/_si') return true
    if (host === 's0.wp.com' || host === 's1.wp.com' || host === 's2.wp.com') return true
    if (path.includes('/wp-content/plugins/') || path.includes('/wp-includes/')) return true
    if (
      /(?:^|\/)(?:logo|favicon|icon|webclip|site-icon|custom-logo|apple-touch-icon)[^/]*$/i.test(
        path,
      )
    ) {
      return true
    }
    if (/blob-[a-f0-9]+\.png$/i.test(path) || /\/logo[-_.]/i.test(path)) return true
    return false
  } catch {
    return false
  }
}

const JUNK_NAME =
  /\b(logo|favicon|icon|webclip|avatar|headshot|portrait|wordmark|badge|sprite|branding)\b/i
const PEOPLE_ALT =
  /\b(team|staff|owner|chef|equipe|équipe|fondateur|founder|portrait|headshot|avatar)\b/i

export function isJunkWebsitePhoto(
  url: string,
  alt = '',
  className = '',
): boolean {
  if (isLogoPhoto(url)) return true
  const blob = `${url} ${alt} ${className}`
  if (JUNK_NAME.test(blob)) return true
  if (PEOPLE_ALT.test(alt) || PEOPLE_ALT.test(className)) return true
  if (/\/(?:team|staff|about|bio|people|portraits?|chefs?)\//i.test(url)) return true
  return false
}

export interface WebsitePhotoCandidate {
  url: string
  maxWidth: number
  maxHeight: number
  identity: string
  pinned?: boolean
}

function websitePhotoIdentity(url: string): string {
  try {
    const path = stripCropSizeFilename(new URL(url).pathname.toLowerCase())
    return path.replace(new RegExp(`\\.${IMAGE_EXT}$`, 'i'), '')
  } catch {
    return url.split('?')[0] || url
  }
}

function websitePhotoScore(candidate: WebsitePhotoCandidate): number {
  const area = candidate.maxWidth * Math.max(candidate.maxHeight, candidate.maxWidth)
  let score = area
  if (candidate.maxWidth >= 1600) score += 2_000_000
  else if (candidate.maxWidth >= 1200) score += 1_000_000
  else if (candidate.maxWidth >= 800) score += 250_000
  if (candidate.pinned) score += 500_000
  return score
}

function isLandscapeWebsitePhoto(candidate: WebsitePhotoCandidate): boolean {
  if (candidate.maxHeight <= 0) return true
  return candidate.maxWidth >= candidate.maxHeight
}

function compareWebsitePhotos(a: WebsitePhotoCandidate, b: WebsitePhotoCandidate): number {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
  const aLandscape = isLandscapeWebsitePhoto(a)
  const bLandscape = isLandscapeWebsitePhoto(b)
  if (aLandscape !== bLandscape) return aLandscape ? -1 : 1
  return websitePhotoScore(b) - websitePhotoScore(a) || b.maxWidth - a.maxWidth
}

export function selectBestWebsitePhotos(
  candidates: WebsitePhotoCandidate[],
  limit = MAX_PHOTOS,
): string[] {
  const bestByIdentity = new Map<string, WebsitePhotoCandidate>()
  for (const candidate of candidates) {
    if (!candidate.url) continue
    if (candidate.maxWidth > 0 && candidate.maxWidth < MIN_PHOTO_WIDTH) continue
    const current = bestByIdentity.get(candidate.identity)
    if (!current || compareWebsitePhotos(candidate, current) < 0) {
      bestByIdentity.set(candidate.identity, candidate)
    }
  }
  return [...bestByIdentity.values()]
    .sort(compareWebsitePhotos)
    .slice(0, limit)
    .map((candidate) => candidate.url)
}

function metaContents(html: string, key: string): string[] {
  const out: string[] = []
  const propertyFirst = new RegExp(
    `<meta\\b[^>]*\\b(?:property|name)=["']${key}["'][^>]*\\bcontent=["']([^"']+)["'][^>]*>`,
    'gi',
  )
  const contentFirst = new RegExp(
    `<meta\\b[^>]*\\bcontent=["']([^"']+)["'][^>]*\\b(?:property|name)=["']${key}["'][^>]*>`,
    'gi',
  )
  for (const re of [propertyFirst, contentFirst]) {
    let match: RegExpExecArray | null
    while ((match = re.exec(html))) {
      if (match[1]) out.push(match[1])
    }
  }
  return out
}

function collectJsonLdImages(value: unknown, out: string[]) {
  if (!value) return
  if (typeof value === 'string') {
    out.push(value)
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) collectJsonLdImages(item, out)
    return
  }
  if (typeof value !== 'object') return
  const record = value as Record<string, unknown>
  if (record.image) collectJsonLdImages(record.image, out)
  if (record.thumbnailUrl) collectJsonLdImages(record.thumbnailUrl, out)
  if (record.photo) collectJsonLdImages(record.photo, out)
  if (record.url && record['@type'] && /image/i.test(String(record['@type']))) {
    collectJsonLdImages(record.url, out)
  }
  if (record['@graph']) collectJsonLdImages(record['@graph'], out)
}

function tagAttr(tag: string, name: string): string {
  const match = tag.match(
    new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'),
  )
  return match?.[1] || match?.[2] || match?.[3] || ''
}

function pushCandidate(
  candidates: WebsitePhotoCandidate[],
  raw: string,
  baseUrl: string,
  extra?: { width?: number; height?: number; alt?: string; className?: string; pinned?: boolean },
) {
  const absolute = absUrl(raw, baseUrl)
  if (!absolute || isInstagramUrl(absolute)) return
  const url = canonicalizePhotoUrl(absolute)
  const fromUrl = photoDimensionsFromUrl(absolute)
  const collapsedThumb =
    /\/:\//.test(absolute) || /[?&]resize=/i.test(absolute)
  let width = extra?.width || fromUrl.width
  let height = extra?.height || fromUrl.height
  if (collapsedThumb && width > 0 && width < MIN_PHOTO_WIDTH) {
    width = 0
    height = 0
  }
  if (isTinyPhoto(absolute, collapsedThumb ? 0 : width)) return
  if (isJunkWebsitePhoto(absolute, extra?.alt, extra?.className)) return
  if (isJunkWebsitePhoto(url, extra?.alt, extra?.className)) return
  candidates.push({
    url,
    maxWidth: width,
    maxHeight: height,
    identity: websitePhotoIdentity(url),
    pinned: extra?.pinned,
  })
}

export function extractWebsitePhotos(html: string, baseUrl: string): string[] {
  const candidates: WebsitePhotoCandidate[] = []
  const ogWidth = Number(metaContents(html, 'og:image:width')[0] || 0)
  const ogHeight = Number(metaContents(html, 'og:image:height')[0] || 0)
  for (const key of ['og:image', 'og:image:url', 'twitter:image', 'twitter:image:src']) {
    for (const content of metaContents(html, key)) {
      pushCandidate(candidates, content, baseUrl, {
        width: ogWidth,
        height: ogHeight,
        pinned: true,
      })
    }
  }
  const scripts = html.matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )
  for (const script of scripts) {
    const found: string[] = []
    try {
      collectJsonLdImages(JSON.parse(script[1] || 'null'), found)
    } catch {
      /* ignore broken JSON-LD */
    }
    for (const content of found) pushCandidate(candidates, content, baseUrl)
  }
  const imgTags = html.matchAll(/<img\b[^>]*>/gi)
  for (const img of imgTags) {
    const tag = img[0]
    const alt = tagAttr(tag, 'alt')
    const className = tagAttr(tag, 'class')
    const width = Number(tagAttr(tag, 'width') || 0)
    const height = Number(tagAttr(tag, 'height') || 0)
    const sources = [
      tagAttr(tag, 'src'),
      tagAttr(tag, 'data-src'),
      tagAttr(tag, 'data-srclazy'),
      tagAttr(tag, 'data-desktop-bg'),
    ]
    for (const srcset of [tagAttr(tag, 'srcset'), tagAttr(tag, 'data-srcset'), tagAttr(tag, 'data-srcsetlazy')]) {
      if (srcset) sources.push(...splitSrcset(srcset))
    }
    for (const src of sources) {
      if (!src || src.startsWith('data:') || !looksLikeImageUrl(src)) continue
      pushCandidate(candidates, src, baseUrl, { width, height, alt, className })
    }
  }
  const attrRe =
    /\b(?:href|data-desktop-bg)=["']([^"']+)["']/gi
  let attr: RegExpExecArray | null
  while ((attr = attrRe.exec(html))) {
    if (!attr[1] || attr[1].startsWith('data:') || !looksLikeImageUrl(attr[1])) continue
    pushCandidate(candidates, attr[1], baseUrl)
  }
  return selectBestWebsitePhotos(candidates)
}
