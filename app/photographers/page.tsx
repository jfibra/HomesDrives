import { redirect } from 'next/navigation'

import { DEFAULT_PORTAL_EVENT_SLUG } from '@/lib/portals/events'
import { getPhotographerPortalPath } from '@/lib/portals/constants'

export default function PhotographersPortalRedirectPage() {
  redirect(getPhotographerPortalPath(DEFAULT_PORTAL_EVENT_SLUG))
}
