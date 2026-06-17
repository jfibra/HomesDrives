import { createSupabaseAdminClient } from '@/lib/server/albums'

import { ADMIN_PORTAL_CODE, STATIC_ADMIN_CREDENTIALS } from './constants'

export function isStaticPortalAdminLogin(email: string, password: string) {
  return (
    email.trim().toLowerCase() === STATIC_ADMIN_CREDENTIALS.email &&
    password === STATIC_ADMIN_CREDENTIALS.password
  )
}

export async function ensurePortalAdminAlbumUser() {
  const supabaseAdmin = createSupabaseAdminClient()
  const email = STATIC_ADMIN_CREDENTIALS.email

  const { data: existing, error: existingError } = await supabaseAdmin
    .from('album_users')
    .select('id, full_name, code, role, status, email')
    .eq('email', email)
    .maybeSingle()

  if (existingError) throw new Error(existingError.message)

  if (existing?.role === 'admin' && existing.status === 'active') {
    return existing
  }

  const { data, error } = await supabaseAdmin
    .from('album_users')
    .upsert(
      {
        first_name: 'Drive',
        last_name: 'Administrator',
        full_name: 'Drive Administrator',
        status: 'active',
        area_focused: 'All',
        email,
        phone_number: '+639170000002',
        code: ADMIN_PORTAL_CODE,
        role: 'admin',
      },
      { onConflict: 'email' },
    )
    .select('id, full_name, code, role, status, email')
    .single()

  if (error) throw new Error(error.message)
  return data
}

export async function loginPortalAdmin(email: string, password: string) {
  if (!isStaticPortalAdminLogin(email, password)) {
    throw new Error('Invalid email or password.')
  }

  const albumUser = await ensurePortalAdminAlbumUser()
  if (albumUser.role !== 'admin' || albumUser.status !== 'active') {
    throw new Error('Admin access only.')
  }

  return albumUser
}
