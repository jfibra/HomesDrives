'use client'

import Link from 'next/link'
import { Camera, FolderOpen, Users } from 'lucide-react'

import {
  getAdminEventPeoplePath,
  getAdminEventPhotographersPath,
  getAdminEventWorkspacePath,
} from '@/lib/portals/constants'

type AdminWorkspaceNavProps = {
  activeTab: 'folders' | 'people' | 'photographers'
  eventSlug: string
}

export default function AdminWorkspaceNav({ activeTab, eventSlug }: AdminWorkspaceNavProps) {
  const tabs = [
    {
      id: 'folders' as const,
      label: 'Folders',
      href: getAdminEventWorkspacePath(eventSlug),
      icon: FolderOpen,
    },
    {
      id: 'photographers' as const,
      label: 'Photographers',
      href: getAdminEventPhotographersPath(eventSlug),
      icon: Camera,
    },
    {
      id: 'people' as const,
      label: 'People',
      href: getAdminEventPeoplePath(eventSlug),
      icon: Users,
    },
  ]

  return (
    <nav
      aria-label="Workspace sections"
      className="mb-5 grid grid-cols-3 gap-1 rounded-2xl border border-white/80 bg-white/75 p-1.5 shadow-sm backdrop-blur-sm sm:flex sm:gap-2"
    >
      {tabs.map((tab) => {
        const Icon = tab.icon
        const isActive = tab.id === activeTab

        return (
          <Link
            className={`inline-flex min-h-10 min-w-0 items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-xs font-semibold transition sm:gap-2 sm:px-4 sm:text-sm sm:flex-none ${
              isActive
                ? 'bg-[#10233f] text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-50 hover:text-[#10233f]'
            }`}
            href={tab.href}
            key={tab.id}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{tab.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
