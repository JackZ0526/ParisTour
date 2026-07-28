/**
 * Send trip-share invite email (Resend) after owner shares a trip.
 */
import { methodNotAllowed, readEnv } from './_lib/proxy.js'
import { extractBearerToken, requireAllowlistedUser } from './_lib/auth.js'

export const runtime = 'nodejs'
export const maxDuration = 30

type ShareInviteBody = {
  tripId?: string
  inviteeEmail?: string
  role?: string
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function appOriginFromRequest(req: Request): string {
  const configured = readEnv('PUBLIC_APP_URL', 'APP_URL', 'VITE_APP_URL')
  if (configured) return configured.replace(/\/$/, '')

  const origin = req.headers.get('origin')
  if (origin) return origin.replace(/\/$/, '')

  const host = req.headers.get('x-forwarded-host') || req.headers.get('host')
  const proto = req.headers.get('x-forwarded-proto') || 'https'
  if (host) return `${proto}://${host}`.replace(/\/$/, '')

  return 'https://paristour.vercel.app'
}

async function supabaseRpc<T>(
  path: string,
  token: string,
  body?: unknown,
): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string }> {
  const url = readEnv('SUPABASE_URL', 'VITE_SUPABASE_URL')
  const anonKey = readEnv('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY')
  if (!url || !anonKey) {
    return { ok: false, status: 500, error: 'Server missing SUPABASE_URL / SUPABASE_ANON_KEY' }
  }

  const res = await fetch(`${url.replace(/\/$/, '')}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anonKey,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    return { ok: false, status: res.status, error: text || res.statusText }
  }

  const data = (await res.json()) as T
  return { ok: true, data }
}

function roleLabel(role: string): string {
  return role === 'editor' ? '可编辑' : '只读'
}

function buildInviteEmail(opts: {
  inviterEmail: string
  tripTitle: string
  role: string
  inviteUrl: string
  registered: boolean
}): { subject: string; html: string; text: string } {
  const perm = roleLabel(opts.role)
  const action = opts.registered ? '登录' : '注册'
  const subject = `${opts.inviterEmail} 邀请你协作巴黎行程（${perm}）`
  const text = [
    `${opts.inviterEmail} 邀请你查看行程「${opts.tripTitle}」。`,
    `权限：${perm}`,
    `请点击链接${action}后打开行程：`,
    opts.inviteUrl,
  ].join('\n')

  const html = `<!doctype html>
<html lang="zh-CN">
<body style="margin:0;padding:0;background:#f4f1ea;font-family:Georgia,'Times New Roman',serif;color:#1f1a17;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f1ea;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#fffcf7;border:1px solid #e5ddd0;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="padding:28px 28px 8px;background:linear-gradient(135deg,#4a6356 0%,#2f4339 100%);color:#fffcf7;">
              <div style="font-size:11px;letter-spacing:0.22em;text-transform:uppercase;opacity:0.85;">Paris Tour</div>
              <div style="font-size:28px;line-height:1.2;margin-top:8px;">行程协作邀请</div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 28px 28px;font-size:15px;line-height:1.6;color:#3a342e;">
              <p style="margin:0 0 12px;"><strong style="color:#1f1a17;">${escapeHtml(opts.inviterEmail)}</strong> 邀请你协作行程 <strong style="color:#1f1a17;">「${escapeHtml(opts.tripTitle)}」</strong>。</p>
              <p style="margin:0 0 20px;">权限：${escapeHtml(perm)}。请先${escapeHtml(action)}账号，登录后即可在行程列表中看到这份分享。</p>
              <p style="margin:0 0 24px;">
                <a href="${escapeAttr(opts.inviteUrl)}" style="display:inline-block;background:#4a6356;color:#fffcf7;text-decoration:none;padding:12px 22px;border-radius:999px;font-size:14px;">
                  ${escapeHtml(action)}并打开行程
                </a>
              </p>
              <p style="margin:0;font-size:12px;color:#7a7168;word-break:break-all;">若按钮无法点击，请复制链接：<br/>${escapeHtml(opts.inviteUrl)}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  return { subject, html, text }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, '&#39;')
}

async function sendWithResend(opts: {
  to: string
  subject: string
  html: string
  text: string
}): Promise<{ ok: true; id?: string; provider: 'resend' } | { ok: false; error: string }> {
  const apiKey = readEnv('RESEND_API_KEY')
  if (!apiKey) {
    return { ok: false, error: 'missing_resend_api_key' }
  }

  const from =
    readEnv('RESEND_FROM_EMAIL') || 'Paris Tour <onboarding@resend.dev>'

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    return { ok: false, error: text || `Resend HTTP ${res.status}` }
  }

  const data = (await res.json().catch(() => ({}))) as { id?: string }
  return { ok: true, id: data.id, provider: 'resend' }
}

