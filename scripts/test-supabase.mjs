import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

function loadEnv() {
  const env = {}
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue
    const index = line.indexOf('=')
    if (index === -1) continue
    const key = line.slice(0, index)
    let value = line.slice(index + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    env[key] = value
  }
  return env
}

const env = loadEnv()
const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

console.log('Host:', new URL(url).host)

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const started = Date.now()
const { data, error } = await supabase
  .from('album_users')
  .select(
    'id, first_name, last_name, full_name, status, area_focused, email, phone_number, code, role, avatar_url',
  )
  .eq('code', 'ALB-JAEVIE-BAYONA-4P8T')
  .maybeSingle()

console.log('Elapsed ms:', Date.now() - started)
if (error) {
  console.error('Supabase error:', error.message)
  process.exit(1)
}

console.log('User found:', data ? `${data.full_name} (${data.code})` : 'null')
