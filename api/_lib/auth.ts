/**
 * Verify Supabase JWT + allowlist before proxying paid upstream APIs.
 */
import { readEnv } from './proxy.js'

export type AuthedUser = {
  id: string
  email: string
}

function unauthorized(message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: { 'content-type': 'application/json' },
  })
}

function forbidden(message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 403,
    headers: { 'content-type': 'application/json' },
  })
}

export function extractBearerToken(req: Request): string | null {
  const header = req.headers.get('authorization') || req.headers.get('Authorization')
  if (!header) return null
  const m = header.match(/^Bearer\s+(.+)$/i)
  return m?.[1]?.trim() || null
}

/**
 * Returns the allowlisted user, or an error Response.
 * Does not consume the request body.
 */
export async function requireAllowlistedUser(
  req: Request,
): Promise<{ ok: true; user: AuthedUser } | { ok: false; response: Response }> {
  const token = extractBearerToken(req)
  if (!token) {
    return { ok: false, response: unauthorized('Missing Authorization bearer token') }
  }

  const url = readEnv('SUPABASE_URL', 'VITE_SUPABASE_URL')
  const anonKey = readEnv('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY')
  if (!url || !anonKey) {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({ error: 'Server missing SUPABASE_URL / SUPABASE_ANON_KEY' }),
        { status: 500, headers: { 'content-type': 'application/json' } },
      ),
    }
  }

  const userRes = await fetch(`${url.replace(/\/$/, '')}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anonKey,
    },
  })

  if (!userRes.ok) {
    return { ok: false, response: unauthorized('Invalid or expired session') }
  }

  const userJson = (await userRes.json()) as { id?: string; email?: string }
  const id = userJson.id
  const email = (userJson.email || '').trim().toLowerCase()
  if (!id || !email) {
    return { ok: false, response: unauthorized('Invalid user') }
  }

  const rpcRes = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/is_allowlisted_email`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anonKey,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ check_email: email }),
  })

  if (!rpcRes.ok) {
    return { ok: false, response: forbidden('Allowlist check failed') }
  }

  const listed = await rpcRes.json()
  if (listed !== true) {
    return { ok: false, response: forbidden('Email is not invite-allowlisted') }
  }

  return { ok: true, user: { id, email } }
}