/**
 * Fallback: send via Supabase Auth email (invite / magic link).
 * Uses the project's existing Auth email/SMTP — no Resend domain required.
 */
async function sendWithSupabaseAuth(opts: {
  email: string
  inviteUrl: string
  registered: boolean
}): Promise<{ ok: true; provider: 'supabase_auth' } | { ok: false; error: string }> {
  const url = readEnv('SUPABASE_URL', 'VITE_SUPABASE_URL')
  const serviceKey = readEnv('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceKey) {
    return { ok: false, error: 'missing_supabase_service_role_key' }
  }

  const base = url.replace(/\/$/, '')
  const headers = {
    Authorization: `Bearer ${serviceKey}`,
    apikey: serviceKey,
    'Content-Type': 'application/json',
  }

  if (opts.registered) {
    const otpRes = await fetch(`${base}/auth/v1/otp`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        email: opts.email,
        create_user: false,
        type: 'magiclink',
        email_redirect_to: opts.inviteUrl,
      }),
    })
    if (!otpRes.ok) {
      const text = await otpRes.text().catch(() => '')
      return { ok: false, error: text || `Supabase OTP HTTP ${otpRes.status}` }
    }
    return { ok: true, provider: 'supabase_auth' }
  }

  const inviteRes = await fetch(`${base}/auth/v1/invite`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      email: opts.email,
      redirect_to: opts.inviteUrl,
      data: {
        invite_source: 'trip_share',
      },
    }),
  })

  if (!inviteRes.ok) {
    const text = await inviteRes.text().catch(() => '')
    // If already invited / exists, fall back to magic link OTP.
    if (/already|registered|exists/i.test(text)) {
      const otpRes = await fetch(`${base}/auth/v1/otp`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          email: opts.email,
          create_user: false,
          type: 'magiclink',
          email_redirect_to: opts.inviteUrl,
        }),
      })
      if (!otpRes.ok) {
        const otpText = await otpRes.text().catch(() => '')
        return { ok: false, error: otpText || text || `Supabase invite HTTP ${inviteRes.status}` }
      }
      return { ok: true, provider: 'supabase_auth' }
    }
    return { ok: false, error: text || `Supabase invite HTTP ${inviteRes.status}` }
  }

  return { ok: true, provider: 'supabase_auth' }
}

async function sendInviteMail(opts: {
  to: string
  subject: string
  html: string
  text: string
  inviteUrl: string
  registered: boolean
}): Promise<
  | { ok: true; provider: 'resend' | 'supabase_auth'; id?: string }
  | { ok: false; error: string }
> {
  const resend = await sendWithResend({
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
  })
  if (resend.ok) return resend

  if (resend.error !== 'missing_resend_api_key') {
    // Resend configured but failed — still try Supabase before giving up.
    const fallback = await sendWithSupabaseAuth({
      email: opts.to,
      inviteUrl: opts.inviteUrl,
      registered: opts.registered,
    })
    if (fallback.ok) return fallback
    return { ok: false, error: `Resend: ${resend.error}; Supabase: ${fallback.error}` }
  }

  const viaAuth = await sendWithSupabaseAuth({
    email: opts.to,
    inviteUrl: opts.inviteUrl,
    registered: opts.registered,
  })
  if (viaAuth.ok) return viaAuth

  if (viaAuth.error === 'missing_supabase_service_role_key') {
    return { ok: false, error: 'missing_mail_provider' }
  }
  return viaAuth
}

