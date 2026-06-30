'use client'

import Link from 'next/link'
import { FolderOpen, Users } from 'lucide-react'

import {
  getAdminEventPeoplePath,
  getAdminEventWorkspacePath,
} from '@/lib/portals/constants'

type AdminWorkspaceNavProps = {
  activeTab: 'folders' | 'people'
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
      id: 'people' as const,
      label: 'People',
      href: getAdminEventPeoplePath(eventSlug),
      icon: Users,
    },
  ]

  return (
    <nav
      aria-label="Workspace sections"
      className="mb-5 flex flex-wrap gap-2 rounded-2xl border border-white/80 bg-white/75 p-1.5 shadow-sm backdrop-blur-sm"
    >
      {tabs.map((tab) => {
        const Icon = tab.icon
        const isActive = tab.id === activeTab

        return (
          <Link
            className={`inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition sm:flex-none ${
              isActive
                ? 'bg-[#10233f] text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-50 hover:text-[#10233f]'
            }`}
            href={tab.href}
            key={tab.id}
          >
            <Icon className="h-4 w-4" />
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
