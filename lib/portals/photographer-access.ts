import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'crypto'

import { getPortalEventById } from '@/lib/portals/events'

const ACCESS_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000

export const PORTAL_PHOTOGRAPHER_ACCESS_PREFIX = 'temp-portals-photographer-access:'

export function getPhotographerAccessStorageKey(eventSlug: string) {
  return `${PORTAL_PHOTOGRAPHER_ACCESS_PREFIX}${eventSlug}`
}

export function isValidPhotographerPin(pin: string) {
  return /^\d{6}$/.test(pin)
}

export function hashPhotographerPin(pin: string) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(pin, salt, 32).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPhotographerPin(pin: string, storedHash: string) {
  const [salt, hash] = storedHash.split(':')
  if (!salt || !hash) return false

  try {
    const derived = scryptSync(pin, salt, 32)
    const expected = Buffer.from(hash, 'hex')
    return derived.length === expected.length && timingSafeEqual(derived, expected)
  } catch {
    return false
  }
}

function getPhotographerTokenSecret() {
  return (
    process.env.PORTAL_PHOTOGRAPHER_TOKEN_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    'dev-photographer-access-secret'
  )
}

export function createPhotographerAccessToken(eventId: string) {
  const expiresAt = Date.now() + ACCESS_TOKEN_TTL_MS
  const payload = `${eventId}.${expiresAt}`
  const signature = createHmac('sha256', getPhotographerTokenSecret()).update(payload).digest('base64url')
  return `${payload}.${signature}`
}

export function verifyPhotographerAccessToken(eventId: string, accessToken: string) {
  const parts = accessToken.split('.')
  if (parts.length !== 3) return false

  const [tokenEventId, expiresAtRaw, signature] = parts
  if (tokenEventId !== eventId) return false

  const expiresAt = Number.parseInt(expiresAtRaw, 10)
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false

  const payload = `${tokenEventId}.${expiresAtRaw}`
  const expected = createHmac('sha256', getPhotographerTokenSecret()).update(payload).digest('base64url')

  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  } catch {
    return false
  }
}

export function readPhotographerAccessToken(
  request: Request,
  body?: Record<string, unknown> | null,
) {
  if (body && typeof body.accessToken === 'string') {
    return body.accessToken.trim()
  }

  const url = new URL(request.url)
  return url.searchParams.get('accessToken')?.trim() ?? ''
}

export async function requirePhotographerAccess(params: {
  eventId: string
  pinHash: string | null | undefined
  accessToken?: string | null
}) {
  if (!params.pinHash) return

  const token = params.accessToken?.trim() ?? ''
  if (!token || !verifyPhotographerAccessToken(params.eventId, token)) {
    throw new Error('Photographer access denied. Enter the 6-digit event PIN.')
  }
}

export async function getPhotographerPinHash(eventId: string) {
  const event = await getPortalEventById(eventId)
  return event?.photographer_pin_hash ?? null
}
