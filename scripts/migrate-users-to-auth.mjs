/**
 * Migration script: copy album_users passwords into Supabase Auth.
 *
 * Each row in album_users will become a Supabase Auth user with:
 *   - email   : album_users.email
 *   - password: album_users.password  (plain-text value stored in the table)
 *   - user_metadata: { code, full_name, first_name, last_name }
 *
 * Run once with:
 *   node --env-file=.env scripts/migrate-users-to-auth.mjs
 *
 * Rows that already have a matching Supabase Auth account are skipped.
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  console.log('Fetching users from album_users…')

  const { data: users, error } = await supabase
    .from('album_users')
    .select('id, email, password, first_name, last_name, full_name, code, status')

  if (error) {
    console.error('Failed to fetch album_users:', error.message)
    process.exit(1)
  }

  console.log(`Found ${users.length} user(s). Starting migration…\n`)

  let created = 0
  let skipped = 0
  let failed = 0

  for (const user of users) {
    process.stdout.write(`  [${user.email}] `)

    const { error: createError } = await supabase.auth.admin.createUser({
      email: user.email,
      password: user.password,
      email_confirm: true,
      user_metadata: {
        code: user.code,
        full_name: user.full_name,
        first_name: user.first_name,
        last_name: user.last_name,
      },
    })

    if (createError) {
      const alreadyExists =
        createError.message.toLowerCase().includes('already') ||
        createError.message.toLowerCase().includes('duplicate') ||
        createError.status === 422
      if (alreadyExists) {
        console.log('→ already exists, skipping.')
        skipped++
      } else {
        console.log(`→ FAILED: ${createError.message}`)
        failed++
      }
    } else {
      console.log('→ created.')
      created++
    }
  }

  console.log(`\nDone. Created: ${created}  Skipped: ${skipped}  Failed: ${failed}`)

  if (failed > 0) {
    console.warn('\nSome users failed to migrate. Check the output above.')
    process.exit(1)
  }
}

main()
