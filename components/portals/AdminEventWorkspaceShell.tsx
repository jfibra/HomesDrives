import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import type { ReactNode } from 'react'

import EventFaceBackgroundScanner from '@/components/people/EventFaceBackgroundScanner'
import AdminWorkspaceNav from '@/components/portals/AdminWorkspaceNav'
import PortalFrame from '@/components/portals/PortalFrame'
import type { PortalEvent } from '@/lib/portals/types'

type AdminEventWorkspaceShellProps = {
  activeTab: 'folders' | 'people' | 'photographers'
  children: ReactNode
  event: PortalEvent
}

export default function AdminEventWorkspaceShell({
  activeTab,
  children,
  event,
}: AdminEventWorkspaceShellProps) {
  return (
    <PortalFrame
      actions={
        <Link
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          href="/admin/events"
        >
          <ChevronLeft className="h-4 w-4" />
          All events
        </Link>
      }
      badge="Admin Portal"
      subtitle={`Managing folders and photos for ${event.name}.`}
      title={event.name}
      variant="admin"
    >
      <AdminWorkspaceNav activeTab={activeTab} eventSlug={event.slug} />
      {children}
      <EventFaceBackgroundScanner eventId={event.id} />
    </PortalFrame>
  )
}
