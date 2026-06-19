import { readFileSync } from 'node:fs'
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
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env')
  process.exit(1)
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const { error } = await supabase
  .from('album_users')
  .select('email_verification_code, email_verification_expires_at')
  .limit(1)

if (!error) {
  console.log('album_users verification columns are available.')
  process.exit(0)
}

if (!/email_verification_|schema cache/i.test(error.message)) {
  console.error('Unexpected error:', error.message)
  process.exit(1)
}

console.log('Verification columns missing. Run this SQL in Supabase → SQL Editor:')
console.log('')
console.log(readFileSync('database/media-registration.sql', 'utf8'))
