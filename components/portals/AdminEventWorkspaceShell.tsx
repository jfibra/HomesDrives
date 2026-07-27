import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import type { ReactNode } from 'react'

import EventFaceBackgroundScanner from '@/components/people/EventFaceBackgroundScanner'
import AdminWorkspaceNav from '@/components/portals/AdminWorkspaceNav'
import PortalFrame from '@/components/portals/PortalFrame'
import { countEventPhotos } from '@/lib/portals/event-photos'
import { countEventScannableImages } from '@/lib/server/event-face-processing'
import type { PortalEvent } from '@/lib/portals/types'

type AdminEventWorkspaceShellProps = {
  activeTab: 'folders' | 'people' | 'photographers' | 'photos'
  children: ReactNode
  event: PortalEvent
  fileCount?: number
  scannableImageCount?: number
}

export default async function AdminEventWorkspaceShell({
  activeTab,
  children,
  event,
  fileCount: fileCountProp,
  scannableImageCount: scannableImageCountProp,
}: AdminEventWorkspaceShellProps) {
  let fileCount = fileCountProp
  let scannableImageCount = scannableImageCountProp
  if (fileCount == null || scannableImageCount == null) {
    try {
      const [allFiles, scannable] = await Promise.all([
        fileCount == null ? countEventPhotos({ eventId: event.id }) : Promise.resolve(fileCount),
        scannableImageCount == null
          ? countEventScannableImages(event.id)
          : Promise.resolve(scannableImageCount),
      ])
      fileCount = allFiles
      scannableImageCount = scannable
    } catch {
      fileCount = fileCount ?? undefined
      scannableImageCount = scannableImageCount ?? undefined
    }
  }
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
      <AdminWorkspaceNav
        activeTab={activeTab}
        eventSlug={event.slug}
        fileCount={fileCount}
        scannableImageCount={scannableImageCount}
      />
      {children}
      <EventFaceBackgroundScanner eventId={event.id} />
    </PortalFrame>
  )
}
