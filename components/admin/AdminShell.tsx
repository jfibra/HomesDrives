'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  BarChart3,
  ClipboardList,
  FilePlus2,
  LogOut,
  Menu,
  Shield,
  Users,
} from 'lucide-react'

type AdminContext = {
  code: string
  fullName: string
  firstName: string
  email: string
  role: 'admin' | 'media' | 'customer'
}

type CheckState = 'pending' | 'authorized' | 'unauthorized'

function readAdminContext(): AdminContext | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem('homes-admin-context')
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<AdminContext>
    if (!parsed.code || !parsed.email || parsed.role !== 'admin') return null
    return parsed as AdminContext
  } catch {
    return null
  }
}

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? ''
  const router = useRouter()
  const [checkState, setCheckState] = useState<CheckState>('pending')
  const [admin, setAdmin] = useState<AdminContext | null>(null)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  useEffect(() => {
    const ctx = readAdminContext()
    if (ctx) {
      setAdmin(ctx)
      setCheckState('authorized')
    } else {
      setCheckState('unauthorized')
    }
  }, [])

  function handleLogout() {
    if (admin?.code) {
      window.localStorage.removeItem(`homes-albums-auth:${admin.code}`)
    }
    window.localStorage.removeItem('homes-admin-context')
    router.push('/')
  }

  if (checkState === 'pending') {
    return (
      <div
        className="flex min-h-screen min-w-0 items-center justify-center overflow-x-hidden"
        style={{ backgroundColor: 'var(--ds-surface)' }}
      >
        <div className="text-sm" style={{ color: 'var(--ds-on-surface-variant)' }}>
          Loading admin shell...
        </div>
      </div>
    )
  }

  if (checkState === 'unauthorized' || !admin) {
    return (
      <div
        className="flex min-h-screen min-w-0 items-center justify-center overflow-x-hidden px-4"
        style={{ backgroundColor: 'var(--ds-surface)' }}
      >
        <div
          className="w-full max-w-md rounded-2xl border bg-white p-8 text-center shadow-lg"
          style={{ borderColor: 'var(--ds-outline-variant)' }}
        >
          <div
            className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl"
            style={{ backgroundColor: 'var(--ds-error-container)', color: 'var(--ds-error)' }}
          >
            <Shield className="h-7 w-7" />
          </div>
          <h1
            className="mt-4 text-xl font-bold"
            style={{ color: 'var(--ds-on-surface)', fontFamily: 'var(--font-noto-serif)' }}
          >
            Admin sign-in required
          </h1>
          <p
            className="mt-2 text-sm"
            style={{ color: 'var(--ds-on-surface-variant)' }}
          >
            This area is restricted to admin accounts. Sign in through the admin
            console first, then return here.
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <Link
              className="rounded-lg px-4 py-2 text-sm font-semibold transition-all hover:opacity-90 active:scale-95"
              href="/"
              style={{
                backgroundColor: 'var(--ds-primary)',
                color: 'var(--ds-on-primary)',
              }}
            >
              Go to home
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const initials = (admin.firstName?.[0] ?? 'A').toUpperCase()
  const adminCodeHref = `/${admin.code}`

  const navItems: Array<{
    label: string
    href: string
    icon: React.ReactNode
    matcher: (path: string) => boolean
    section?: 'main' | 'questionnaires'
  }> = [
    {
      label: 'Overview',
      href: adminCodeHref,
      icon: <BarChart3 className="h-4 w-4" />,
      matcher: (p) => p === adminCodeHref,
      section: 'main',
    },
    {
      label: 'User Management',
      href: `${adminCodeHref}?view=users`,
      icon: <Users className="h-4 w-4" />,
      matcher: (p) => p === adminCodeHref && pathname.includes('users'),
      section: 'main',
    },
    {
      label: 'All Questionnaires',
      href: '/questionnaires',
      icon: <ClipboardList className="h-4 w-4" />,
      matcher: (p) => p === '/questionnaires' || p.startsWith('/questionnaires/') && !p.endsWith('/new'),
      section: 'questionnaires',
    },
    {
      label: 'Questionnaire Builder',
      href: '/questionnaires/new',
      icon: <FilePlus2 className="h-4 w-4" />,
      matcher: (p) => p === '/questionnaires/new',
      section: 'questionnaires',
    },
  ]

  return (
    <div
      className="flex min-h-screen min-w-0 flex-col overflow-x-hidden"
      style={{ backgroundColor: 'var(--ds-surface)', color: 'var(--ds-on-surface)' }}
    >
      {/* Top bar */}
      <header
        className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b bg-white/90 px-4 backdrop-blur sm:gap-3 sm:px-6"
        style={{ borderColor: 'rgba(196,198,207,0.4)' }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          <button
            aria-label="Toggle sidebar"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-gray-100 md:hidden"
            onClick={() => setIsSidebarOpen((s) => !s)}
            type="button"
          >
            <Menu className="h-5 w-5" style={{ color: 'var(--ds-on-surface-variant)' }} />
          </button>

          <Link className="flex min-w-0 items-center gap-2" href={adminCodeHref}>
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
              style={{ backgroundColor: 'var(--ds-primary)', color: 'var(--ds-on-primary)' }}
            >
              <Shield className="h-4 w-4" aria-hidden />
            </div>
            <div className="min-w-0 leading-tight">
              <span
                className="block truncate text-sm font-semibold"
                style={{ fontFamily: 'var(--font-noto-serif)', color: 'var(--ds-on-surface)' }}
              >
                Admin Console
              </span>
              <span
                className="block truncate text-[10px] font-semibold uppercase tracking-[0.12em]"
                style={{ color: 'var(--ds-on-surface-variant)' }}
              >
                Homes Albums Studio
              </span>
            </div>
          </Link>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <div className="hidden min-w-0 max-w-[8rem] text-right sm:block md:max-w-[11rem] lg:max-w-[14rem]">
            <div className="truncate text-xs font-semibold">{admin.fullName}</div>
            <div
              className="truncate text-[10px]"
              style={{ color: 'var(--ds-on-surface-variant)' }}
            >
              {admin.email}
            </div>
          </div>
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold"
            style={{
              backgroundColor: 'var(--ds-primary)',
              color: 'var(--ds-on-primary)',
            }}
            title={admin.fullName}
          >
            {initials}
          </div>
          <button
            aria-label="Sign out"
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition-colors hover:bg-gray-50 sm:px-3"
            onClick={handleLogout}
            style={{
              borderColor: 'var(--ds-outline-variant)',
              color: 'var(--ds-on-surface-variant)',
            }}
            title="Sign out"
            type="button"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>

      <div className="flex flex-1">
        {/* Mobile backdrop */}
        {isSidebarOpen ? (
          <div
            className="fixed inset-0 z-20 bg-black/30 md:hidden"
            onClick={() => setIsSidebarOpen(false)}
          />
        ) : null}

        {/* Sidebar */}
        <aside
          className={`fixed inset-y-0 left-0 top-16 z-30 flex w-60 shrink-0 flex-col border-r bg-white transition-transform md:static md:translate-x-0 ${
            isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
          style={{ borderColor: 'rgba(196,198,207,0.4)' }}
        >
          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
            {navItems
              .filter((item) => item.section === 'main')
              .map((item) => (
                <ShellNavItem
                  key={item.href}
                  active={item.matcher(pathname)}
                  href={item.href}
                  icon={item.icon}
                  label={item.label}
                  onNavigate={() => setIsSidebarOpen(false)}
                />
              ))}

            <div
              className="my-2 border-t"
              style={{ borderColor: 'var(--ds-outline-variant)' }}
            />
            <div
              className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: 'var(--ds-on-surface-variant)' }}
            >
              Questionnaires
            </div>

            {navItems
              .filter((item) => item.section === 'questionnaires')
              .map((item) => (
                <ShellNavItem
                  key={item.href}
                  active={item.matcher(pathname)}
                  href={item.href}
                  icon={item.icon}
                  label={item.label}
                  onNavigate={() => setIsSidebarOpen(false)}
                />
              ))}
          </nav>

          {/* Logout button — pinned to the bottom of the sidebar */}
          <div
            className="border-t p-3"
            style={{ borderColor: 'var(--ds-outline-variant)' }}
          >
            <button
              className="flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-semibold transition-colors hover:bg-slate-50"
              onClick={handleLogout}
              style={{
                borderColor: 'var(--ds-outline-variant)',
                color: 'var(--ds-error)',
              }}
              type="button"
            >
              <LogOut className="h-4 w-4" />
              <span>Sign out</span>
            </button>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  )
}

function ShellNavItem({
  active,
  href,
  icon,
  label,
  onNavigate,
}: {
  active: boolean
  href: string
  icon: React.ReactNode
  label: string
  onNavigate?: () => void
}) {
  return (
    <Link
      className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition-colors"
      href={href}
      onClick={onNavigate}
      style={{
        backgroundColor: active ? 'var(--ds-surface-container)' : 'transparent',
        color: active ? 'var(--ds-primary)' : 'var(--ds-on-surface-variant)',
        fontWeight: active ? 600 : 500,
      }}
    >
      <span className="shrink-0">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
    </Link>
  )
}
