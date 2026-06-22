/**
 * Relink orphaned folders/photos to a user's current album_users row.
 *
 * Usage:
 *   node scripts/relink-user-assets.mjs --email rnicolegrace@gmail.com --dry-run
 *   node scripts/relink-user-assets.mjs --email rnicolegrace@gmail.com --name "Nicole Grace Relayo"
 *   node scripts/relink-user-assets.mjs --email rnicolegrace@gmail.com --apply
 */

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

function getArg(flag) {
  const index = process.argv.indexOf(flag)
  if (index === -1) return ''
  return process.argv[index + 1] ?? ''
}

const env = loadEnv()
const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
const email = getArg('--email').trim().toLowerCase()
const nameHint = getArg('--name').trim()
const exactName = getArg('--exact-name').trim()
const storagePrefix = getArg('--storage-prefix').trim()
const dryRun = process.argv.includes('--dry-run') || !process.argv.includes('--apply')

if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env')
  process.exit(1)
}

if (!email) {
  console.error(
    'Usage: node scripts/relink-user-assets.mjs --email user@example.com [--name "Partial"] [--exact-name "Nicole Grace"] [--storage-prefix homesph/albums/nicole-grace/] [--dry-run|--apply]',
  )
  process.exit(1)
}

if (!nameHint && !exactName && !storagePrefix) {
  console.error('Provide at least one of --name, --exact-name, or --storage-prefix to select orphaned rows.')
  process.exit(1)
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function fetchAll(table, buildQuery) {
  const pageSize = 1000
  let from = 0
  const rows = []

  while (true) {
    const query = buildQuery(supabase.from(table).select('*').range(from, from + pageSize - 1))
    const { data, error } = await query
    if (error) throw new Error(`${table}: ${error.message}`)
    if (!data?.length) break
    rows.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }

  return rows
}

async function main() {
  console.log(`Mode: ${dryRun ? 'DRY RUN (pass --apply to update)' : 'APPLY'}\n`)

  const { data: user, error: userErr } = await supabase
    .from('album_users')
    .select('id, code, full_name, email, status, role')
    .eq('email', email)
    .maybeSingle()

  if (userErr) throw new Error(userErr.message)
  if (!user) {
    console.error(`No album_users row found for email: ${email}`)
    process.exit(1)
  }

  console.log('Target user:')
  console.log(`  id:    ${user.id}`)
  console.log(`  code:  ${user.code}`)
  console.log(`  name:  ${user.full_name}`)
  console.log(`  email: ${user.email}`)
  console.log('')

  const orphanFolders = await fetchAll('albums_folders', (q) => {
    let query = q.is('album_user_id', null)
    if (exactName) query = query.eq('uploader_name', exactName)
    else if (nameHint) query = query.ilike('uploader_name', `%${nameHint}%`)
    return query
  })

  const orphanPhotos = await fetchAll('albums_photos', (q) => {
    let query = q.is('album_user_id', null)
    if (storagePrefix) query = query.ilike('storage_path', `${storagePrefix}%`)
    else if (exactName) query = query.eq('uploader_name', exactName)
    else if (nameHint) query = query.ilike('uploader_name', `%${nameHint}%`)
    return query
  })

  const matchLabel = exactName || storagePrefix || nameHint

  const ownedFolders = await fetchAll('albums_folders', (q) =>
    q.eq('album_user_id', user.id),
  )

  const ownedPhotos = await fetchAll('albums_photos', (q) =>
    q.eq('album_user_id', user.id),
  )

  console.log(`Orphaned folders matching "${matchLabel}": ${orphanFolders.length}`)
  for (const folder of orphanFolders.slice(0, 20)) {
    console.log(`  - ${folder.folder_name} (${folder.id}) created ${folder.created_at}`)
  }
  if (orphanFolders.length > 20) console.log(`  ... and ${orphanFolders.length - 20} more`)

  console.log(`\nOrphaned photos matching "${matchLabel}": ${orphanPhotos.length}`)
  for (const photo of orphanPhotos.slice(0, 10)) {
    console.log(`  - ${photo.original_file_name ?? photo.id} | ${photo.storage_path ?? 'no path'}`)
  }
  if (orphanPhotos.length > 10) console.log(`  ... and ${orphanPhotos.length - 10} more`)

  console.log(`\nAlready linked to current user:`)
  console.log(`  folders: ${ownedFolders.length}`)
  console.log(`  photos:  ${ownedPhotos.length}`)

  if (!orphanFolders.length && !orphanPhotos.length) {
    console.log('\nNothing to relink. Try a different --name hint or check Supabase admin folder directory for "Unassigned".')
    return
  }

  const folderIds = orphanFolders.map((f) => f.id)
  const photoIds = orphanPhotos.map((p) => p.id)

  const updates = {
    album_user_id: user.id,
    uploader_code: user.code,
    uploader_name: user.full_name,
    updated_at: new Date().toISOString(),
  }

  if (dryRun) {
    console.log('\nDry run complete. Re-run with --apply to relink these rows.')
    return
  }

  const chunkSize = 500

  if (folderIds.length) {
    for (let i = 0; i < folderIds.length; i += chunkSize) {
      const chunk = folderIds.slice(i, i + chunkSize)
      const { error } = await supabase.from('albums_folders').update(updates).in('id', chunk)
      if (error) throw new Error(`folders update: ${error.message}`)
    }
    console.log(`\nRelinked ${folderIds.length} folder(s).`)
  }

  if (photoIds.length) {
    for (let i = 0; i < photoIds.length; i += chunkSize) {
      const chunk = photoIds.slice(i, i + chunkSize)
      const { error } = await supabase.from('albums_photos').update(updates).in('id', chunk)
      if (error) throw new Error(`photos update: ${error.message}`)
    }
    console.log(`Relinked ${photoIds.length} photo(s).`)
  }

  console.log('\nDone. S3 files were not moved; existing storage_path values still work.')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
