import { redirect } from 'next/navigation'

import { getPublicPortalPath } from '@/lib/portals/constants'
import { DEFAULT_PORTAL_EVENT_SLUG } from '@/lib/portals/events'

export default function PublicPortalRedirectPage() {
  redirect(getPublicPortalPath(DEFAULT_PORTAL_EVENT_SLUG))
}
