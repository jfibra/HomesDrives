'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type MouseEvent,
} from 'react'
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Calendar,
  CalendarDays,
  Camera,
  ChevronRight,
  ClipboardList,
  Edit3,
  FilePlus2,
  Folder,
  FolderOpen,
  HardDrive,
  Image as ImageIcon,
  LogOut,
  Mail,
  Map as MapIcon,
  MapPin,
  Menu,
  Phone,
  Plus,
  Search,
  Shield,
  Star,
  Trash2,
  Users,
  Wand2,
  X,
} from 'lucide-react'

import AdminMapView from '@/components/admin/AdminMapView'
import type { MapFolder } from '@/components/admin/AdminMapView'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

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
  topUploaders: { code: string; name: string; folders: number }[]
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
  foldersByUserByDay: {
    code: string
    name: string
    total: number
    today: number
    days: { day: string; count: number }[]
  }[]
}

type AdminView = 'overview' | 'users' | 'folders' | 'map'

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
  const [folderSearchQuery, setFolderSearchQuery] = useState('')

  // User form modal
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create')
  const [formState, setFormState] = useState<UserFormState>(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [isSavingUser, setIsSavingUser] = useState(false)

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<AdminUserRow | null>(null)
  const [isDeletingUser, setIsDeletingUser] = useState(false)

  // Browse user folders + photos
  type BrowseUser = {
    id: number
    code: string
    name: string
  }
  type BrowseFolder = {
    id: string
    folder_name: string
    full_address: string | null
    city: string | null
    province: string | null
    type_of_place: string[]
    tags: string[]
    notes: string | null
    status: string
    created_at: string
    photo_count: number
    cover_image_url: string | null
  }
  type DirectoryFolderRow = BrowseFolder & {
    owner_user_id: number | null
    owner_code: string
    owner_name: string
    latitude: number | null
    longitude: number | null
  }
  const [allFolders, setAllFolders] = useState<DirectoryFolderRow[]>([])
  const [isLoadingAllFolders, setIsLoadingAllFolders] = useState(false)
  const [allFoldersError, setAllFoldersError] = useState('')
  type BrowsePhoto = {
    id: string
    image_url: string
    original_file_name: string
    file_size_bytes: number
    capture_date: string | null
    created_at: string
    device_make: string | null
    device_model: string | null
    width: number | null
    height: number | null
    place_name: string | null
    city: string | null
    province: string | null
    type_of_place: string[]
    tags: string[]
    article_star_rank: number | null
  }
  const [browseUser, setBrowseUser] = useState<BrowseUser | null>(null)
  const [browseFolders, setBrowseFolders] = useState<BrowseFolder[]>([])
  const [isLoadingBrowseFolders, setIsLoadingBrowseFolders] = useState(false)
  const [browseFoldersError, setBrowseFoldersError] = useState('')
  const [browseFolder, setBrowseFolder] = useState<BrowseFolder | null>(null)
  const [browsePhotos, setBrowsePhotos] = useState<BrowsePhoto[]>([])
  const [isLoadingBrowsePhotos, setIsLoadingBrowsePhotos] = useState(false)
  const [browsePhotosError, setBrowsePhotosError] = useState('')
  const [lightboxPhoto, setLightboxPhoto] = useState<BrowsePhoto | null>(null)

  const [heatmapDayOpen, setHeatmapDayOpen] = useState(false)
  const [heatmapDayContext, setHeatmapDayContext] = useState<{
    code: string
    name: string
    day: string
    userId: number | null
  } | null>(null)
  const [heatmapDayFolders, setHeatmapDayFolders] = useState<
    { id: string; folder_name: string; full_address: string | null; created_at: string; status: string }[]
  >([])
  const [heatmapDayLoading, setHeatmapDayLoading] = useState(false)
  const [heatmapDayError, setHeatmapDayError] = useState('')

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

  const loadAllFolders = useCallback(async () => {
    setIsLoadingAllFolders(true)
    setAllFoldersError('')
    try {
      const r = await fetch(`/api/admin/folders?adminCode=${encodeURIComponent(user.code)}`)
      const data = await r.json().catch(() => null)
      if (!r.ok) throw new Error(data?.error || 'Unable to load folders.')
      const rows = Array.isArray(data?.folders) ? data.folders : []
      setAllFolders(rows as DirectoryFolderRow[])
    } catch (error) {
      setAllFoldersError(error instanceof Error ? error.message : 'Unable to load folders.')
    } finally {
      setIsLoadingAllFolders(false)
    }
  }, [user.code])

  useEffect(() => {
    if (!isAuthenticated) return
    void loadStats()
    void loadUsers()
  }, [isAuthenticated, loadStats, loadUsers])

  useEffect(() => {
    if (!isAuthenticated || (activeView !== 'folders' && activeView !== 'map')) return
    void loadAllFolders()
  }, [isAuthenticated, activeView, loadAllFolders])

  useEffect(() => {
    if (!heatmapDayOpen || !heatmapDayContext) return
    const ctx = heatmapDayContext

    let cancelled = false
    async function run() {
      setHeatmapDayLoading(true)
      setHeatmapDayError('')
      setHeatmapDayFolders([])
      try {
        const q = new URLSearchParams({
          adminCode: user.code,
          uploaderCode: ctx.code,
          day: ctx.day,
        })
        if (ctx.userId != null) {
          q.set('albumUserId', String(ctx.userId))
        }
        const r = await fetch(`/api/admin/folders/by-day?${q}`)
        const data = await r.json().catch(() => null)
        if (!r.ok) throw new Error(data?.error || 'Unable to load folders.')
        if (!cancelled) {
          setHeatmapDayFolders(Array.isArray(data?.folders) ? data.folders : [])
        }
      } catch (error) {
        if (!cancelled) {
          setHeatmapDayError(
            error instanceof Error ? error.message : 'Unable to load folders.',
          )
        }
      } finally {
        if (!cancelled) setHeatmapDayLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [heatmapDayOpen, heatmapDayContext, user.code])

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

  // ─── Browse user → folders → photos ─────────────────────────────────────────

  function openHeatmapDayFolders(row: { code: string; name: string; userId: number | null }, day: string) {
    setHeatmapDayContext({
      code: row.code,
      name: row.name,
      day,
      userId: row.userId,
    })
    setHeatmapDayOpen(true)
  }

  async function openUserBrowse(
    target: { id: number; code: string; name: string },
    options?: { openFolderId?: string },
  ) {
    setBrowseUser(target)
    setBrowseFolder(null)
    setBrowsePhotos([])
    setBrowseFolders([])
    setBrowseFoldersError('')
    setIsLoadingBrowseFolders(true)
    try {
      const r = await fetch(
        `/api/admin/users/${target.id}/folders?adminCode=${encodeURIComponent(user.code)}`,
      )
      const data = await r.json().catch(() => null)
      if (!r.ok) throw new Error(data?.error || 'Unable to load folders.')
      const folders: BrowseFolder[] = Array.isArray(data?.folders) ? data.folders : []
      setBrowseFolders(folders)
      if (options?.openFolderId) {
        const match = folders.find((f) => f.id === options.openFolderId)
        if (match) {
          await openFolderPhotos(match)
        }
      }
    } catch (error) {
      setBrowseFoldersError(
        error instanceof Error ? error.message : 'Unable to load folders.',
      )
    } finally {
      setIsLoadingBrowseFolders(false)
    }
  }

  async function openFolderFromDirectory(row: DirectoryFolderRow) {
    const asFolder: BrowseFolder = {
      id: row.id,
      folder_name: row.folder_name,
      full_address: row.full_address,
      city: row.city,
      province: row.province,
      type_of_place: row.type_of_place,
      tags: row.tags,
      notes: row.notes,
      status: row.status,
      created_at: row.created_at,
      photo_count: row.photo_count,
      cover_image_url: row.cover_image_url,
    }
    if (row.owner_user_id != null && row.owner_user_id > 0) {
      await openUserBrowse(
        {
          id: row.owner_user_id,
          code: row.owner_code,
          name: row.owner_name,
        },
        { openFolderId: row.id },
      )
      return
    }
    setBrowseUser({
      id: 0,
      code: row.owner_code,
      name: row.owner_name,
    })
    setBrowseFolder(null)
    setBrowsePhotos([])
    setBrowseFolders([asFolder])
    setBrowseFoldersError('')
    setIsLoadingBrowseFolders(false)
    await openFolderPhotos(asFolder)
  }

  async function openFolderPhotos(folder: BrowseFolder) {
    setBrowseFolder(folder)
    setBrowsePhotos([])
    setBrowsePhotosError('')
    setIsLoadingBrowsePhotos(true)
    try {
      const r = await fetch(
        `/api/admin/folders/${folder.id}/photos?adminCode=${encodeURIComponent(user.code)}`,
      )
      const data = await r.json().catch(() => null)
      if (!r.ok) throw new Error(data?.error || 'Unable to load photos.')
      setBrowsePhotos(
        Array.isArray(data?.photos)
          ? data.photos.map((photo: BrowsePhoto) => ({
              ...photo,
              article_star_rank: photo.article_star_rank ?? null,
            }))
          : [],
      )
    } catch (error) {
      setBrowsePhotosError(
        error instanceof Error ? error.message : 'Unable to load photos.',
      )
    } finally {
      setIsLoadingBrowsePhotos(false)
    }
  }

  function closeBrowse() {
    setBrowseUser(null)
    setBrowseFolder(null)
    setBrowseFolders([])
    setBrowsePhotos([])
    setLightboxPhoto(null)
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

  const browseArticleStarPhotos = useMemo(
    () =>
      browsePhotos
        .filter((photo) => photo.article_star_rank != null)
        .sort((a, b) => (a.article_star_rank ?? 0) - (b.article_star_rank ?? 0)),
    [browsePhotos],
  )

  const sortedBrowsePhotos = useMemo(
    () =>
      [...browsePhotos].sort((a, b) => {
        const aRank = a.article_star_rank ?? 99
        const bRank = b.article_star_rank ?? 99
        if (aRank !== bRank) return aRank - bRank
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      }),
    [browsePhotos],
  )

  const filteredAllFolders = useMemo(() => {
    const q = folderSearchQuery.trim().toLowerCase()
    if (!q) return allFolders
    return allFolders.filter((f) => {
      const hay = [
        f.folder_name,
        f.full_address ?? '',
        f.city ?? '',
        f.province ?? '',
        f.owner_name,
        f.owner_code,
        f.status,
        ...(f.type_of_place ?? []),
        ...(f.tags ?? []),
      ]
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [allFolders, folderSearchQuery])

  const initials = (user.firstName?.[0] ?? 'A').toUpperCase()

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (!isAuthChecked) {
    return (
      <div
        className="flex min-h-screen min-w-0 items-center justify-center overflow-x-hidden"
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
        className="flex min-h-screen min-w-0 items-center justify-center overflow-x-hidden px-4"
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
      className="flex min-h-screen min-w-0 flex-col overflow-x-hidden"
      style={{ backgroundColor: 'var(--ds-surface)', color: 'var(--ds-on-surface)' }}
    >
      {/* ─── Top Bar ─────────────────────────────────────────────────────── */}
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

          <div className="flex min-w-0 items-center gap-2">
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
              style={{
                backgroundColor: 'var(--ds-primary)',
                color: 'var(--ds-on-primary)',
              }}
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
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <div className="hidden min-w-0 max-w-[8rem] text-right sm:block md:max-w-[11rem] lg:max-w-[14rem]">
            <div className="truncate text-xs font-semibold">{user.fullName}</div>
            <div className="truncate text-[10px]" style={{ color: 'var(--ds-on-surface-variant)' }}>
              {user.email}
            </div>
          </div>
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold"
            style={{
              backgroundColor: 'var(--ds-primary)',
              color: 'var(--ds-on-primary)',
            }}
            title={`${user.fullName}`}
          >
            {initials}
          </div>
          <button
            aria-label="Sign out"
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition-colors hover:bg-gray-50 sm:px-3"
            onClick={handleLogout}
            style={{ borderColor: 'var(--ds-outline-variant)', color: 'var(--ds-on-surface-variant)' }}
            title="Sign out"
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
              active={activeView === 'folders'}
              badge={stats?.totals.folders}
              icon={<FolderOpen className="h-4 w-4" />}
              label="Folders"
              onClick={() => {
                setActiveView('folders')
                setIsSidebarOpen(false)
              }}
            />
            <NavItem
              active={activeView === 'map'}
              icon={<MapIcon className="h-4 w-4" />}
              label="Map View"
              onClick={() => {
                setActiveView('map')
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
            <NavItem
              active={false}
              icon={<Wand2 className="h-4 w-4" />}
              label="AI Poster Generator"
              onClick={() => {
                setIsSidebarOpen(false)
                window.location.href = '/poster-generator'
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
        <main className={`flex-1 min-w-0 ${activeView === 'map' ? 'overflow-hidden' : 'p-4 sm:p-6 lg:p-8'}`}>
          {activeView === 'map' ? (
            <section className="h-full">
              <AdminMapView
                folders={allFolders as unknown as MapFolder[]}
                adminCode={user.code}
                onOpenFolder={(folder) => {
                  void openFolderFromDirectory(folder as unknown as DirectoryFolderRow)
                }}
              />
            </section>
          ) : activeView === 'overview' ? (
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
                      ariaLabel="View all folders"
                      onClick={() => {
                        setActiveView('folders')
                        setIsSidebarOpen(false)
                      }}
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
                      title="Uploads · Last 14 days (PHT)"
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

                        const chartH = 220
                        const yTicks = [0.25, 0.5, 0.75, 1]
                        const todayIso = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
                        return (
                          <>
                            {/* Chart area */}
                            <div className="relative" style={{ height: chartH }}>
                              {/* Y-axis gridlines + labels */}
                              {yTicks.map((t) => (
                                <div
                                  key={t}
                                  className="absolute inset-x-0 flex items-center"
                                  style={{ bottom: `${t * 100}%` }}
                                >
                                  <span
                                    className="w-9 shrink-0 pr-1.5 text-right text-[9px] tabular-nums leading-none"
                                    style={{ color: 'var(--ds-on-surface-variant)' }}
                                  >
                                    {Math.round(maxDayCount * t)}
                                  </span>
                                  <div
                                    className="flex-1 border-t"
                                    style={{
                                      borderColor: 'var(--ds-outline-variant)',
                                      borderStyle: t === 1 ? 'solid' : 'dashed',
                                      opacity: t === 1 ? 1 : 0.5,
                                    }}
                                  />
                                </div>
                              ))}
                              {/* Baseline */}
                              <div
                                className="absolute inset-x-9 bottom-0 border-b"
                                style={{ borderColor: 'var(--ds-outline-variant)' }}
                              />

                              {/* Bars */}
                              <div className="absolute inset-x-9 bottom-0 top-0 flex items-end gap-1">
                                {days.map((d) => {
                                  const isToday = d.day === todayIso
                                  const pct = d.count > 0
                                    ? Math.max(4, (d.count / maxDayCount) * 100)
                                    : 0
                                  return (
                                    <div
                                      key={d.day}
                                      className="group relative flex flex-1 flex-col items-center justify-end"
                                      style={{ height: '100%' }}
                                    >
                                      {d.count > 0 && (
                                        <span
                                          className="mb-0.5 text-[9px] font-bold tabular-nums leading-none"
                                          style={{
                                            color: isToday ? 'var(--ds-secondary)' : 'var(--ds-primary)',
                                          }}
                                        >
                                          {d.count}
                                        </span>
                                      )}
                                      <div
                                        className="w-full rounded-t transition-all"
                                        style={{
                                          height: d.count > 0 ? `${pct}%` : '3px',
                                          minHeight: d.count > 0 ? '14px' : undefined,
                                          backgroundColor: d.count === 0
                                            ? 'var(--ds-surface-container-high)'
                                            : isToday
                                              ? 'var(--ds-secondary)'
                                              : 'var(--ds-primary)',
                                          opacity: d.count === 0 ? 0.4 : 1,
                                        }}
                                        title={`${formatDay(d.day)}: ${d.count} upload${d.count !== 1 ? 's' : ''}`}
                                      />
                                    </div>
                                  )
                                })}
                              </div>
                            </div>

                            {/* X-axis labels — every day */}
                            <div
                              className="mt-1 flex gap-1 pl-9 text-[9px] tabular-nums"
                              style={{ color: 'var(--ds-on-surface-variant)' }}
                            >
                              {days.map((d) => (
                                <div
                                  key={d.day}
                                  className="flex-1 text-center"
                                  style={{ fontWeight: d.day === todayIso ? 700 : undefined }}
                                >
                                  {formatDay(d.day).replace(' ', ' ')}
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
                              <div className="text-sm font-bold">{u.folders}</div>
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

                  {/* Daily Uploads by User */}
                  <Panel
                    icon={<CalendarDays className="h-4 w-4" />}
                    title="Daily Folders by User (Philippines time)"
                    action={
                      <span
                        className="text-[11px] font-semibold tabular-nums"
                        style={{ color: 'var(--ds-on-surface-variant)' }}
                      >
                        {(stats?.foldersByUserByDay ?? []).length}{' '}
                        {(stats?.foldersByUserByDay ?? []).length === 1 ? 'user' : 'users'}
                        <span className="hidden sm:inline">
                          {' '}
                          · click a count to list folders · click a row to browse
                        </span>
                      </span>
                    }
                  >
                    <p className="-mt-1 mb-3 text-[11px] leading-snug" style={{ color: 'var(--ds-on-surface-variant)' }}>
                      Each cell is <span className="font-semibold">new folders created</span> on that calendar day in{' '}
                      <span className="font-semibold">Philippines time (PHT)</span>. The bar chart above still shows{' '}
                      <span className="font-semibold">photo uploads</span> per day.
                    </p>
                    <UploadsByUserHeatmap
                      adminCode={user.code}
                      initialData={stats?.foldersByUserByDay ?? []}
                      users={users}
                      onHeatCellClick={(row, day) => openHeatmapDayFolders(row, day)}
                      onSelectUser={(u) =>
                        openUserBrowse({ id: u.id, code: u.code, name: u.name })
                      }
                    />
                  </Panel>

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
          ) : activeView === 'folders' ? (
            <section className="mx-auto flex max-w-6xl flex-col gap-6">
              <div>
                <h1
                  className="text-2xl font-bold sm:text-3xl"
                  style={{ fontFamily: 'var(--font-noto-serif)' }}
                >
                  All Folders
                </h1>
                <p className="mt-1 text-sm" style={{ color: 'var(--ds-on-surface-variant)' }}>
                  Search and open any folder across all users. Click a card to browse photos.
                </p>
              </div>

              <div
                className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2"
                style={{ borderColor: 'var(--ds-outline-variant)' }}
              >
                <Search className="h-4 w-4" style={{ color: 'var(--ds-outline)' }} />
                <input
                  className="flex-1 bg-transparent text-sm outline-none"
                  onChange={(e) => setFolderSearchQuery(e.target.value)}
                  placeholder="Search by folder name, owner, code, address, tags, status..."
                  style={{ color: 'var(--ds-on-surface)' }}
                  type="search"
                  value={folderSearchQuery}
                />
              </div>

              {allFoldersError ? (
                <div
                  className="rounded-lg border px-4 py-3 text-sm"
                  style={{
                    backgroundColor: 'var(--ds-error-container)',
                    borderColor: 'rgba(186,26,26,0.2)',
                    color: 'var(--ds-error)',
                  }}
                >
                  {allFoldersError}
                </div>
              ) : null}

              {isLoadingAllFolders && allFolders.length === 0 ? (
                <div
                  className="flex h-48 items-center justify-center rounded-2xl border bg-white text-sm"
                  style={{
                    borderColor: 'var(--ds-outline-variant)',
                    color: 'var(--ds-on-surface-variant)',
                  }}
                >
                  Loading folders...
                </div>
              ) : filteredAllFolders.length === 0 ? (
                <div
                  className="flex h-48 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed text-center"
                  style={{
                    borderColor: 'var(--ds-outline-variant)',
                    color: 'var(--ds-on-surface-variant)',
                  }}
                >
                  <Folder className="h-8 w-8 opacity-50" />
                  <div className="text-sm font-semibold">
                    {allFolders.length === 0 ? 'No folders yet.' : 'No folders match your search.'}
                  </div>
                </div>
              ) : (
                <>
                  <div
                    className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wider"
                    style={{ color: 'var(--ds-on-surface-variant)' }}
                  >
                    <span>
                      Showing {filteredAllFolders.length} of {allFolders.length} folder
                      {allFolders.length === 1 ? '' : 's'}
                    </span>
                    <span>
                      Total photos:{' '}
                      {filteredAllFolders.reduce((s, f) => s + f.photo_count, 0)}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {filteredAllFolders.map((folder) => {
                      const isArchived = (folder.status ?? 'active') === 'archived'
                      return (
                        <button
                          key={folder.id}
                          className="group flex flex-col gap-2 overflow-hidden rounded-2xl border bg-white text-left transition-all hover:-translate-y-0.5 hover:shadow-md"
                          onClick={() => void openFolderFromDirectory(folder)}
                          style={{ borderColor: 'var(--ds-outline-variant)' }}
                          type="button"
                        >
                          {folder.cover_image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              alt={folder.folder_name}
                              className="h-32 w-full object-cover"
                              src={folder.cover_image_url}
                            />
                          ) : (
                            <div
                              className="flex h-32 w-full items-center justify-center"
                              style={{ backgroundColor: 'var(--ds-surface-container)' }}
                            >
                              <FolderOpen
                                className="h-8 w-8"
                                style={{ color: 'var(--ds-on-surface-variant)' }}
                              />
                            </div>
                          )}
                          <div className="flex flex-col gap-1.5 px-3 pb-3">
                            <div className="flex items-start justify-between gap-2">
                              <div
                                className="min-w-0 flex-1 truncate font-semibold"
                                style={{ color: 'var(--ds-on-surface)' }}
                              >
                                {folder.folder_name}
                              </div>
                              <span
                                className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums"
                                style={{
                                  backgroundColor:
                                    folder.photo_count > 0
                                      ? 'var(--ds-primary)'
                                      : 'var(--ds-surface-container-high)',
                                  color:
                                    folder.photo_count > 0
                                      ? 'var(--ds-on-primary)'
                                      : 'var(--ds-on-surface-variant)',
                                }}
                              >
                                {folder.photo_count}{' '}
                                {folder.photo_count === 1 ? 'photo' : 'photos'}
                              </span>
                            </div>
                            <div
                              className="flex items-center gap-2 text-[11px]"
                              style={{ color: 'var(--ds-on-surface-variant)' }}
                            >
                              <Users className="h-3.5 w-3.5 shrink-0" />
                              <span className="min-w-0 truncate">
                                <span className="font-medium" style={{ color: 'var(--ds-on-surface)' }}>
                                  {folder.owner_name}
                                </span>
                                <span className="ml-1 font-mono text-[10px]">{folder.owner_code}</span>
                              </span>
                            </div>
                            {folder.full_address ? (
                              <div
                                className="flex items-start gap-1 text-[11px]"
                                style={{ color: 'var(--ds-on-surface-variant)' }}
                              >
                                <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                                <span className="line-clamp-2">{folder.full_address}</span>
                              </div>
                            ) : null}
                            <div
                              className="flex items-center justify-between text-[10px]"
                              style={{ color: 'var(--ds-on-surface-variant)' }}
                            >
                              <span>{formatDate(folder.created_at)}</span>
                              {isArchived ? (
                                <span
                                  className="rounded-full px-2 py-0.5 font-semibold"
                                  style={{
                                    backgroundColor: 'var(--ds-surface-container-high)',
                                    color: 'var(--ds-on-surface-variant)',
                                  }}
                                >
                                  Archived
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
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
                            <td className="px-4 py-3 text-right tabular-nums">
                              <button
                                aria-label={`Browse folders for ${u.full_name}`}
                                className="w-full rounded-md px-2 py-1 text-right tabular-nums font-medium transition-colors hover:bg-slate-100"
                                onClick={() =>
                                  openUserBrowse({
                                    id: u.id,
                                    code: u.code,
                                    name: u.full_name,
                                  })
                                }
                                style={{ color: 'var(--ds-primary)' }}
                                title="Open folder browser"
                                type="button"
                              >
                                {u.folder_count ?? 0}
                              </button>
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums">
                              <button
                                aria-label={`Browse photos for ${u.full_name}`}
                                className="w-full rounded-md px-2 py-1 text-right tabular-nums font-medium transition-colors hover:bg-slate-100"
                                onClick={() =>
                                  openUserBrowse({
                                    id: u.id,
                                    code: u.code,
                                    name: u.full_name,
                                  })
                                }
                                style={{ color: 'var(--ds-primary)' }}
                                title="Open folders and photos"
                                type="button"
                              >
                                {u.photo_count ?? 0}
                              </button>
                            </td>
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

      {/* ─── Browse user folders + photos ────────────────────────────────── */}
      {browseUser ? (
        <div
          className="fixed inset-0 z-40 flex items-stretch justify-center bg-black/50 sm:items-center sm:p-4 md:p-6"
          onClick={closeBrowse}
        >
          <div
            className="flex h-full w-full flex-col overflow-hidden bg-white shadow-2xl sm:max-h-[90vh] sm:max-w-3xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer header */}
            <header
              className="flex items-center gap-3 border-b px-4 py-3 sm:px-5 sm:py-4"
              style={{ borderColor: 'var(--ds-outline-variant)' }}
            >
              {browseFolder ? (
                <button
                  aria-label="Back to folders"
                  className="flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-slate-100"
                  onClick={() => {
                    setBrowseFolder(null)
                    setBrowsePhotos([])
                  }}
                  type="button"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
              ) : null}

              <div className="min-w-0 flex-1">
                <div
                  className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--ds-on-surface-variant)' }}
                >
                  <span>{browseUser.name}</span>
                  {browseFolder ? (
                    <>
                      <ChevronRight className="h-3 w-3" />
                      <span>Folder</span>
                    </>
                  ) : null}
                </div>
                <div
                  className="mt-0.5 truncate text-lg font-bold"
                  style={{ fontFamily: 'var(--font-noto-serif)' }}
                >
                  {browseFolder
                    ? browseFolder.folder_name
                    : `${browseUser.name}'s Folders`}
                </div>
                <div
                  className="truncate font-mono text-[11px]"
                  style={{ color: 'var(--ds-on-surface-variant)' }}
                >
                  {browseUser.code}
                </div>
              </div>

              <button
                aria-label="Close"
                className="flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-slate-100"
                onClick={closeBrowse}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            {/* Drawer body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5">
              {/* Folder list view */}
              {!browseFolder ? (
                <>
                  {browseFoldersError ? (
                    <div
                      className="mb-4 rounded-lg border px-3 py-2 text-sm"
                      style={{
                        backgroundColor: 'var(--ds-error-container)',
                        borderColor: 'rgba(186,26,26,0.2)',
                        color: 'var(--ds-error)',
                      }}
                    >
                      {browseFoldersError}
                    </div>
                  ) : null}

                  {isLoadingBrowseFolders ? (
                    <div
                      className="flex h-40 items-center justify-center text-sm"
                      style={{ color: 'var(--ds-on-surface-variant)' }}
                    >
                      Loading folders...
                    </div>
                  ) : browseFolders.length === 0 ? (
                    <div
                      className="flex h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-center"
                      style={{
                        borderColor: 'var(--ds-outline-variant)',
                        color: 'var(--ds-on-surface-variant)',
                      }}
                    >
                      <Folder className="h-7 w-7 opacity-50" />
                      <div className="text-sm font-semibold">
                        This user has not created any folders yet.
                      </div>
                    </div>
                  ) : (
                    <>
                      <div
                        className="mb-3 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider"
                        style={{ color: 'var(--ds-on-surface-variant)' }}
                      >
                        <span>{browseFolders.length} folder{browseFolders.length === 1 ? '' : 's'}</span>
                        <span>
                          Total photos:{' '}
                          {browseFolders.reduce((s, f) => s + f.photo_count, 0)}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {browseFolders.map((folder) => (
                          <button
                            key={folder.id}
                            className="group flex flex-col gap-2 overflow-hidden rounded-2xl border bg-white text-left transition-all hover:-translate-y-0.5 hover:shadow-md"
                            onClick={() => openFolderPhotos(folder)}
                            style={{ borderColor: 'var(--ds-outline-variant)' }}
                            type="button"
                          >
                            {folder.cover_image_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                alt={folder.folder_name}
                                className="h-28 w-full object-cover"
                                src={folder.cover_image_url}
                              />
                            ) : (
                              <div
                                className="flex h-28 w-full items-center justify-center"
                                style={{ backgroundColor: 'var(--ds-surface-container)' }}
                              >
                                <FolderOpen
                                  className="h-8 w-8"
                                  style={{ color: 'var(--ds-on-surface-variant)' }}
                                />
                              </div>
                            )}
                            <div className="flex flex-col gap-1 px-3 pb-3">
                              <div className="flex items-start justify-between gap-2">
                                <div
                                  className="min-w-0 flex-1 truncate font-semibold"
                                  style={{ color: 'var(--ds-on-surface)' }}
                                >
                                  {folder.folder_name}
                                </div>
                                <span
                                  className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums"
                                  style={{
                                    backgroundColor:
                                      folder.photo_count > 0
                                        ? 'var(--ds-primary)'
                                        : 'var(--ds-surface-container-high)',
                                    color:
                                      folder.photo_count > 0
                                        ? 'var(--ds-on-primary)'
                                        : 'var(--ds-on-surface-variant)',
                                  }}
                                >
                                  {folder.photo_count} {folder.photo_count === 1 ? 'photo' : 'photos'}
                                </span>
                              </div>
                              {folder.full_address ? (
                                <div
                                  className="flex items-start gap-1 text-[11px]"
                                  style={{ color: 'var(--ds-on-surface-variant)' }}
                                >
                                  <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                                  <span className="line-clamp-2">{folder.full_address}</span>
                                </div>
                              ) : null}
                              <div
                                className="flex items-center justify-between text-[10px]"
                                style={{ color: 'var(--ds-on-surface-variant)' }}
                              >
                                <span>{formatDate(folder.created_at)}</span>
                                {folder.status === 'archived' ? (
                                  <span
                                    className="rounded-full px-2 py-0.5 font-semibold"
                                    style={{
                                      backgroundColor: 'var(--ds-surface-container-high)',
                                      color: 'var(--ds-on-surface-variant)',
                                    }}
                                  >
                                    Archived
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </>
              ) : (
                <>
                  {/* Folder details */}
                  {browseFolder.full_address ? (
                    <div
                      className="mb-3 rounded-lg border bg-slate-50 px-3 py-2 text-xs"
                      style={{
                        borderColor: 'var(--ds-outline-variant)',
                        color: 'var(--ds-on-surface-variant)',
                      }}
                    >
                      <div className="flex items-start gap-1.5">
                        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>{browseFolder.full_address}</span>
                      </div>
                    </div>
                  ) : null}

                  {browsePhotosError ? (
                    <div
                      className="mb-4 rounded-lg border px-3 py-2 text-sm"
                      style={{
                        backgroundColor: 'var(--ds-error-container)',
                        borderColor: 'rgba(186,26,26,0.2)',
                        color: 'var(--ds-error)',
                      }}
                    >
                      {browsePhotosError}
                    </div>
                  ) : null}

                  {isLoadingBrowsePhotos ? (
                    <div
                      className="flex h-40 items-center justify-center text-sm"
                      style={{ color: 'var(--ds-on-surface-variant)' }}
                    >
                      Loading photos...
                    </div>
                  ) : browsePhotos.length === 0 ? (
                    <div
                      className="flex h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-center"
                      style={{
                        borderColor: 'var(--ds-outline-variant)',
                        color: 'var(--ds-on-surface-variant)',
                      }}
                    >
                      <ImageIcon className="h-7 w-7 opacity-50" />
                      <div className="text-sm font-semibold">
                        No photos in this folder yet.
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                        <div className="flex items-start gap-2">
                          <Star className="mt-0.5 h-4 w-4 shrink-0 fill-amber-500 text-amber-500" />
                          <p className="text-xs text-amber-900">
                            <span className="font-semibold">Article picks</span>
                            {' — '}
                            {browseArticleStarPhotos.length > 0
                              ? `Media marked ${browseArticleStarPhotos.length} photo${browseArticleStarPhotos.length === 1 ? '' : 's'} for the article.`
                              : 'No photos starred yet. Media can mark up to 3 per folder.'}
                          </p>
                        </div>
                      </div>

                      <div
                        className="mb-3 text-[11px] font-semibold uppercase tracking-wider"
                        style={{ color: 'var(--ds-on-surface-variant)' }}
                      >
                        {browsePhotos.length} photo{browsePhotos.length === 1 ? '' : 's'}
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {sortedBrowsePhotos.map((photo) => (
                          <button
                            key={photo.id}
                            className="group relative overflow-hidden rounded-lg border bg-slate-100 transition-all hover:opacity-90"
                            onClick={() => setLightboxPhoto(photo)}
                            style={{
                              borderColor: photo.article_star_rank
                                ? '#fbbf24'
                                : 'var(--ds-outline-variant)',
                            }}
                            type="button"
                          >
                            {photo.article_star_rank ? (
                              <span className="absolute left-1.5 top-1.5 z-10 flex items-center justify-center rounded-full bg-amber-500 p-1 text-[9px] font-bold text-white">
                                <Star className="h-2.5 w-2.5 fill-current" />
                              </span>
                            ) : null}
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              alt={photo.original_file_name}
                              className="aspect-square w-full object-cover"
                              loading="lazy"
                              src={photo.image_url}
                            />
                            <div
                              className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100"
                            >
                              <div className="truncate text-[10px] font-semibold text-white">
                                {photo.original_file_name}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <Dialog
        open={heatmapDayOpen}
        onOpenChange={(open) => {
          setHeatmapDayOpen(open)
          if (!open) {
            setHeatmapDayContext(null)
            setHeatmapDayFolders([])
            setHeatmapDayError('')
          }
        }}
      >
        <DialogContent
          className="flex max-h-[min(90vh,720px)] max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl"
          showCloseButton
        >
          {heatmapDayContext ? (
            <>
              <DialogHeader className="shrink-0 border-b px-6 py-4 text-left">
                <DialogTitle className="text-base">
                  {heatmapDayContext.name}{' '}
                  <span
                    className="font-mono text-sm font-normal"
                    style={{ color: 'var(--ds-on-surface-variant)' }}
                  >
                    ({heatmapDayContext.code})
                  </span>
                </DialogTitle>
                <DialogDescription className="text-sm" style={{ color: 'var(--ds-on-surface-variant)' }}>
                  Folders created on {formatDay(heatmapDayContext.day)} (PHT), newest first. Click a folder to open it in
                  the browser.
                </DialogDescription>
              </DialogHeader>
              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
                {heatmapDayError ? (
                  <div
                    className="rounded-lg border px-3 py-2 text-sm"
                    style={{
                      backgroundColor: 'var(--ds-error-container)',
                      borderColor: 'rgba(186,26,26,0.2)',
                      color: 'var(--ds-error)',
                    }}
                  >
                    {heatmapDayError}
                  </div>
                ) : heatmapDayLoading ? (
                  <div
                    className="flex h-40 items-center justify-center text-sm"
                    style={{ color: 'var(--ds-on-surface-variant)' }}
                  >
                    Loading folders…
                  </div>
                ) : heatmapDayFolders.length === 0 ? (
                  <div
                    className="flex h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-center"
                    style={{
                      borderColor: 'var(--ds-outline-variant)',
                      color: 'var(--ds-on-surface-variant)',
                    }}
                  >
                    <Folder className="h-7 w-7 opacity-50" />
                    <div className="text-sm font-semibold">No folders for this day.</div>
                  </div>
                ) : (
                  <>
                    <div
                      className="mb-3 text-[11px] font-semibold uppercase tracking-wider"
                      style={{ color: 'var(--ds-on-surface-variant)' }}
                    >
                      {heatmapDayFolders.length} folder{heatmapDayFolders.length === 1 ? '' : 's'}
                    </div>
                    <ul className="flex flex-col gap-2">
                      {heatmapDayFolders.map((folder) => (
                        <li key={folder.id}>
                          <button
                            className="w-full rounded-xl border bg-white px-3 py-2.5 text-left text-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={heatmapDayContext.userId == null}
                            onClick={() => {
                              if (heatmapDayContext.userId == null) return
                              void openUserBrowse(
                                {
                                  id: heatmapDayContext.userId,
                                  code: heatmapDayContext.code,
                                  name: heatmapDayContext.name,
                                },
                                { openFolderId: folder.id },
                              )
                              setHeatmapDayOpen(false)
                            }}
                            style={{ borderColor: 'var(--ds-outline-variant)' }}
                            type="button"
                          >
                            <div className="font-semibold">{folder.folder_name}</div>
                            {folder.full_address ? (
                              <div
                                className="mt-1 flex items-start gap-1 text-xs"
                                style={{ color: 'var(--ds-on-surface-variant)' }}
                              >
                                <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                                <span>{folder.full_address}</span>
                              </div>
                            ) : null}
                            <div
                              className="mt-1 text-[10px] tabular-nums"
                              style={{ color: 'var(--ds-on-surface-variant)' }}
                            >
                              {formatDate(folder.created_at)}
                              {(folder.status ?? 'active') === 'archived' ? ' · Archived' : ''}
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Photo lightbox */}
      {lightboxPhoto ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 px-4"
          onClick={() => setLightboxPhoto(null)}
        >
          <div
            className="flex max-h-full max-w-5xl flex-col gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 text-white">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">
                  {lightboxPhoto.original_file_name}
                </div>
                <div className="truncate text-[11px] opacity-70">
                  {[
                    lightboxPhoto.place_name,
                    lightboxPhoto.city,
                    lightboxPhoto.province,
                  ]
                    .filter(Boolean)
                    .join(' · ') || formatDate(lightboxPhoto.created_at)}
                </div>
              </div>
              <button
                aria-label="Close"
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 transition-colors hover:bg-white/20"
                onClick={() => setLightboxPhoto(null)}
                type="button"
              >
                <X className="h-4 w-4 text-white" />
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt={lightboxPhoto.original_file_name}
              className="max-h-[80vh] w-auto max-w-full rounded-lg object-contain"
              src={lightboxPhoto.image_url}
            />
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
  ariaLabel,
  hint,
  icon,
  label,
  onClick,
  value,
}: {
  ariaLabel?: string
  hint?: string
  icon: React.ReactNode
  label: string
  onClick?: () => void
  value: number | string
}) {
  const cardStyle = { borderColor: 'var(--ds-outline-variant)' } as const
  const content = (
    <>
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
    </>
  )

  if (onClick) {
    return (
      <button
        aria-label={ariaLabel ?? label}
        className="w-full rounded-2xl border bg-white p-4 text-left transition-colors hover:bg-slate-50/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{
          ...cardStyle,
          outlineColor: 'var(--ds-primary)',
        }}
        type="button"
        onClick={onClick}
      >
        {content}
      </button>
    )
  }

  return (
    <div className="rounded-2xl border bg-white p-4" style={cardStyle}>
      {content}
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
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div
          className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider"
          style={{ color: 'var(--ds-on-surface-variant)' }}
        >
          {icon}
          {title}
        </div>
        {action ? <div className="ml-auto">{action}</div> : null}
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

// ─── Per-user-per-day heatmap ─────────────────────────────────────────────────

function heatmapCountForDay(
  row: AdminStats['foldersByUserByDay'][number],
  day: string,
) {
  return row.days.find((d) => d.day === day)?.count ?? 0
}

function UploadsByUserHeatmap({
  adminCode,
  initialData,
  users,
  onHeatCellClick,
  onSelectUser,
}: {
  adminCode: string
  initialData: AdminStats['foldersByUserByDay']
  users: AdminUserRow[]
  onHeatCellClick?: (row: { code: string; name: string; userId: number | null }, day: string) => void
  onSelectUser: (user: { id: number; code: string; name: string }) => void
}) {
  // Derive today and a default 14-day window
  const todayIso = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
  const defaultFromDate = new Date(Date.now() - 13 * 86400000)
  const defaultFromIso = defaultFromDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })

  const [rangeFrom, setRangeFrom] = useState(defaultFromIso)
  const [rangeTo, setRangeTo] = useState(todayIso)
  const [data, setData] = useState<AdminStats['foldersByUserByDay']>(initialData)
  const [isFetching, setIsFetching] = useState(false)
  const [fetchError, setFetchError] = useState('')

  // When the initial server-side data arrives, seed the state
  useEffect(() => {
    if (initialData.length > 0) setData(initialData)
  }, [initialData])

  async function fetchRange(from: string, to: string) {
    if (!from || !to || from > to) return
    setIsFetching(true)
    setFetchError('')
    try {
      const q = new URLSearchParams({ adminCode, from, to })
      const r = await fetch(`/api/admin/heatmap?${q}`)
      const json = await r.json()
      if (!r.ok) throw new Error(json.error ?? 'Failed to load heatmap.')
      setData(json.data)
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : 'Failed to load heatmap.')
    } finally {
      setIsFetching(false)
    }
  }

  function handleFromChange(next: string) {
    if (!next) return
    setRangeFrom(next)
    const effectiveTo = next > rangeTo ? next : rangeTo
    if (next > rangeTo) setRangeTo(next)
    void fetchRange(next, effectiveTo)
  }

  function handleToChange(next: string) {
    if (!next) return
    setRangeTo(next)
    const effectiveFrom = next < rangeFrom ? next : rangeFrom
    if (next < rangeFrom) setRangeFrom(next)
    void fetchRange(effectiveFrom, next)
  }

  const presets: { label: string; days: number }[] = [
    { label: 'Last 7 days', days: 7 },
    { label: 'Last 14 days', days: 14 },
    { label: 'Last 30 days', days: 30 },
  ]

  function applyPreset(days: number) {
    const from = new Date(Date.now() - (days - 1) * 86400000)
      .toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
    setRangeFrom(from)
    setRangeTo(todayIso)
    void fetchRange(from, todayIso)
  }

  const allDayKeys = useMemo(() => data[0]?.days.map((d) => d.day) ?? [], [data])

  if (!isFetching && data.length === 0 && !fetchError) {
    return (
      <div
        className="flex h-32 flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-center"
        style={{
          borderColor: 'var(--ds-outline-variant)',
          color: 'var(--ds-on-surface-variant)',
        }}
      >
        <CalendarDays className="h-6 w-6 opacity-50" />
        <div className="text-sm font-semibold">No folder activity in this period</div>
      </div>
    )
  }

  const dayCount = Math.round(
    (new Date(rangeTo).getTime() - new Date(rangeFrom).getTime()) / 86400000,
  ) + 1

  const userByCode = new Map(users.map((u) => [u.code, u]))
  const globalMax = Math.max(1, ...data.flatMap((u) => allDayKeys.map((day) => heatmapCountForDay(u, day))))
  const todayKey = allDayKeys[allDayKeys.length - 1]
  const isDefault = rangeFrom === defaultFromIso && rangeTo === todayIso

  return (
    <div>
      <div
        className="mb-3 flex flex-col gap-2 border-b pb-3"
        style={{ borderColor: 'var(--ds-outline-variant)' }}
      >
        {/* Quick presets */}
        <div className="flex flex-wrap gap-1.5">
          {presets.map((p) => {
            const presetFrom = new Date(Date.now() - (p.days - 1) * 86400000)
              .toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
            const active = rangeFrom === presetFrom && rangeTo === todayIso
            return (
              <button
                key={p.days}
                className="rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors"
                disabled={isFetching}
                onClick={() => applyPreset(p.days)}
                style={{
                  borderColor: active ? 'var(--ds-primary)' : 'var(--ds-outline-variant)',
                  backgroundColor: active ? 'var(--ds-primary-container)' : 'transparent',
                  color: active ? 'var(--ds-on-primary-container)' : 'var(--ds-on-surface)',
                }}
                type="button"
              >
                {p.label}
              </button>
            )
          })}
        </div>

        {/* Custom range inputs — no min/max so you can navigate to any month */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span
                className="text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: 'var(--ds-on-surface-variant)' }}
              >
                From
              </span>
              <input
                className="form-input w-[11.5rem] py-2 text-sm"
                max={rangeTo}
                onChange={(e) => handleFromChange(e.target.value)}
                type="date"
                value={rangeFrom}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span
                className="text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: 'var(--ds-on-surface-variant)' }}
              >
                To
              </span>
              <input
                className="form-input w-[11.5rem] py-2 text-sm"
                min={rangeFrom}
                max={todayIso}
                onChange={(e) => handleToChange(e.target.value)}
                type="date"
                value={rangeTo}
              />
            </label>
            <span className="pb-2 text-xs" style={{ color: 'var(--ds-on-surface-variant)' }}>
              {isFetching ? 'Loading…' : `${dayCount} day${dayCount !== 1 ? 's' : ''} selected`}
            </span>
          </div>
          <button
            className="rounded-lg border px-3 py-2 text-xs font-semibold transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isDefault || isFetching}
            onClick={() => {
              setRangeFrom(defaultFromIso)
              setRangeTo(todayIso)
              void fetchRange(defaultFromIso, todayIso)
            }}
            style={{ borderColor: 'var(--ds-outline-variant)', color: 'var(--ds-on-surface)' }}
            type="button"
          >
            Reset to last 14 days
          </button>
        </div>

        {fetchError && (
          <p className="text-xs" style={{ color: 'var(--ds-error)' }}>{fetchError}</p>
        )}
      </div>

      <div
        className="max-h-[min(420px,55vh)] overflow-auto rounded-lg border"
        style={{ borderColor: 'var(--ds-outline-variant)' }}
      >
      <table className="w-full text-sm">
        <thead
          className="sticky top-0 z-10 bg-white"
          style={{ boxShadow: '0 1px 0 var(--ds-outline-variant)' }}
        >
          <tr>
            <th
              className="sticky left-0 top-0 z-20 bg-white px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wider shadow-[1px_0_0_var(--ds-outline-variant)]"
              style={{ color: 'var(--ds-on-surface-variant)' }}
            >
              User
            </th>
            {allDayKeys.map((day) => {
              const isToday = day === todayKey
              return (
                <th
                  key={day}
                  className="px-1 py-2 text-center text-[9px] font-semibold uppercase tabular-nums"
                  style={{
                    color: isToday ? 'var(--ds-primary)' : 'var(--ds-on-surface-variant)',
                  }}
                >
                  {formatDayShort(day)}
                </th>
              )
            })}
            <th
              className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: 'var(--ds-on-surface-variant)' }}
              title={`Uploads on ${formatDayShort(rangeTo)} (PHT)`}
            >
              End
            </th>
            <th
              className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: 'var(--ds-on-surface-variant)' }}
              title="Sum of uploads in the selected date range (PHT)"
            >
              Total
            </th>
            <th className="w-6 py-2"></th>
          </tr>
        </thead>
        <tbody className="divide-y" style={{ borderColor: 'var(--ds-outline-variant)' }}>
          {data.map((row) => {
            const matchedUser = userByCode.get(row.code)
            const canBrowse = !!matchedUser
            const endCount = heatmapCountForDay(row, rangeTo)
            const rangeTotal = allDayKeys.reduce(
              (sum, day) => sum + heatmapCountForDay(row, day),
              0,
            )
            return (
              <tr
                key={row.code}
                className={
                  canBrowse
                    ? 'group cursor-pointer transition-colors hover:bg-slate-50'
                    : ''
                }
                onClick={() => {
                  if (matchedUser) {
                    onSelectUser({
                      id: matchedUser.id,
                      code: matchedUser.code,
                      name: matchedUser.full_name,
                    })
                  }
                }}
                title={canBrowse ? 'Click to browse this user\'s folders and photos' : undefined}
              >
                <td
                  className="sticky left-0 z-[1] bg-white py-2 pr-3 shadow-[1px_0_0_var(--ds-outline-variant)] transition-colors group-hover:bg-slate-50"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                      style={{
                        backgroundColor: 'var(--ds-surface-container-high)',
                        color: 'var(--ds-on-surface)',
                      }}
                    >
                      {(row.name?.[0] ?? '?').toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-xs font-semibold">{row.name}</div>
                      <div
                        className="truncate font-mono text-[10px]"
                        style={{ color: 'var(--ds-on-surface-variant)' }}
                      >
                        {row.code}
                      </div>
                    </div>
                  </div>
                </td>
                {allDayKeys.map((day) => {
                  const d = row.days.find((x) => x.day === day)
                  const count = d?.count ?? 0
                  return (
                    <td key={day} className="px-0.5 py-1.5">
                      <HeatCell
                        count={count}
                        max={globalMax}
                        day={day}
                        isToday={day === todayKey}
                        onOpen={
                          count > 0 && onHeatCellClick
                            ? (e) => {
                                e.stopPropagation()
                                onHeatCellClick(
                                  {
                                    code: row.code,
                                    name: row.name,
                                    userId: matchedUser?.id ?? null,
                                  },
                                  day,
                                )
                              }
                            : undefined
                        }
                      />
                    </td>
                  )
                })}
                <td
                  className="px-2 py-2 text-right text-sm font-bold tabular-nums"
                  style={{
                    color: endCount > 0 ? 'var(--ds-primary)' : 'var(--ds-on-surface-variant)',
                  }}
                >
                  {endCount}
                </td>
                <td className="px-2 py-2 text-right text-sm font-bold tabular-nums">
                  {rangeTotal}
                </td>
                <td className="pr-2 text-right">
                  {canBrowse ? (
                    <ChevronRight
                      className="h-4 w-4 inline-block"
                      style={{ color: 'var(--ds-on-surface-variant)' }}
                    />
                  ) : null}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      </div>

      <div
        className="mt-3 flex items-center gap-2 text-[10px] uppercase tracking-wider"
        style={{ color: 'var(--ds-on-surface-variant)' }}
      >
        <span>Less</span>
        {[0, 0.25, 0.5, 0.75, 1].map((step) => (
          <span
            key={step}
            className="h-3 w-5 rounded-sm"
            style={{ backgroundColor: heatColor(step) }}
          />
        ))}
        <span>More</span>
      </div>
    </div>
  )
}

function HeatCell({
  count,
  day,
  isToday,
  max,
  onOpen,
}: {
  count: number
  day: string
  isToday: boolean
  max: number
  onOpen?: (e: MouseEvent) => void
}) {
  const intensity = max > 0 ? count / max : 0
  const style: CSSProperties = {
    backgroundColor: heatColor(intensity),
    color: intensity > 0.5 ? 'var(--ds-on-primary)' : 'var(--ds-on-surface)',
    outline: isToday ? `2px solid var(--ds-primary)` : 'none',
    outlineOffset: '-1px',
  }
  const title = `${formatDayShort(day)}: ${count} folder${count === 1 ? '' : 's'}${
    onOpen ? ' · click to list' : ''
  }`

  if (onOpen) {
    return (
      <button
        className="mx-auto flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[10px] font-bold tabular-nums transition-opacity hover:opacity-90"
        onClick={onOpen}
        style={style}
        title={title}
        type="button"
      >
        {count > 0 ? count : ''}
      </button>
    )
  }

  return (
    <div
      className="mx-auto flex h-7 w-7 items-center justify-center rounded-md text-[10px] font-bold tabular-nums"
      style={style}
      title={title}
    >
      {count > 0 ? count : ''}
    </div>
  )
}

function heatColor(intensity: number) {
  if (intensity <= 0) return 'var(--ds-surface-container-high)'
  if (intensity <= 0.25) return '#dee8ff'
  if (intensity <= 0.5) return '#a5c0e8'
  if (intensity <= 0.75) return '#5b85bc'
  return 'var(--ds-primary)'
}

function formatDayShort(iso: string) {
  return new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric' }).format(
    new Date(iso),
  )
}

