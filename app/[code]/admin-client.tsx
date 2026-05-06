'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  BarChart3,
  Calendar,
  Camera,
  ClipboardList,
  Edit3,
  FilePlus2,
  Folder,
  HardDrive,
  Image as ImageIcon,
  LogOut,
  Mail,
  Menu,
  Phone,
  Plus,
  Search,
  Shield,
  Trash2,
  Users,
  X,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

export type AdminUser = {
  id: string
  fullName: string
  firstName: string
  email: string
  code: string
  areaFocused: string
}

type AlbumUserRole = 'admin' | 'media' | 'customer'

const ROLE_LABELS: Record<AlbumUserRole, string> = {
  admin: 'Admin',
  media: 'Media',
  customer: 'Customer Drive',
}

type AdminUserRow = {
  id: number
  first_name: string
  last_name: string
  full_name: string
  status: string
  area_focused: string
  email: string
  phone_number: string
  code: string
  role: AlbumUserRole
  created_at: string
  updated_at: string
  photo_count?: number
  folder_count?: number
}

type AdminStats = {
  totals: {
    users: number
    activeUsers: number
    inactiveUsers: number
    suspendedUsers: number
    folders: number
    activeFolders: number
    archivedFolders: number
    photos: number
    totalStorageBytes: number
  }
  topUploaders: { code: string; name: string; photos: number }[]
  recentUploads: {
    id: string
    image_url: string
    original_file_name: string
    uploader_name: string
    uploader_code: string | null
    created_at: string
    place_name: string | null
  }[]
  uploadsByDay: { day: string; count: number }[]
}

type AdminView = 'overview' | 'users'

type UserFormState = {
  id: number | null
  firstName: string
  lastName: string
  email: string
  phoneNumber: string
  areaFocused: string
  password: string
  role: AlbumUserRole
  status: 'active' | 'inactive' | 'suspended'
}