/** Shared handler for Vercel function + Vite dev middleware. */
export async function handleShareInvite(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return methodNotAllowed(['POST'])
  }

  const auth = await requireAllowlistedUser(req)
  if (auth.ok === false) return auth.response

  const token = extractBearerToken(req)
  if (!token) return json(401, { error: 'Missing Authorization bearer token' })

  let body: ShareInviteBody
  try {
    body = (await req.json()) as ShareInviteBody
  } catch {
    return json(400, { error: 'Invalid JSON body' })
  }

  const tripId = (body.tripId || '').trim()
  const inviteeEmail = (body.inviteeEmail || '').trim().toLowerCase()
  const role = body.role === 'editor' ? 'editor' : 'viewer'

  if (!tripId || !inviteeEmail.includes('@')) {
    return json(400, { error: 'tripId and inviteeEmail are required' })
  }

  // Owner-only: RLS returns empty if not owner.
  const tripRes = await supabaseRpc<Array<{ id: string; title: string; owner_id: string }>>(
    `/rest/v1/trips?id=eq.${encodeURIComponent(tripId)}&owner_id=eq.${encodeURIComponent(auth.user.id)}&select=id,title,owner_id`,
    token,
  )
  if (!tripRes.ok) {
    return json(tripRes.status >= 400 ? tripRes.status : 500, {
      error: 'Failed to verify trip ownership',
      detail: tripRes.error,
    })
  }
  const trip = tripRes.data?.[0]
  if (!trip) {
    return json(403, { error: 'Only the trip owner can send invites' })
  }

  const shareRes = await supabaseRpc<Array<{ id: string }>>(
    `/rest/v1/trip_shares?trip_id=eq.${encodeURIComponent(tripId)}&invitee_email=eq.${encodeURIComponent(inviteeEmail)}&select=id`,
    token,
  )
  if (!shareRes.ok || !shareRes.data?.[0]) {
    return json(400, { error: 'Share record not found; add the share first' })
  }

  const registeredRpc = await supabaseRpc<boolean>('/rest/v1/rpc/email_is_registered', token, {
    check_email: inviteeEmail,
  })
  const registered = registeredRpc.ok ? registeredRpc.data === true : false

  const origin = appOriginFromRequest(req)
  const authTab = registered ? 'signin' : 'signup'
  const inviteUrl = `${origin}/?auth=${authTab}&email=${encodeURIComponent(inviteeEmail)}`

  const mail = buildInviteEmail({
    inviterEmail: auth.user.email,
    tripTitle: trip.title || '我的巴黎行程',
    role,
    inviteUrl,
    registered,
  })

  const sent = await sendInviteMail({
    to: inviteeEmail,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    inviteUrl,
    registered,
  })

  if (!sent.ok) {
    if (sent.error === 'missing_mail_provider') {
      return json(200, {
        sent: false,
        registered,
        inviteUrl,
        warning:
          '未配置邮件：请设置 SUPABASE_SERVICE_ROLE_KEY（推荐，用现有 Auth 邮件）或 RESEND_API_KEY（需自有域名）。可先手动复制链接发给对方。',
      })
    }
    return json(502, {
      sent: false,
      registered,
      inviteUrl,
      error: `邀请邮件发送失败：${sent.error}`,
    })
  }

  return json(200, {
    sent: true,
    registered,
    inviteUrl,
    provider: sent.provider,
    id: sent.id,
  })
}

export async function POST(req: Request): Promise<Response> {
  return handleShareInvite(req)
}
