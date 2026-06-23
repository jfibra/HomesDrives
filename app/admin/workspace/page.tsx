import { redirect } from 'next/navigation'

import { PORTAL_PATHS } from '@/lib/portals/constants'

export default function AdminWorkspaceRedirectPage() {
  redirect(PORTAL_PATHS.adminEvents)
}
