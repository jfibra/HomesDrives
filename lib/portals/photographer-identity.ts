import { getPhotographerAccessStorageKey } from '@/lib/portals/photographer-access'

export const PORTAL_PHOTOGRAPHER_IDENTITY_PREFIX = 'temp-portals-photographer-identity:'

export function getPhotographerIdentityStorageKey(eventSlug: string) {
  return `${PORTAL_PHOTOGRAPHER_IDENTITY_PREFIX}${eventSlug}`
}

export type StoredPhotographerIdentity = {
  fullName: string
  id: string
}

export function readStoredPhotographerIdentity(eventSlug: string): StoredPhotographerIdentity | null {
  if (typeof window === 'undefined') return null

  const raw = window.localStorage.getItem(getPhotographerIdentityStorageKey(eventSlug))?.trim()
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const id = typeof parsed.id === 'string' ? parsed.id.trim() : ''
    const fullName = typeof parsed.fullName === 'string' ? parsed.fullName.trim() : ''
    if (!id || !fullName) return null
    return { id, fullName }
  } catch {
    return null
  }
}

export function writeStoredPhotographerIdentity(eventSlug: string, identity: StoredPhotographerIdentity) {
  window.localStorage.setItem(getPhotographerIdentityStorageKey(eventSlug), JSON.stringify(identity))
}

export function clearStoredPhotographerIdentity(eventSlug: string) {
  window.localStorage.removeItem(getPhotographerIdentityStorageKey(eventSlug))
}

export function readPhotographerIdFromRequest(
  request: Request,
  body?: Record<string, unknown> | null,
) {
  if (body && typeof body.photographerId === 'string') {
    return body.photographerId.trim()
  }

  const url = new URL(request.url)
  return url.searchParams.get('photographerId')?.trim() ?? ''
}

export function resolvePhotographerAccessToken(eventSlug: string, stateToken = '') {
  const trimmed = stateToken.trim()
  if (trimmed) return trimmed
  if (typeof window === 'undefined') return ''
  return window.localStorage.getItem(getPhotographerAccessStorageKey(eventSlug))?.trim() ?? ''
}

export function resolvePhotographerSession(eventSlug: string, state: {
  accessToken?: string
  photographerId?: string
}) {
  const storedIdentity = readStoredPhotographerIdentity(eventSlug)
  return {
    accessToken: resolvePhotographerAccessToken(eventSlug, state.accessToken),
    photographerId: state.photographerId?.trim() || storedIdentity?.id || '',
  }
}

export function isPhotographerPinError(message: string) {
  return /access denied|incorrect pin|6-digit event pin/i.test(message)
}
