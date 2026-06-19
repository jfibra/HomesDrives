import { createHash, randomInt } from 'node:crypto'

import { getPublicAppOrigin } from '@/lib/app-url'
import {
  createSupabaseAdminClient,
  generateUserCode,
} from '@/lib/server/albums'
import {
  sendMediaVerificationCodeEmail,
  sendMediaWelcomeEmail,
} from '@/lib/server/email'

const CODE_TTL_MS = 15 * 60 * 1000
const RESEND_COOLDOWN_MS = 60 * 1000

type PendingMediaUserRow = {
  id: number
  email: string
  first_name: string
  last_name: string
  phone_number: string
  area_focused: string
  code: string
  status: string
  email_verification_code: string | null
  email_verification_expires_at: string | null
  created_at: string
  updated_at: string
}

function hashVerificationCode(code: string) {
  return createHash('sha256').update(code).digest('hex')
}

function generateVerificationCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

function isVerificationSetupError(message: string) {
  return /email_verification_|schema cache/i.test(message)
}

function isActiveOrSuspendedUser(user: { status: string }) {
  return user.status === 'active' || user.status === 'suspended'
}

function isPendingMediaRegistration(user: PendingMediaUserRow) {
  return (
    user.status === 'inactive' &&
    Boolean(user.email_verification_code) &&
    Boolean(user.email_verification_expires_at)
  )
}

async function getPendingMediaUser(email: string) {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('album_users')
    .select(
      'id, email, first_name, last_name, phone_number, area_focused, code, status, email_verification_code, email_verification_expires_at, created_at, updated_at',
    )
    .eq('email', email)
    .maybeSingle()

  if (error) {
    if (isVerificationSetupError(error.message)) {
      throw new Error(
        'Media registration is not set up yet. Run database/media-registration.sql in Supabase first.',
      )
    }
    throw new Error(error.message)
  }

  return (data as PendingMediaUserRow | null) ?? null
}

export async function requestMediaRegistrationCode(params: {
  firstName: string
  lastName: string
  email: string
  phoneNumber: string
  areaFocused: string
}) {
  const email = params.email.trim().toLowerCase()
  const firstName = params.firstName.trim()
  const lastName = params.lastName.trim()
  const phoneNumber = params.phoneNumber.trim()
  const areaFocused = params.areaFocused.trim() || 'Not specified'
  const fullName = `${firstName} ${lastName}`.trim()

  const existing = await getPendingMediaUser(email)
  if (existing && isActiveOrSuspendedUser(existing)) {
    throw new Error('An account with this email already exists. Try signing in instead.')
  }

  if (existing && existing.status === 'inactive' && !isPendingMediaRegistration(existing)) {
    throw new Error('This email is already registered but inactive. Contact support to reactivate it.')
  }

  const supabase = createSupabaseAdminClient()
  const now = Date.now()
  const code = generateVerificationCode()
  const expiresAt = new Date(now + CODE_TTL_MS).toISOString()
  const hashedCode = hashVerificationCode(code)

  const pending = existing

  if (pending && isPendingMediaRegistration(pending)) {
    const elapsed = now - new Date(pending.updated_at).getTime()
    if (elapsed < RESEND_COOLDOWN_MS) {
      const waitSeconds = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000)
      throw new Error(`Please wait ${waitSeconds}s before requesting another code.`)
    }

    const { error: updateError } = await supabase
      .from('album_users')
      .update({
        first_name: firstName,
        last_name: lastName,
        full_name: fullName,
        phone_number: phoneNumber,
        area_focused: areaFocused,
        email_verification_code: hashedCode,
        email_verification_expires_at: expiresAt,
      })
      .eq('id', pending.id)

    if (updateError) {
      if (isVerificationSetupError(updateError.message)) {
        throw new Error(
          'Media registration is not set up yet. Run database/media-registration.sql in Supabase first.',
        )
      }
      throw new Error(updateError.message)
    }
  } else {
    const userCode = generateUserCode(firstName, lastName)
    const { error: insertError } = await supabase.from('album_users').insert({
      first_name: firstName,
      last_name: lastName,
      full_name: fullName,
      status: 'inactive',
      area_focused: areaFocused,
      email,
      phone_number: phoneNumber,
      code: userCode,
      role: 'media',
      email_verification_code: hashedCode,
      email_verification_expires_at: expiresAt,
    })

    if (insertError) {
      if (isVerificationSetupError(insertError.message)) {
        throw new Error(
          'Media registration is not set up yet. Run database/media-registration.sql in Supabase first.',
        )
      }
      throw new Error(insertError.message)
    }
  }

  await sendMediaVerificationCodeEmail({
    to: email,
    firstName,
    code,
  })

  return { success: true as const }
}

export async function verifyMediaRegistrationCode(params: {
  email: string
  code: string
  password: string
}) {
  const email = params.email.trim().toLowerCase()
  const normalizedCode = params.code.replace(/\D/g, '').trim()
  const password = params.password

  if (!password || password.length < 8) {
    throw new Error('Password must be at least 8 characters.')
  }

  if (!/^\d{6}$/.test(normalizedCode)) {
    throw new Error('Please enter the 6-digit verification code from your email.')
  }

  const pending = await getPendingMediaUser(email)

  if (!pending || !isPendingMediaRegistration(pending)) {
    throw new Error('No pending registration found for this email. Request a new code.')
  }

  if (isActiveOrSuspendedUser(pending)) {
    throw new Error('An account with this email already exists. Try signing in instead.')
  }

  if (new Date(pending.email_verification_expires_at!).getTime() < Date.now()) {
    const supabase = createSupabaseAdminClient()
    await supabase
      .from('album_users')
      .update({
        email_verification_code: null,
        email_verification_expires_at: null,
      })
      .eq('id', pending.id)

    throw new Error('This verification code has expired. Request a new code.')
  }

  if (pending.email_verification_code !== hashVerificationCode(normalizedCode)) {
    throw new Error('Invalid verification code. Please check your email and try again.')
  }

  const supabase = createSupabaseAdminClient()
  const fullName = `${pending.first_name} ${pending.last_name}`.trim()

  const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, code: pending.code, role: 'media' },
  })

  if (authErr) {
    if (/already (registered|exists)/i.test(authErr.message)) {
      throw new Error('An account with this email already exists. Try signing in instead.')
    }
    throw new Error(`Auth: ${authErr.message}`)
  }

  const { error: updateError } = await supabase
    .from('album_users')
    .update({
      status: 'active',
      email_verification_code: null,
      email_verification_expires_at: null,
    })
    .eq('id', pending.id)

  if (updateError) {
    if (authData?.user?.id) {
      await supabase.auth.admin.deleteUser(authData.user.id).catch(() => undefined)
    }
    throw new Error(updateError.message)
  }

  const origin = getPublicAppOrigin()
  const dashboardUrl = `${origin}/${encodeURIComponent(pending.code)}`
  const loginUrl = `${origin}/login`

  await sendMediaWelcomeEmail({
    to: email,
    firstName: pending.first_name,
    password,
    dashboardUrl,
    loginUrl,
    userCode: pending.code,
  })

  return {
    success: true as const,
    user: {
      email,
      code: pending.code,
      dashboardUrl,
    },
  }
}