const EMPTY_FORM: UserFormState = {
  id: null,
  firstName: '',
  lastName: '',
  email: '',
  phoneNumber: '',
  areaFocused: '',
  password: '',
  role: 'media',
  status: 'active',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const v = bytes / 1024 ** i
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`
}

function formatDate(iso: string) {
  if (!iso) return ''
  return new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(iso),
  )
}

function formatDay(iso: string) {
  return new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric' }).format(new Date(iso))
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminClient({ user }: { user: AdminUser }) {
  // Auth state (same pattern as DashboardClient)
  const authStorageKey = `homes-albums-auth:${user.code}`
  const [isAuthChecked, setIsAuthChecked] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [emailInput, setEmailInput] = useState('')
  const [passwordInput, setPasswordInput] = useState('')
  const [authError, setAuthError] = useState('')
  const [isAuthenticating, setIsAuthenticating] = useState(false)

  // App state
  const [activeView, setActiveView] = useState<AdminView>('overview')
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  // Stats
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [isLoadingStats, setIsLoadingStats] = useState(false)
  const [statsError, setStatsError] = useState('')

  // Users
  const [users, setUsers] = useState<AdminUserRow[]>([])
  const [isLoadingUsers, setIsLoadingUsers] = useState(false)
  const [usersError, setUsersError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  // User form modal
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create')
  const [formState, setFormState] = useState<UserFormState>(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [isSavingUser, setIsSavingUser] = useState(false)

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<AdminUserRow | null>(null)
  const [isDeletingUser, setIsDeletingUser] = useState(false)

  // ─── Auth ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    const isLoggedIn = localStorage.getItem(authStorageKey) === '1'
    setIsAuthenticated(isLoggedIn)
    setIsAuthChecked(true)

    // Refresh the global admin context if we're authenticated but it's missing
    // (e.g. user signed in before this feature shipped, or cleared the key).
    if (isLoggedIn && !localStorage.getItem('homes-admin-context')) {
      localStorage.setItem(
        'homes-admin-context',
        JSON.stringify({
          code: user.code,
          fullName: user.fullName,
          firstName: user.firstName,
          email: user.email,
          role: 'admin',
        }),
      )
    }
  }, [authStorageKey, user.code, user.email, user.firstName, user.fullName])

  async function handleLogin(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault()

    if (!emailInput.trim() || !passwordInput.trim()) {
      setAuthError('Please enter your admin email and password.')
      return
    }

    setIsAuthenticating(true)
    setAuthError('')

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: emailInput.trim().toLowerCase(),
          password: passwordInput,
          code: user.code,
        }),
      })

      const data = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(data?.error || 'Invalid admin credentials.')
      }

      if (data?.user?.role !== 'admin') {
        throw new Error('This account is not an admin account.')
      }

      localStorage.setItem(authStorageKey, '1')
      // Persist a global admin context so other admin-only pages
      // (like /questionnaires) can render the admin shell consistently.
      localStorage.setItem(
        'homes-admin-context',
        JSON.stringify({
          code: user.code,
          fullName: data.user.fullName ?? user.fullName,
          firstName: user.firstName,
          email: user.email,
          role: data.user.role,
        }),
      )
      setIsAuthenticated(true)
      setEmailInput('')
      setPasswordInput('')
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Unable to log in.')
      setIsAuthenticated(false)
    } finally {
      setIsAuthenticating(false)
    }
  }

  function handleLogout() {
    localStorage.removeItem(authStorageKey)
    localStorage.removeItem('homes-admin-context')
    setIsAuthenticated(false)
  }

  // ─── Data loading ───────────────────────────────────────────────────────────

  const loadStats = useCallback(async () => {
    setIsLoadingStats(true)
    setStatsError('')
    try {
      const r = await fetch(`/api/admin/stats?adminCode=${encodeURIComponent(user.code)}`)
      const data = await r.json()
      if (!r.ok) throw new Error(data?.error || 'Unable to load stats.')
      setStats(data.stats)
    } catch (error) {
      setStatsError(error instanceof Error ? error.message : 'Unable to load stats.')
    } finally {
      setIsLoadingStats(false)
    }
  }, [user.code])

  const loadUsers = useCallback(async () => {
    setIsLoadingUsers(true)
    setUsersError('')
    try {
      const r = await fetch(`/api/admin/users?adminCode=${encodeURIComponent(user.code)}`)
      const data = await r.json()
      if (!r.ok) throw new Error(data?.error || 'Unable to load users.')
      setUsers(Array.isArray(data.users) ? data.users : [])
    } catch (error) {
      setUsersError(error instanceof Error ? error.message : 'Unable to load users.')
    } finally {
      setIsLoadingUsers(false)
    }
  }, [user.code])

  useEffect(() => {
    if (!isAuthenticated) return
    void loadStats()
    void loadUsers()
  }, [isAuthenticated, loadStats, loadUsers])

  // ─── User CRUD ──────────────────────────────────────────────────────────────

  function openCreateForm() {
    setFormMode('create')
    setFormState(EMPTY_FORM)
    setFormError('')
    setIsFormOpen(true)
  }

  function openEditForm(row: AdminUserRow) {
    setFormMode('edit')
    setFormState({
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email,
      phoneNumber: row.phone_number,
      areaFocused: row.area_focused,
      password: '',
      role: row.role,
      status: row.status as UserFormState['status'],
    })
    setFormError('')
    setIsFormOpen(true)
  }

  async function handleSaveUser(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    setFormError('')

    const required = ['firstName', 'lastName', 'email', 'phoneNumber', 'areaFocused'] as const
    for (const field of required) {
      if (!formState[field].trim()) {
        setFormError(`Please fill in: ${field}`)
        return
      }
    }
    if (formMode === 'create' && (!formState.password || formState.password.length < 8)) {
      setFormError('Password must be at least 8 characters.')
      return
    }
    if (formMode === 'edit' && formState.password && formState.password.length < 8) {
      setFormError('Password must be at least 8 characters.')
      return
    }

    setIsSavingUser(true)
    try {
      const payload: Record<string, unknown> = {
        adminCode: user.code,
        firstName: formState.firstName,
        lastName: formState.lastName,
        email: formState.email,
        phoneNumber: formState.phoneNumber,
        areaFocused: formState.areaFocused,
        role: formState.role,
        status: formState.status,
      }
      if (formState.password) payload.password = formState.password

      const url =
        formMode === 'create' ? '/api/admin/users' : `/api/admin/users/${formState.id}`
      const method = formMode === 'create' ? 'POST' : 'PATCH'

      const r = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await r.json().catch(() => null)
      if (!r.ok) throw new Error(data?.error || 'Unable to save user.')

      setIsFormOpen(false)
      setFormState(EMPTY_FORM)
      await Promise.all([loadUsers(), loadStats()])
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Unable to save user.')
    } finally {
      setIsSavingUser(false)
    }
  }

  async function handleDeleteUser() {
    if (!deleteTarget) return
    setIsDeletingUser(true)
    try {
      const r = await fetch(
        `/api/admin/users/${deleteTarget.id}?adminCode=${encodeURIComponent(user.code)}`,
        { method: 'DELETE' },
      )
      const data = await r.json().catch(() => null)
      if (!r.ok) throw new Error(data?.error || 'Unable to delete user.')
      setDeleteTarget(null)
      await Promise.all([loadUsers(), loadStats()])
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Unable to delete user.')
    } finally {
      setIsDeletingUser(false)
    }
  }

  // ─── Filtered users ─────────────────────────────────────────────────────────

  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return users
    return users.filter((u) => {
      return (
        u.full_name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.code.toLowerCase().includes(q) ||
        u.area_focused.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q) ||
        u.status.toLowerCase().includes(q)
      )
    })
  }, [users, searchQuery])

  const initials = (user.firstName?.[0] ?? 'A').toUpperCase()

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (!isAuthChecked) {
    return (
      <div
        className="flex min-h-screen items-center justify-center"
        style={{ backgroundColor: 'var(--ds-surface)' }}
      >
        <div className="text-sm" style={{ color: 'var(--ds-on-surface-variant)' }}>
          Loading admin console...
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div
        className="flex min-h-screen items-center justify-center px-4"
        style={{ backgroundColor: 'var(--ds-surface)' }}
      >
        <main className="w-full max-w-md">
          <div className="mb-8 flex flex-col items-center gap-4">
            <div
              className="flex h-16 w-16 items-center justify-center rounded-2xl"
              style={{
                backgroundColor: 'var(--ds-primary)',
                color: 'var(--ds-on-primary)',
              }}
            >
              <Shield className="h-8 w-8" />
            </div>
            <div className="text-center">
              <h1
                className="text-2xl font-bold"
                style={{ color: 'var(--ds-on-surface)', fontFamily: 'var(--font-noto-serif)' }}
              >
                Admin Console
              </h1>
              <p
                className="mt-1 text-sm"
                style={{ color: 'var(--ds-on-surface-variant)' }}
              >
                Sign in to manage users and view statistics
              </p>
            </div>
          </div>

          <form
            className="flex flex-col gap-4 rounded-2xl border bg-white p-6 shadow-lg"
            onSubmit={handleLogin}
            style={{ borderColor: 'var(--ds-outline-variant)' }}
          >
            <div className="flex flex-col gap-2">
              <label
                className="text-xs font-semibold uppercase tracking-wider"
                htmlFor="admin-email"
                style={{ color: 'var(--ds-on-surface-variant)' }}
              >
                Admin Email
              </label>
              <div className="relative">
                <Mail
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
                  style={{ color: 'var(--ds-outline)' }}
                />
                <input
                  autoComplete="username"
                  className="w-full rounded-lg border py-3 pl-10 pr-4 text-sm outline-none transition-all"
                  id="admin-email"
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="admin@homesalbums.local"
                  style={{
                    backgroundColor: 'var(--ds-surface-container-low)',
                    borderColor: 'var(--ds-outline-variant)',
                    color: 'var(--ds-on-surface)',
                  }}
                  type="email"
                  value={emailInput}
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label
                className="text-xs font-semibold uppercase tracking-wider"
                htmlFor="admin-password"
                style={{ color: 'var(--ds-on-surface-variant)' }}
              >
                Password
              </label>
              <input
                autoComplete="current-password"
                className="w-full rounded-lg border px-4 py-3 text-sm outline-none transition-all"
                id="admin-password"
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="••••••••••••"
                style={{
                  backgroundColor: 'var(--ds-surface-container-low)',
                  borderColor: 'var(--ds-outline-variant)',
                  color: 'var(--ds-on-surface)',
                }}
                type="password"
                value={passwordInput}
              />
            </div>

            {authError ? (
              <p
                className="rounded-lg border px-3 py-2 text-xs"
                style={{
                  backgroundColor: 'var(--ds-error-container)',
                  borderColor: 'rgba(186,26,26,0.2)',
                  color: 'var(--ds-error)',
                }}
              >
                {authError}
              </p>
            ) : null}

            <button
              className="flex items-center justify-center gap-2 rounded-lg py-3 text-sm font-semibold uppercase tracking-wider transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isAuthenticating || !emailInput.trim() || !passwordInput.trim()}
              style={{
                backgroundColor: 'var(--ds-primary)',
                color: 'var(--ds-on-primary)',
              }}
              type="submit"
            >
              {isAuthenticating ? 'Verifying...' : 'Access Admin Console'}
              {!isAuthenticating && <ArrowRight className="h-4 w-4" />}
            </button>

            <div className="text-center">
              <span className="text-[11px]" style={{ color: 'var(--ds-on-surface-variant)' }}>
                Code: <span className="font-mono">{user.code}</span>
              </span>
            </div>
          </form>
        </main>
      </div>
    )
  }

  // ── Authenticated ─────────────────────────────────────────────────────────

  const t = stats?.totals
  const maxDayCount = Math.max(1, ...(stats?.uploadsByDay.map((d) => d.count) ?? [1]))

  return (
    <div
      className="flex min-h-screen flex-col"
      style={{ backgroundColor: 'var(--ds-surface)', color: 'var(--ds-on-surface)' }}
    >
      {/* ─── Top Bar ─────────────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b bg-white/90 px-4 backdrop-blur sm:px-6"
        style={{ borderColor: 'rgba(196,198,207,0.4)' }}
      >
        <button
          aria-label="Toggle sidebar"
          className="flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-gray-100 md:hidden"
          onClick={() => setIsSidebarOpen((s) => !s)}
          type="button"
        >
          <Menu className="h-5 w-5" style={{ color: 'var(--ds-on-surface-variant)' }} />
        </button>

        <div className="flex items-center gap-2">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{
              backgroundColor: 'var(--ds-primary)',
              color: 'var(--ds-on-primary)',
            }}
          >
            <Shield className="h-4 w-4" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold">Admin Console</span>
            <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--ds-on-surface-variant)' }}>
              Homes Albums Studio
            </span>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <div className="text-xs font-semibold">{user.fullName}</div>
            <div className="text-[10px]" style={{ color: 'var(--ds-on-surface-variant)' }}>
              {user.email}
            </div>
          </div>
          <div
            className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold"
            style={{
              backgroundColor: 'var(--ds-primary)',
              color: 'var(--ds-on-primary)',
            }}
          >
            {initials}
          </div>
          <button
            className="flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors hover:bg-gray-50"
            onClick={handleLogout}
            style={{ borderColor: 'var(--ds-outline-variant)', color: 'var(--ds-on-surface-variant)' }}
            type="button"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>

      <div className="flex flex-1">
        {/* ─── Sidebar ─────────────────────────────────────────────────── */}
        {isSidebarOpen ? (
          <div
            className="fixed inset-0 z-20 bg-black/30 md:hidden"
            onClick={() => setIsSidebarOpen(false)}
          />
        ) : null}

        <aside
          className={`fixed inset-y-0 left-0 top-16 z-30 flex w-60 shrink-0 flex-col border-r bg-white transition-transform md:static md:translate-x-0 ${
            isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
          style={{ borderColor: 'rgba(196,198,207,0.4)' }}
        >
          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
            <NavItem
              active={activeView === 'overview'}
              icon={<BarChart3 className="h-4 w-4" />}
              label="Overview"
              onClick={() => {
                setActiveView('overview')
                setIsSidebarOpen(false)
              }}
            />
            <NavItem
              active={activeView === 'users'}
              icon={<Users className="h-4 w-4" />}
              label="User Management"
              badge={users.length}
              onClick={() => {
                setActiveView('users')
                setIsSidebarOpen(false)
              }}
            />

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

            <NavItem
              active={false}
              icon={<ClipboardList className="h-4 w-4" />}
              label="All Questionnaires"
              onClick={() => {
                setIsSidebarOpen(false)
                window.location.href = '/questionnaires'
              }}
            />
            <NavItem
              active={false}
              icon={<FilePlus2 className="h-4 w-4" />}
              label="Questionnaire Builder"
              onClick={() => {
                setIsSidebarOpen(false)
                window.location.href = '/questionnaires/new'
              }}
            />
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

        {/* ─── Main ────────────────────────────────────────────────────── */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          {activeView === 'overview' ? (
            <section className="mx-auto flex max-w-6xl flex-col gap-6">
              <div>
                <h1
                  className="text-2xl font-bold sm:text-3xl"
                  style={{ fontFamily: 'var(--font-noto-serif)' }}
                >
                  Overview
                </h1>
                <p className="mt-1 text-sm" style={{ color: 'var(--ds-on-surface-variant)' }}>
                  Real-time statistics across all album_users, folders, and uploads.
                </p>
              </div>

              {statsError ? (
                <div
                  className="rounded-lg border px-4 py-3 text-sm"
                  style={{
                    backgroundColor: 'var(--ds-error-container)',
                    borderColor: 'rgba(186,26,26,0.2)',
                    color: 'var(--ds-error)',
                  }}
                >
                  {statsError}
                </div>
              ) : null}

              {isLoadingStats && !stats ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="h-28 animate-pulse rounded-2xl border bg-white"
                      style={{ borderColor: 'var(--ds-outline-variant)' }}
                    />
                  ))}
                </div>
              ) : t ? (
                <>
                  {/* Stat cards */}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <StatCard
                      icon={<Users className="h-5 w-5" />}
                      label="Total Users"
                      value={t.users}
                      hint={`${t.activeUsers} active · ${t.suspendedUsers} suspended`}
                    />
                    <StatCard
                      icon={<Folder className="h-5 w-5" />}
                      label="Folders"
                      value={t.folders}
                      hint={`${t.activeFolders} active · ${t.archivedFolders} archived`}
                    />
                    <StatCard
                      icon={<ImageIcon className="h-5 w-5" />}
                      label="Photos"
                      value={t.photos}
                      hint="Across all uploaders"
                    />
                    <StatCard
                      icon={<HardDrive className="h-5 w-5" />}
                      label="Storage Used"
                      value={formatBytes(t.totalStorageBytes)}
                      hint="Sum of file sizes"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                    {/* Uploads per day */}
                    <Panel
                      className="lg:col-span-2"
                      icon={<Calendar className="h-4 w-4" />}
                      title="Uploads · Last 14 days"
                      action={
                        <span
                          className="text-[11px] font-semibold tabular-nums"
                          style={{ color: 'var(--ds-on-surface-variant)' }}
                        >
                          Total:{' '}
                          <span style={{ color: 'var(--ds-primary)' }}>
                            {(stats?.uploadsByDay ?? []).reduce((s, d) => s + d.count, 0)}
                          </span>
                        </span>
                      }
                    >
                      {(() => {
                        const days = stats?.uploadsByDay ?? []
                        const totalForPeriod = days.reduce((s, d) => s + d.count, 0)

                        if (totalForPeriod === 0) {
                          return (
                            <div
                              className="flex h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-center"
                              style={{
                                borderColor: 'var(--ds-outline-variant)',
                                color: 'var(--ds-on-surface-variant)',
                              }}
                            >
                              <Calendar className="h-6 w-6 opacity-50" />
                              <div className="text-sm font-semibold">No uploads in the last 14 days</div>
                              <div className="text-[11px]">
                                {days[0] ? `Tracking from ${formatDay(days[0].day)} to today` : ''}
                              </div>
                            </div>
                          )
                        }

                        return (
                          <>
                            <div className="relative">
                              {/* Y-axis max label */}
                              <span
                                className="absolute -left-1 -top-1 text-[10px] tabular-nums"
                                style={{ color: 'var(--ds-on-surface-variant)' }}
                              >
                                {maxDayCount}
                              </span>
                              {/* Baseline grid */}
                              <div
                                className="absolute inset-x-0 bottom-0 border-b"
                                style={{ borderColor: 'var(--ds-outline-variant)' }}
                              />
                              <div
                                className="absolute inset-x-0 top-1/2 border-b border-dashed"
                                style={{ borderColor: 'var(--ds-outline-variant)', opacity: 0.5 }}
                              />

                              <div className="relative flex h-40 items-end gap-1.5 pl-5">
                                {days.map((d) => {
                                  const heightPct =
                                    d.count > 0
                                      ? Math.max(6, (d.count / maxDayCount) * 100)
                                      : 0
                                  return (
                                    <div
                                      key={d.day}
                                      className="group relative flex flex-1 flex-col items-center justify-end"
                                    >
                                      {d.count > 0 ? (
                                        <span
                                          className="mb-1 text-[10px] font-bold tabular-nums"
                                          style={{ color: 'var(--ds-primary)' }}
                                        >
                                          {d.count}
                                        </span>
                                      ) : null}
                                      <div
                                        className="w-full rounded-t-md transition-all"
                                        style={{
                                          backgroundColor:
                                            d.count > 0
                                              ? 'var(--ds-primary)'
                                              : 'var(--ds-surface-container-high)',
                                          height: d.count > 0 ? `${heightPct}%` : '4px',
                                        }}
                                        title={`${formatDay(d.day)}: ${d.count} uploads`}
                                      />
                                    </div>
                                  )
                                })}
                              </div>
                            </div>

                            {/* X-axis day labels (show every other day) */}
                            <div
                              className="mt-1 flex gap-1.5 pl-5 text-[10px] tabular-nums"
                              style={{ color: 'var(--ds-on-surface-variant)' }}
                            >
                              {days.map((d, i) => (
                                <div key={d.day} className="flex-1 text-center">
                                  {i % 2 === 0 ? formatDay(d.day) : ''}
                                </div>
                              ))}
                            </div>
                          </>
                        )
                      })()}
                    </Panel>

                    {/* Top uploaders */}
                    <Panel icon={<Camera className="h-4 w-4" />} title="Top Uploaders">
                      {stats?.topUploaders.length ? (
                        <ul className="flex flex-col gap-2.5">
                          {stats.topUploaders.map((u, idx) => (
                            <li
                              key={u.code}
                              className="flex items-center gap-3"
                            >
                              <span
                                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                                style={{
                                  backgroundColor:
                                    idx === 0
                                      ? 'var(--ds-primary)'
                                      : 'var(--ds-surface-container)',
                                  color:
                                    idx === 0 ? 'var(--ds-on-primary)' : 'var(--ds-on-surface)',
                                }}
                              >
                                {idx + 1}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-semibold">{u.name}</div>
                                <div className="truncate text-[11px] font-mono" style={{ color: 'var(--ds-on-surface-variant)' }}>
                                  {u.code}
                                </div>
                              </div>
                              <div className="text-sm font-bold">{u.photos}</div>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm" style={{ color: 'var(--ds-on-surface-variant)' }}>
                          No uploads yet.
                        </p>
                      )}
                    </Panel>
                  </div>

                  {/* Recent uploads */}
                  <Panel icon={<ImageIcon className="h-4 w-4" />} title="Recent Uploads">
                    {stats?.recentUploads.length ? (
                      <ul className="flex flex-col divide-y" style={{ borderColor: 'var(--ds-outline-variant)' }}>
                        {stats.recentUploads.map((u) => (
                          <li key={u.id} className="flex items-center gap-3 py-2.5">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              alt={u.original_file_name}
                              className="h-10 w-10 shrink-0 rounded-md object-cover"
                              src={u.image_url}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium">{u.original_file_name}</div>
                              <div className="truncate text-[11px]" style={{ color: 'var(--ds-on-surface-variant)' }}>
                                {u.uploader_name}
                                {u.place_name ? ` · ${u.place_name}` : ''}
                              </div>
                            </div>
                            <div className="shrink-0 text-[11px]" style={{ color: 'var(--ds-on-surface-variant)' }}>
                              {formatDate(u.created_at)}
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm" style={{ color: 'var(--ds-on-surface-variant)' }}>
                        No uploads yet.
                      </p>
                    )}
                  </Panel>
                </>
              ) : null}
            </section>
          ) : (
            <section className="mx-auto flex max-w-6xl flex-col gap-6">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h1
                    className="text-2xl font-bold sm:text-3xl"
                    style={{ fontFamily: 'var(--font-noto-serif)' }}
                  >
                    User Management
                  </h1>
                  <p className="mt-1 text-sm" style={{ color: 'var(--ds-on-surface-variant)' }}>
                    Add, edit, suspend, or delete album_users in the system.
                  </p>
                </div>
                <button
                  className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all hover:opacity-90 active:scale-95"
                  onClick={openCreateForm}
                  style={{
                    backgroundColor: 'var(--ds-primary)',
                    color: 'var(--ds-on-primary)',
                  }}
                  type="button"
                >
                  <Plus className="h-4 w-4" />
                  Add User
                </button>
              </div>

              <div
                className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2"
                style={{ borderColor: 'var(--ds-outline-variant)' }}
              >
                <Search className="h-4 w-4" style={{ color: 'var(--ds-outline)' }} />
                <input
                  className="flex-1 bg-transparent text-sm outline-none"
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name, email, code, role, status..."
                  style={{ color: 'var(--ds-on-surface)' }}
                  type="search"
                  value={searchQuery}
                />
              </div>

              {usersError ? (
                <div
                  className="rounded-lg border px-4 py-3 text-sm"
                  style={{
                    backgroundColor: 'var(--ds-error-container)',
                    borderColor: 'rgba(186,26,26,0.2)',
                    color: 'var(--ds-error)',
                  }}
                >
                  {usersError}
                </div>
              ) : null}

              <div
                className="overflow-hidden rounded-2xl border bg-white"
                style={{ borderColor: 'var(--ds-outline-variant)' }}
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead
                      className="text-left text-[11px] uppercase tracking-wider"
                      style={{
                        backgroundColor: 'var(--ds-surface-container-low)',
                        color: 'var(--ds-on-surface-variant)',
                      }}
                    >
                      <tr>
                        <th className="px-4 py-3 font-semibold">User</th>
                        <th className="px-4 py-3 font-semibold">Code</th>
                        <th className="px-4 py-3 font-semibold">Role</th>
                        <th className="px-4 py-3 font-semibold">Status</th>
                        <th className="px-4 py-3 font-semibold">Area</th>
                        <th className="px-4 py-3 font-semibold text-right">Folders</th>
                        <th className="px-4 py-3 font-semibold text-right">Photos</th>
                        <th className="px-4 py-3 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y" style={{ borderColor: 'var(--ds-outline-variant)' }}>
                      {isLoadingUsers && users.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="px-4 py-8 text-center text-sm" style={{ color: 'var(--ds-on-surface-variant)' }}>
                            Loading users...
                          </td>
                        </tr>
                      ) : filteredUsers.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="px-4 py-8 text-center text-sm" style={{ color: 'var(--ds-on-surface-variant)' }}>
                            No users match your search.
                          </td>
                        </tr>
                      ) : (
                        filteredUsers.map((u) => (
                          <tr key={u.id} className="transition-colors hover:bg-slate-50/60">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div
                                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                                  style={{
                                    backgroundColor: 'var(--ds-surface-container-high)',
                                    color: 'var(--ds-on-surface)',
                                  }}
                                >
                                  {(u.first_name?.[0] ?? '?').toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <div className="truncate font-semibold">{u.full_name}</div>
                                  <div className="truncate text-[11px]" style={{ color: 'var(--ds-on-surface-variant)' }}>
                                    <Mail className="mr-1 inline h-3 w-3" />
                                    {u.email}
                                  </div>
                                  <div className="truncate text-[11px]" style={{ color: 'var(--ds-on-surface-variant)' }}>
                                    <Phone className="mr-1 inline h-3 w-3" />
                                    {u.phone_number}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 font-mono text-[11px]" style={{ color: 'var(--ds-on-surface-variant)' }}>
                              {u.code}
                            </td>
                            <td className="px-4 py-3">
                              <RoleBadge role={u.role} />
                            </td>
                            <td className="px-4 py-3">
                              <StatusBadge status={u.status} />
                            </td>
                            <td className="px-4 py-3">{u.area_focused}</td>
                            <td className="px-4 py-3 text-right tabular-nums">{u.folder_count ?? 0}</td>
                            <td className="px-4 py-3 text-right tabular-nums">{u.photo_count ?? 0}</td>
                            <td className="px-4 py-3">
                              <div className="flex justify-end gap-1.5">
                                <button
                                  aria-label="Edit user"
                                  className="flex h-8 w-8 items-center justify-center rounded-lg border transition-colors hover:bg-slate-50"
                                  onClick={() => openEditForm(u)}
                                  style={{ borderColor: 'var(--ds-outline-variant)' }}
                                  type="button"
                                >
                                  <Edit3 className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  aria-label="Delete user"
                                  className="flex h-8 w-8 items-center justify-center rounded-lg border transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                                  disabled={u.role === 'admin'}
                                  onClick={() => setDeleteTarget(u)}
                                  style={{
                                    borderColor: 'var(--ds-outline-variant)',
                                    color: 'var(--ds-error)',
                                  }}
                                  title={u.role === 'admin' ? 'Admins cannot be deleted from the UI' : 'Delete user'}
                                  type="button"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}
        </main>
      </div>

      {/* ─── User Form Modal ──────────────────────────────────────────────── */}
      {isFormOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => !isSavingUser && setIsFormOpen(false)}
        >
          <form
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSaveUser}
          >
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2
                  className="text-lg font-bold"
                  style={{ fontFamily: 'var(--font-noto-serif)' }}
                >
                  {formMode === 'create' ? 'Add New User' : 'Edit User'}
                </h2>
                <p className="text-xs" style={{ color: 'var(--ds-on-surface-variant)' }}>
                  {formMode === 'create'
                    ? 'A unique login code will be generated automatically.'
                    : 'Leave password blank to keep the current one.'}
                </p>
              </div>
              <button
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-slate-100"
                disabled={isSavingUser}
                onClick={() => setIsFormOpen(false)}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label="First name">
                <input
                  className="form-input"
                  onChange={(e) => setFormState((s) => ({ ...s, firstName: e.target.value }))}
                  required
                  type="text"
                  value={formState.firstName}
                />
              </FormField>
              <FormField label="Last name">
                <input
                  className="form-input"
                  onChange={(e) => setFormState((s) => ({ ...s, lastName: e.target.value }))}
                  required
                  type="text"
                  value={formState.lastName}
                />
              </FormField>
              <FormField className="sm:col-span-2" label="Email">
                <input
                  autoComplete="off"
                  className="form-input"
                  onChange={(e) => setFormState((s) => ({ ...s, email: e.target.value }))}
                  required
                  type="email"
                  value={formState.email}
                />
              </FormField>
              <FormField label="Phone number">
                <input
                  className="form-input"
                  onChange={(e) => setFormState((s) => ({ ...s, phoneNumber: e.target.value }))}
                  required
                  type="tel"
                  value={formState.phoneNumber}
                />
              </FormField>
              <FormField label="Area focused">
                <input
                  className="form-input"
                  onChange={(e) => setFormState((s) => ({ ...s, areaFocused: e.target.value }))}
                  required
                  type="text"
                  value={formState.areaFocused}
                />
              </FormField>
              <FormField label="Role">
                <select
                  className="form-input"
                  onChange={(e) =>
                    setFormState((s) => ({ ...s, role: e.target.value as AlbumUserRole }))
                  }
                  value={formState.role}
                >
                  <option value="media">Media</option>
                  <option value="customer">Customer Drive</option>
                  <option value="admin">Admin</option>
                </select>
              </FormField>
              <FormField label="Status">
                <select
                  className="form-input"
                  onChange={(e) =>
                    setFormState((s) => ({
                      ...s,
                      status: e.target.value as UserFormState['status'],
                    }))
                  }
                  value={formState.status}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="suspended">Suspended</option>
                </select>
              </FormField>
              <FormField
                className="sm:col-span-2"
                label={formMode === 'create' ? 'Password' : 'New password (optional)'}
              >
                <input
                  autoComplete="new-password"
                  className="form-input"
                  minLength={formMode === 'create' ? 8 : undefined}
                  onChange={(e) => setFormState((s) => ({ ...s, password: e.target.value }))}
                  placeholder={formMode === 'create' ? 'At least 8 characters' : 'Leave blank to keep current'}
                  type="password"
                  value={formState.password}
                />
              </FormField>
            </div>

            {formError ? (
              <div
                className="mt-4 rounded-lg border px-3 py-2 text-xs"
                style={{
                  backgroundColor: 'var(--ds-error-container)',
                  borderColor: 'rgba(186,26,26,0.2)',
                  color: 'var(--ds-error)',
                }}
              >
                {formError}
              </div>
            ) : null}

            <div className="mt-5 flex justify-end gap-2">
              <button
                className="rounded-lg border px-4 py-2 text-sm font-semibold transition-colors hover:bg-slate-50"
                disabled={isSavingUser}
                onClick={() => setIsFormOpen(false)}
                style={{ borderColor: 'var(--ds-outline-variant)' }}
                type="button"
              >
                Cancel
              </button>
              <button
                className="rounded-lg px-4 py-2 text-sm font-semibold transition-all hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isSavingUser}
                style={{
                  backgroundColor: 'var(--ds-primary)',
                  color: 'var(--ds-on-primary)',
                }}
                type="submit"
              >
                {isSavingUser
                  ? 'Saving...'
                  : formMode === 'create'
                    ? 'Create User'
                    : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {/* ─── Delete Confirm ──────────────────────────────────────────────── */}
      {deleteTarget ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => !isDeletingUser && setDeleteTarget(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              className="text-lg font-bold"
              style={{ fontFamily: 'var(--font-noto-serif)' }}
            >
              Delete user?
            </h2>
            <p className="mt-2 text-sm" style={{ color: 'var(--ds-on-surface-variant)' }}>
              This will permanently remove <span className="font-semibold">{deleteTarget.full_name}</span>{' '}
              ({deleteTarget.email}) from the system, including their Supabase Auth login. Their photos and
              folders will remain but become unowned. This cannot be undone.
            </p>

            <div className="mt-5 flex justify-end gap-2">
              <button
                className="rounded-lg border px-4 py-2 text-sm font-semibold transition-colors hover:bg-slate-50"
                disabled={isDeletingUser}
                onClick={() => setDeleteTarget(null)}
                style={{ borderColor: 'var(--ds-outline-variant)' }}
                type="button"
              >
                Cancel
              </button>
              <button
                className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isDeletingUser}
                onClick={handleDeleteUser}
                style={{ backgroundColor: 'var(--ds-error)' }}
                type="button"
              >
                {isDeletingUser ? 'Deleting...' : 'Delete user'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ─── Local CSS for form inputs ──────────────────────────────────── */}
      <style jsx>{`
        :global(.form-input) {
          width: 100%;
          border: 1px solid var(--ds-outline-variant);
          background-color: var(--ds-surface-container-low);
          color: var(--ds-on-surface);
          padding: 0.625rem 0.75rem;
          border-radius: 0.5rem;
          font-size: 0.875rem;
          outline: none;
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }
        :global(.form-input:focus) {
          border-color: var(--ds-primary);
          box-shadow: 0 0 0 1px var(--ds-primary);
        }
      `}</style>
    </div>
  )
}

// ─── Subcomponents ────────────────────────────────────────────────────────────

function NavItem({
  active,
  badge,
  icon,
  label,
  onClick,
}: {
  active: boolean
  badge?: number
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition-colors"
      onClick={onClick}
      style={{
        backgroundColor: active ? 'var(--ds-surface-container)' : 'transparent',
        color: active ? 'var(--ds-primary)' : 'var(--ds-on-surface-variant)',
        fontWeight: active ? 600 : 500,
      }}
      type="button"
    >
      <span className="shrink-0">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {badge != null ? (
        <span
          className="rounded-full px-1.5 text-[10px] font-bold tabular-nums"
          style={{
            backgroundColor: active ? 'var(--ds-primary)' : 'var(--ds-surface-container-high)',
            color: active ? 'var(--ds-on-primary)' : 'var(--ds-on-surface)',
          }}
        >
          {badge}
        </span>
      ) : null}
    </button>
  )
}

function StatCard({
  hint,
  icon,
  label,
  value,
}: {
  hint?: string
  icon: React.ReactNode
  label: string
  value: number | string
}) {
  return (
    <div
      className="rounded-2xl border bg-white p-4"
      style={{ borderColor: 'var(--ds-outline-variant)' }}
    >
      <div className="flex items-center justify-between">
        <span
          className="text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: 'var(--ds-on-surface-variant)' }}
        >
          {label}
        </span>
        <span
          className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{
            backgroundColor: 'var(--ds-surface-container)',
            color: 'var(--ds-primary)',
          }}
        >
          {icon}
        </span>
      </div>
      <div
        className="mt-2 text-2xl font-bold tabular-nums"
        style={{ fontFamily: 'var(--font-noto-serif)' }}
      >
        {value}
      </div>
      {hint ? (
        <div
          className="mt-1 truncate text-[11px]"
          style={{ color: 'var(--ds-on-surface-variant)' }}
        >
          {hint}
        </div>
      ) : null}
    </div>
  )
}

function Panel({
  action,
  children,
  className,
  icon,
  title,
}: {
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
  icon: React.ReactNode
  title: string
}) {
  return (
    <div
      className={`rounded-2xl border bg-white p-4 ${className ?? ''}`}
      style={{ borderColor: 'var(--ds-outline-variant)' }}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div
          className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider"
          style={{ color: 'var(--ds-on-surface-variant)' }}
        >
          {icon}
          {title}
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

const ROLE_BADGE_STYLES: Record<AlbumUserRole, { bg: string; fg: string }> = {
  admin: { bg: 'var(--ds-primary)', fg: 'var(--ds-on-primary)' },
  media: { bg: '#fde68a', fg: '#78350f' },
  customer: { bg: '#dbeafe', fg: '#1e40af' },
}

function RoleBadge({ role }: { role: AlbumUserRole }) {
  const style = ROLE_BADGE_STYLES[role] ?? ROLE_BADGE_STYLES.media
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ backgroundColor: style.bg, color: style.fg }}
    >
      {role === 'admin' ? <Shield className="h-3 w-3" /> : null}
      {ROLE_LABELS[role] ?? role}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles =
    status === 'active'
      ? { bg: '#dcfce7', fg: '#166534' }
      : status === 'inactive'
        ? { bg: '#f1f5f9', fg: '#64748b' }
        : { bg: '#fee2e2', fg: '#991b1b' }
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize"
      style={{ backgroundColor: styles.bg, color: styles.fg }}
    >
      {status}
    </span>
  )
}

function FormField({
  children,
  className,
  label,
}: {
  children: React.ReactNode
  className?: string
  label: string
}) {
  return (
    <label className={`flex flex-col gap-1 ${className ?? ''}`}>
      <span
        className="text-[11px] font-semibold uppercase tracking-wider"
        style={{ color: 'var(--ds-on-surface-variant)' }}
      >
        {label}
      </span>
      {children}
    </label>
  )
}
