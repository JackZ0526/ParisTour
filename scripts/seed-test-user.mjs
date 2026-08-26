/**
 * Idempotently allowlist + create the dev test account (test@paristour.dev / test).
 * Requires SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY in .env.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const DEV_TEST_EMAIL = 'test@paristour.dev'
const DEV_TEST_PASSWORD = 'test'

function loadEnvFile() {
  try {
    const raw = readFileSync(resolve(process.cwd(), '.env'), 'utf8')
    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq <= 0) continue
      const key = trimmed.slice(0, eq).trim()
      let value = trimmed.slice(eq + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      if (!(key in process.env)) process.env[key] = value
    }
  } catch {
    /* .env optional if vars already exported */
  }
}

async function findUserByEmail(admin, email) {
  let page = 1
  for (;;) {
    const { data, error } = await admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const hit = data.users.find((u) => (u.email || '').toLowerCase() === email)
    if (hit) return hit
    if (data.users.length < 200) return null
    page += 1
  }
}

async function main() {
  loadEnvFile()

  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim()
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!url || !serviceKey) {
    console.error('Missing SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY in .env')
    process.exit(1)
  }

  const sb = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { error: allowErr } = await sb
    .from('allowlist_emails')
    .upsert({ email: DEV_TEST_EMAIL }, { onConflict: 'email' })
  if (allowErr) {
    console.error('Allowlist insert failed:', allowErr.message)
    process.exit(1)
  }
  console.log(`Allowlisted ${DEV_TEST_EMAIL}`)

  const existing = await findUserByEmail(sb.auth.admin, DEV_TEST_EMAIL)
  if (existing) {
    const { error } = await sb.auth.admin.updateUserById(existing.id, {
      password: DEV_TEST_PASSWORD,
      email_confirm: true,
    })
    if (error) {
      // Auth password policy may reject short passwords; existing account is still usable.
      console.warn(`Could not reset password (${error.message}). Existing account kept.`)
      console.log(`Existing test user (${existing.id})`)
    } else {
      console.log(`Updated existing test user (${existing.id})`)
    }
  } else {
    const { data, error } = await sb.auth.admin.createUser({
      email: DEV_TEST_EMAIL,
      password: DEV_TEST_PASSWORD,
      email_confirm: true,
    })
    if (error) {
      console.error('Create test user failed:', error.message)
      process.exit(1)
    }
    console.log(`Created test user (${data.user?.id})`)
  }

  console.log('\nDev login:')
  console.log(`  Email: ${DEV_TEST_EMAIL}  (or type "test" in the login field)`)
  console.log(`  Password: ${DEV_TEST_PASSWORD}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
