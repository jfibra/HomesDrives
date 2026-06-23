import { getPublicAppOrigin } from '@/lib/app-url'

import { DEFAULT_PORTAL_EVENT_SLUG } from './events'

export const PORTAL_API_BASE = '/api/portal-api' as const

export const PORTAL_PATHS = {
  admin: '/admin',
  adminEvents: '/admin/events',
  adminWorkspace: '/admin/workspace',
  photographers: '/photographers',
  public: '/public',
} as const

export const PHOTOGRAPHER_PORTAL_CODE = 'PHOTOGRAPHER-PORTAL'
export const PUBLIC_PORTAL_CODE = 'PUBLIC-SUBMISSIONS'
export const ADMIN_PORTAL_CODE = 'ALB-ADMIN-DRIVE-0001'

export const STATIC_ADMIN_CREDENTIALS = {
  email: 'admin@drive.ph',
  password: 'admin@1234!',
} as const

export const PORTAL_UPLOADER_CODES = [PHOTOGRAPHER_PORTAL_CODE, PUBLIC_PORTAL_CODE] as const

export const PORTAL_ADMIN_SESSION_KEY = 'temp-portals-admin-code'

export function getPortalUrl(path: keyof typeof PORTAL_PATHS) {
  return `${getPublicAppOrigin()}${PORTAL_PATHS[path]}`
}

export function getAllPortalUrls() {
  return {
    admin: getPortalUrl('admin'),
    photographers: getPortalUrl('photographers'),
    public: getPortalUrl('public'),
  }
}

export function getPublicPortalFolderUrl(
  folderId: string,
  eventSlug = DEFAULT_PORTAL_EVENT_SLUG,
  origin = getPublicAppOrigin(),
) {
  const url = new URL(getPublicPortalPath(eventSlug), origin)
  url.searchParams.set('folder', folderId)
  return url.toString()
}

export function getPhotographerPortalPath(eventSlug: string) {
  return `${PORTAL_PATHS.photographers}/${encodeURIComponent(eventSlug)}`
}

export function getPublicPortalPath(eventSlug: string) {
  return `${PORTAL_PATHS.public}/${encodeURIComponent(eventSlug)}`
}

export function getAdminEventWorkspacePath(eventSlug: string) {
  return `${PORTAL_PATHS.adminEvents}/${encodeURIComponent(eventSlug)}/workspace`
}

export function getPhotographerPortalUrl(eventSlug: string, origin = getPublicAppOrigin()) {
  return `${origin}${getPhotographerPortalPath(eventSlug)}`
}

export function getPublicPortalUrl(eventSlug: string, origin = getPublicAppOrigin()) {
  return `${origin}${getPublicPortalPath(eventSlug)}`
}

export function getFacebookShareUrl(shareUrl: string) {
  return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`
}

export function getMessengerShareUrl(shareUrl: string) {
  return `https://www.facebook.com/dialog/send?link=${encodeURIComponent(shareUrl)}&redirect_uri=${encodeURIComponent(shareUrl)}`
}
