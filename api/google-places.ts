import {
  getRapidApiKey,
  methodNotAllowed,
  missingKey,
  proxyRequest,
  readEnv,
} from './_lib/proxy.js'
import { requireAllowlistedUser } from './_lib/auth.js'
import {
  googlePlacesUpstreamHeaders,
  normalizeGooglePlaceId,
} from './googlePlacesFieldMask.js'
import {
  getGooglePlacesProvider,
  getOfficialGooglePlacesApiKey,
  officialPlacesUrl,
  withPlacesProviderHeader,
  type GooglePlacesProvider,
} from './_lib/googlePlacesProvider.js'
import {
  legacyDetailsPath,
  legacyTextSearchPath,
  mapLegacyDetailsToNew,
  mapLegacySearchToNew,
  mapLegacyStatusToHttp,
  shouldFallbackFromPrimary,
} from './_lib/googlePlacesLegacy.js'

export const runtime = 'nodejs'
export const maxDuration = 30

const DEFAULT_HOST = 'google-map-places-new-v2.p.rapidapi.com'
const DEFAULT_BACKUP_HOST = 'google-map-places.p.rapidapi.com'

export async function GET(req: Request): Promise<Response> {
  return handleGooglePlaces(req)
}

export async function POST(req: Request): Promise<Response> {
  return handleGooglePlaces(req)
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function allowedPath(method: string, rest: string): boolean {
  if (method === 'POST') return rest === 'v1/places:searchText'
  if (method === 'GET') {
    return /^v1\/places\/[A-Za-z0-9_-]+$/.test(rest)
  }
  return false
}

function normalizeDetailsRest(rest: string): string {
  const id = normalizeGooglePlaceId(rest.replace(/^v1\/places\//, ''))
  return id ? `v1/places/${id}` : rest
}

function parseSearchBody(body: ArrayBuffer | null): {
  textQuery: string
  languageCode?: string
  regionCode?: string
  location?: { latitude?: number; longitude?: number }
  radiusMeters?: number
} | null {
  if (!body) return null
  try {
    const parsed = JSON.parse(new TextDecoder().decode(body)) as {
      textQuery?: unknown
      languageCode?: unknown
      regionCode?: unknown
      locationBias?: { circle?: { center?: { latitude?: number; longitude?: number }; radius?: number } }
    }
    const textQuery =
      typeof parsed.textQuery === 'string' ? parsed.textQuery.trim() : ''
    if (!textQuery) return null
    const center = parsed.locationBias?.circle?.center
    return {
      textQuery,
      languageCode:
        typeof parsed.languageCode === 'string' ? parsed.languageCode : undefined,
      regionCode:
        typeof parsed.regionCode === 'string' ? parsed.regionCode : undefined,
      location: center,
      radiusMeters: parsed.locationBias?.circle?.radius,
    }
  } catch {
    return null
  }
}

function logUpstream(
  provider: GooglePlacesProvider,
  method: string,
  rest: string,
  status: number,
  extra?: string,
) {
  const suffix = extra ? ` ${extra}` : ''
  console.info(`[places-upstream] ${provider} ${method} ${rest} -> ${status}${suffix}`)
}

async function fetchLegacyJson(
  key: string,
  host: string,
  path: string,
): Promise<{ httpStatus: number; payload: unknown } | null> {
  const response = await fetch(`https://${host}/${path}`, {
    method: 'GET',
    headers: {
      'X-RapidAPI-Key': key,
      'X-RapidAPI-Host': host,
      Accept: 'application/json',
    },
  })
  const raw = await response.arrayBuffer()
  if (!response.ok) {
    return { httpStatus: response.status, payload: null }
  }
  try {
    return {
      httpStatus: 200,
      payload: JSON.parse(new TextDecoder().decode(raw)) as unknown,
    }
  } catch {
    return null
  }
}

async function backupSearch(
  key: string,
  host: string,
  body: ArrayBuffer | null,
): Promise<Response | null> {
  const input = parseSearchBody(body)
  if (!input) return null
  const fetched = await fetchLegacyJson(key, host, legacyTextSearchPath(input))
  if (!fetched) return json(502, { error: 'Backup Places search failed' })
  if (fetched.payload == null) {
    return json(fetched.httpStatus, { error: 'Backup Places search failed' })
  }
  const status =
    fetched.payload &&
    typeof fetched.payload === 'object' &&
    typeof (fetched.payload as { status?: unknown }).status === 'string'
      ? (fetched.payload as { status: string }).status
      : 'OK'
  const http = mapLegacyStatusToHttp(status)
  if (http !== 200) {
    return json(http, { error: `Backup Places search ${status}` })
  }
  return json(200, mapLegacySearchToNew(fetched.payload))
}

async function backupDetails(
  key: string,
  host: string,
  rest: string,
  languageCode: string,
): Promise<Response | null> {
  const placeId = normalizeGooglePlaceId(rest.slice('v1/places/'.length))
  if (!placeId) return null
  const fetched = await fetchLegacyJson(
    key,
    host,
    legacyDetailsPath(placeId, languageCode),
  )
  if (!fetched) return json(502, { error: 'Backup Places details failed' })
  if (fetched.payload == null) {
    return json(fetched.httpStatus, { error: 'Backup Places details failed' })
  }
  const status =
    fetched.payload &&
    typeof fetched.payload === 'object' &&
    typeof (fetched.payload as { status?: unknown }).status === 'string'
      ? (fetched.payload as { status: string }).status
      : 'OK'
  const http = mapLegacyStatusToHttp(status)
  if (http !== 200) {
    return json(http, { error: `Backup Places details ${status}` })
  }
  const place = mapLegacyDetailsToNew(fetched.payload)
  if (!place) return json(404, { error: 'Backup Places details empty' })
  return json(200, place)
}

async function handleOfficialPlaces(
  req: Request,
  rest: string,
  search: string,
  body: ArrayBuffer | null,
): Promise<Response> {
  const key = getOfficialGooglePlacesApiKey()
  if (!key) return missingKey('GOOGLE_PLACES_API_KEY')

  const target = officialPlacesUrl(rest, search)
  const primaryReq = new Request(req.url, {
    method: req.method,
    headers: req.headers,
    body: body ?? undefined,
  })

  try {
    const upstream = await proxyRequest(target, primaryReq, {
      'X-Goog-Api-Key': key,
      ...googlePlacesUpstreamHeaders(req.method),
    })
    logUpstream('official', req.method, rest, upstream.status)
    if (!upstream.ok) {
      const snippet = await upstream
        .clone()
        .text()
        .then((text) => text.slice(0, 400))
        .catch(() => '')
      console.warn(`[google-places] official ${req.method} ${rest}`, snippet)
    }
    return withPlacesProviderHeader(upstream, 'official')
  } catch (error) {
    console.error('[google-places] official', error)
    return json(502, { error: 'Official Google Places request failed' })
  }
}

async function handleRapidApiPlaces(
  req: Request,
  rest: string,
  search: string,
  body: ArrayBuffer | null,
): Promise<Response> {
  const key = getRapidApiKey()
  if (!key) return missingKey('RAPIDAPI_KEY')

  const host = readEnv('RAPIDAPI_GOOGLE_PLACES_HOST') || DEFAULT_HOST
  const backupHost =
    readEnv('RAPIDAPI_GOOGLE_PLACES_BACKUP_HOST') || DEFAULT_BACKUP_HOST
  const target = `https://${host}/${rest}${search}`
  const primaryReq = new Request(req.url, {
    method: req.method,
    headers: req.headers,
    body: body ?? undefined,
  })

  let primary: Response | null = null
  try {
    primary = await proxyRequest(target, primaryReq, {
      'X-RapidAPI-Key': key,
      'X-RapidAPI-Host': host,
      ...googlePlacesUpstreamHeaders(req.method),
    })
  } catch (error) {
    console.error('[google-places] primary', error)
  }

  if (primary?.ok) {
    logUpstream('rapidapi', req.method, rest, primary.status)
    return withPlacesProviderHeader(primary, 'rapidapi')
  }
  const primaryStatus = primary?.status ?? 502
  logUpstream('rapidapi', req.method, rest, primaryStatus)
  if (primary) {
    const snippet = await primary
      .clone()
      .text()
      .then((text) => text.slice(0, 400))
      .catch(() => '')
    console.warn(
      `[google-places] primary ${req.method} ${rest} -> ${primaryStatus}`,
      snippet,
    )
  }
  if (
    !shouldFallbackFromPrimary(primaryStatus) ||
    backupHost === host
  ) {
    return withPlacesProviderHeader(
      primary ?? json(502, { error: 'Upstream Google Places request failed' }),
      'rapidapi',
    )
  }

  try {
    console.warn(
      `[google-places] New V2 failed (${primaryStatus}); using backup host`,
    )
    const backup =
      req.method === 'POST'
        ? await backupSearch(key, backupHost, body)
        : await backupDetails(
            key,
            backupHost,
            rest,
            new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get(
              'languageCode',
            ) || 'fr',
          )
    if (backup) {
      logUpstream('rapidapi', req.method, rest, backup.status, 'legacy-backup')
      return withPlacesProviderHeader(backup, 'rapidapi')
    }
  } catch (error) {
    console.error('[google-places] backup', error)
  }

  return withPlacesProviderHeader(
    primary ?? json(502, { error: 'Upstream Google Places request failed' }),
    'rapidapi',
  )
}

/** Server-only Places proxy; the browser never receives the key. */
export async function handleGooglePlaces(req: Request): Promise<Response> {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return methodNotAllowed(['GET', 'POST'])
  }
  const auth = await requireAllowlistedUser(req)
  if (auth.ok === false) return auth.response

  const url = new URL(req.url)
  let rest = (url.searchParams.get('rest') || '').replace(/^\/+/, '')
  url.searchParams.delete('rest')
  if (req.method === 'GET') rest = normalizeDetailsRest(rest)
  if (!allowedPath(req.method, rest)) {
    return json(400, { error: 'Unsupported Places path' })
  }

  const body =
    req.method !== 'GET' && req.method !== 'HEAD'
      ? await req.arrayBuffer()
      : null
  const provider = getGooglePlacesProvider()
  if (provider === 'official') {
    return handleOfficialPlaces(req, rest, url.search, body)
  }
  return handleRapidApiPlaces(req, rest, url.search, body)
}
