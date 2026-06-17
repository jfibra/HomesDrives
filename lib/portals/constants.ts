import { getPublicAppOrigin } from '@/lib/app-url'

export const PORTAL_PATHS = {
  admin: '/admin',
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
