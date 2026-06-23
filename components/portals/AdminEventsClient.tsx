'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  CalendarDays,
  Camera,
  ChevronDown,
  Copy,
  Download,
  FolderKanban,
  ImageIcon,
  LogOut,
  Menu,
  Pencil,
  Plus,
  QrCode,
  Settings2,
  Shield,
  Trash2,
  X,
} from 'lucide-react'

import PortalFrame from '@/components/portals/PortalFrame'
import EventQrCode from '@/components/portals/EventQrCode'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { DEFAULT_PORTAL_EVENT_SLUG } from '@/lib/portals/events'
import {
  getAdminEventWorkspacePath,
  getPhotographerPortalUrl,
  getPublicPortalUrl,
  PORTAL_ADMIN_SESSION_KEY,
  PORTAL_API_BASE,
} from '@/lib/portals/constants'
import type { PortalEventWithStats } from '@/lib/portals/types'
import { downloadPortalQrCode } from '@/lib/client/portal-qr-code'
import { useIsMobile } from '@/hooks/use-mobile'

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

export default function AdminEventsClient() {
  const router = useRouter()
  const isMobile = useIsMobile()
  const [adminCode, setAdminCode] = useState('')
  const [events, setEvents] = useState<PortalEventWithStats[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [createName, setCreateName] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<PortalEventWithStats | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [uploadingCoverId, setUploadingCoverId] = useState<string | null>(null)
  const [uploadingQrLogoId, setUploadingQrLogoId] = useState<string | null>(null)
  const [expandedMobileEventIds, setExpandedMobileEventIds] = useState<Set<string>>(() => new Set())

  function toggleMobileEvent(eventId: string) {
    setExpandedMobileEventIds((current) => {
      if (current.has(eventId)) return new Set()
      return new Set([eventId])
    })
  }

  const loadEvents = useCallback(async (code: string) => {
    const res = await fetch(`${PORTAL_API_BASE}/admin/events?adminCode=${encodeURIComponent(code)}`)
    const data = await res.json().catch(() => null)
    if (!res.ok) throw new Error(data?.error || 'Unable to load events.')
    setEvents(Array.isArray(data.events) ? data.events : [])
  }, [])

  useEffect(() => {
    const code = localStorage.getItem(PORTAL_ADMIN_SESSION_KEY)
    if (!code) {
      router.replace('/admin')
      return
    }
    setAdminCode(code)
    void loadEvents(code)
      .catch((err) => setError(getErrorMessage(err, 'Unable to load events.')))
      .finally(() => setLoading(false))
  }, [loadEvents, router])

  function handleSignOut() {
    localStorage.removeItem(PORTAL_ADMIN_SESSION_KEY)
    router.replace('/admin')
  }

  async function handleCreateEvent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!adminCode || !createName.trim()) return
    setIsCreating(true)
    setError('')
    try {
      const res = await fetch(`${PORTAL_API_BASE}/admin/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminCode, name: createName.trim() }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Unable to create event.')
      setCreateName('')
      await loadEvents(adminCode)
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to create event.'))
    } finally {
      setIsCreating(false)
    }
  }

  async function handleRenameEvent(eventId: string) {
    if (!adminCode || !editingName.trim()) return
    setError('')
    try {
      const res = await fetch(`${PORTAL_API_BASE}/admin/events/${eventId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminCode, name: editingName.trim() }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Unable to rename event.')
      setEditingId(null)
      setEditingName('')
      await loadEvents(adminCode)
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to rename event.'))
    }
  }

  async function handleCoverUpload(eventId: string, file: File) {
    if (!adminCode) return
    setUploadingCoverId(eventId)
    setError('')
    try {
      const formData = new FormData()
      formData.append('adminCode', adminCode)
      formData.append('file', file)

      const res = await fetch(`${PORTAL_API_BASE}/admin/events/${eventId}/cover`, {
        method: 'POST',
        body: formData,
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Unable to upload background photo.')
      await loadEvents(adminCode)
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to upload background photo.'))
    } finally {
      setUploadingCoverId(null)
    }
  }

  async function handleRemoveCover(eventId: string) {
    if (!adminCode) return
    setUploadingCoverId(eventId)
    setError('')
    try {
      const res = await fetch(`${PORTAL_API_BASE}/admin/events/${eventId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminCode, coverImageUrl: null }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Unable to remove background photo.')
      await loadEvents(adminCode)
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to remove background photo.'))
    } finally {
      setUploadingCoverId(null)
    }
  }

  async function handleQrLogoUpload(eventId: string, file: File) {
    if (!adminCode) return
    setUploadingQrLogoId(eventId)
    setError('')
    try {
      const formData = new FormData()
      formData.append('adminCode', adminCode)
      formData.append('file', file)

      const res = await fetch(`${PORTAL_API_BASE}/admin/events/${eventId}/qr-logo`, {
        method: 'POST',
        body: formData,
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Unable to upload QR logo.')
      await loadEvents(adminCode)
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to upload QR logo.'))
    } finally {
      setUploadingQrLogoId(null)
    }
  }

  async function handleRemoveQrLogo(eventId: string) {
    if (!adminCode) return
    setUploadingQrLogoId(eventId)
    setError('')
    try {
      const res = await fetch(`${PORTAL_API_BASE}/admin/events/${eventId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminCode, qrLogoUrl: null }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Unable to remove QR logo.')
      await loadEvents(adminCode)
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to remove QR logo.'))
    } finally {
      setUploadingQrLogoId(null)
    }
  }

  async function handleDeleteEvent() {
    if (!adminCode || !deleteTarget) return
    setIsDeleting(true)
    setError('')
    try {
      const res = await fetch(`${PORTAL_API_BASE}/admin/events/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminCode }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Unable to delete event.')
      setDeleteTarget(null)
      await loadEvents(adminCode)
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to delete event.'))
    } finally {
      setIsDeleting(false)
    }
  }

  async function copyText(key: string, value: string) {
    try {
      await navigator.clipboard.writeText(value)
      setCopiedKey(key)
      window.setTimeout(() => setCopiedKey((current) => (current === key ? null : current)), 1800)
    } catch {
      setError('Unable to copy link.')
    }
  }

  async function handleDownloadQr(url: string, filename: string, logoUrl?: string | null) {
    try {
      await downloadPortalQrCode(url, filename, { logoUrl })
    } catch {
      setError('Unable to download QR code.')
    }
  }

  return (
    <PortalFrame
      actions={
        adminCode ? (
          <div className="flex w-full flex-row items-center justify-end gap-2 sm:w-auto">
            <button
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 sm:min-h-0 sm:flex-none"
              onClick={handleSignOut}
              type="button"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        ) : null
      }
      badge="Admin Portal"
      title="Events dashboard"
      variant="admin"
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 sm:gap-6">
        <section className="overflow-hidden rounded-2xl border border-white/80 bg-white/90 p-4 shadow-[0_20px_60px_-12px_rgba(16,35,63,0.12)] sm:rounded-[1.75rem] sm:p-6 md:p-8">
          <div className="mb-4 flex items-start gap-3 sm:mb-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#10233f] text-white sm:h-11 sm:w-11">
              <Plus className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-[#10233f] sm:text-lg">Create a new event</h2>
            </div>
          </div>

          <form className="flex flex-col gap-3 sm:flex-row" onSubmit={handleCreateEvent}>
            <input
              className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm outline-none transition focus:border-[#10233f] focus:bg-white focus:ring-2 focus:ring-[#10233f]/10"
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="e.g. Homes.ph Brokers Gathering 2026"
              value={createName}
            />
            <button
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#10233f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#1a3358] disabled:opacity-60 sm:min-h-0 sm:w-auto"
              disabled={isCreating || !createName.trim()}
              type="submit"
            >
              <Plus className="h-4 w-4" />
              {isCreating ? 'Creating…' : 'Create event'}
            </button>
          </form>
        </section>

        {error ? (
          <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <section className="overflow-hidden rounded-2xl border border-white/80 bg-white/90 shadow-[0_20px_60px_-12px_rgba(16,35,63,0.12)] sm:rounded-[1.75rem]">
          <div className="border-b border-slate-100 px-4 py-4 sm:px-6 sm:py-5 md:px-8">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-[#10233f] sm:h-11 sm:w-11">
                <FolderKanban className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-[#10233f] sm:text-lg">Your events</h2>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="px-4 py-8 text-sm text-slate-500 sm:px-6 sm:py-10 md:px-8">Loading events…</div>
          ) : events.length === 0 ? (
            <div className="px-4 py-8 text-sm text-slate-500 sm:px-6 sm:py-10 md:px-8">
              No events yet. Create your first event above.
            </div>
          ) : (
            <div className="flex flex-col gap-3 p-3 sm:gap-4 sm:p-4 md:p-6">
              {events.map((portalEvent) => {
                const photographerUrl = getPhotographerPortalUrl(portalEvent.slug)
                const publicUrl = getPublicPortalUrl(portalEvent.slug)
                const workspacePath = getAdminEventWorkspacePath(portalEvent.slug)
                const isEditing = editingId === portalEvent.id
                const isDefaultEvent = portalEvent.slug === DEFAULT_PORTAL_EVENT_SLUG
                const hasCover = Boolean(portalEvent.cover_image_url)
                const hasQrLogo = Boolean(portalEvent.qr_logo_url)
                const isUploadingCover = uploadingCoverId === portalEvent.id
                const isUploadingQrLogo = uploadingQrLogoId === portalEvent.id
                const isUploadingAssets = isUploadingCover || isUploadingQrLogo
                const coverInputId = `event-cover-${portalEvent.id}`
                const qrLogoInputId = `event-qr-logo-${portalEvent.id}`
                const isMobileExpanded = expandedMobileEventIds.has(portalEvent.id)
                const showFullEventDetails = !isMobile || isMobileExpanded || isEditing

                return (
                  <article
                    className={`group relative overflow-hidden rounded-xl border border-[#1428AE]/15 px-4 sm:rounded-2xl sm:px-6 md:px-8 ${
                      showFullEventDetails ? 'py-4 sm:py-6 md:py-6' : 'py-3 md:py-6'
                    }`}
                    key={portalEvent.id}
                  >
                    {hasCover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        alt=""
                        className="absolute inset-0 z-0 h-full w-full object-cover transition duration-300 md:group-hover:scale-[1.02]"
                        src={portalEvent.cover_image_url ?? undefined}
                      />
                    ) : null}
                    {!isEditing && showFullEventDetails ? (
                      <Link
                        aria-label={`Manage ${portalEvent.name}`}
                        className="absolute inset-0 z-[1] hidden cursor-pointer md:block"
                        href={workspacePath}
                      />
                    ) : null}
                    <div
                      aria-hidden
                      className={`pointer-events-none absolute inset-0 z-[2] transition duration-300 ${
                        hasCover
                          ? 'bg-[#1428AE]/55 group-hover:bg-[#1428AE]/65'
                          : 'bg-[#1428AE]/10 group-hover:bg-[#1428AE]/15'
                      }`}
                    />
                    <div className="relative z-10 pointer-events-none">
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/80 text-[#10233f] backdrop-blur-sm sm:h-10 sm:w-10">
                        {portalEvent.qr_logo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            alt={`${portalEvent.name} logo`}
                            className="h-full w-full object-cover"
                            src={portalEvent.qr_logo_url}
                          />
                        ) : (
                          <Shield className="h-4 w-4" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        {isEditing ? (
                          <div className="pointer-events-auto flex flex-col gap-3 sm:flex-row">
                            <input
                              className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#10233f] focus:ring-2 focus:ring-[#10233f]/10"
                              onChange={(e) => setEditingName(e.target.value)}
                              value={editingName}
                            />
                            <div className="flex gap-2">
                              <button
                                className="rounded-xl bg-[#10233f] px-4 py-2 text-sm font-semibold text-white"
                                onClick={() => void handleRenameEvent(portalEvent.id)}
                                type="button"
                              >
                                Save
                              </button>
                              <button
                                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
                                onClick={() => {
                                  setEditingId(null)
                                  setEditingName('')
                                }}
                                type="button"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <h3
                              className={`text-base font-semibold leading-snug sm:text-lg md:text-xl ${hasCover ? 'text-white' : 'text-[#10233f]'}`}
                            >
                              {portalEvent.name}
                            </h3>
                            {showFullEventDetails ? (
                              <p
                                className={`mt-1 break-all text-sm ${hasCover ? 'text-white/80' : 'text-slate-500'}`}
                              >
                                /{portalEvent.slug}
                              </p>
                            ) : (
                              <p
                                className={`mt-1 truncate text-xs ${hasCover ? 'text-white/80' : 'text-slate-500'}`}
                              >
                                /{portalEvent.slug} · {portalEvent.folder_count} folder
                                {portalEvent.folder_count !== 1 ? 's' : ''}
                              </p>
                            )}
                          </>
                        )}
                        {showFullEventDetails ? (
                          <div
                            className={`mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs ${hasCover ? 'text-white/75' : 'text-slate-500'}`}
                          >
                            <span className="inline-flex items-center gap-1.5">
                              <CalendarDays className="h-3.5 w-3.5" />
                              Created {new Date(portalEvent.created_at).toLocaleDateString()}
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                              <FolderKanban className="h-3.5 w-3.5" />
                              {portalEvent.folder_count} folder{portalEvent.folder_count !== 1 ? 's' : ''}
                            </span>
                            {isDefaultEvent ? (
                              <span
                                className={`rounded-full px-2 py-0.5 font-semibold ${hasCover ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}
                              >
                                Default event
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                      {isMobile ? (
                        <button
                          aria-expanded={isMobileExpanded}
                          aria-label={isMobileExpanded ? `Collapse ${portalEvent.name}` : `Expand ${portalEvent.name}`}
                          className={`pointer-events-auto shrink-0 rounded-xl border p-2.5 transition ${
                            hasCover
                              ? 'border-white/30 bg-white/15 text-white hover:bg-white/25'
                              : 'border-[#1428AE]/20 bg-white/80 text-[#10233f] hover:bg-white'
                          }`}
                          onClick={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            toggleMobileEvent(portalEvent.id)
                          }}
                          type="button"
                        >
                          {isMobileExpanded ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                        </button>
                      ) : null}
                    </div>

                      <div
                        className={`pointer-events-auto flex w-full shrink-0 md:w-auto ${showFullEventDetails ? 'flex' : 'hidden md:flex'}`}
                      >
                        <input
                          accept="image/*"
                          className="hidden"
                          disabled={isUploadingAssets}
                          id={coverInputId}
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            e.target.value = ''
                            if (file) void handleCoverUpload(portalEvent.id, file)
                          }}
                          type="file"
                        />
                        <input
                          accept="image/*"
                          className="hidden"
                          disabled={isUploadingAssets}
                          id={qrLogoInputId}
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            e.target.value = ''
                            if (file) void handleQrLogoUpload(portalEvent.id, file)
                          }}
                          type="file"
                        />
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            className={`inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#D51C39] bg-[#D51C39] px-4 py-2 text-sm font-semibold text-white transition outline-none hover:bg-[#b81832] focus-visible:ring-2 focus-visible:ring-[#D51C39]/30 sm:min-h-0 sm:w-auto sm:justify-start ${isUploadingAssets ? 'pointer-events-none opacity-60' : ''}`}
                            disabled={isUploadingAssets}
                          >
                            <Settings2 className="h-4 w-4" />
                            {isUploadingAssets ? 'Uploading…' : 'Manage'}
                            <ChevronDown className="h-4 w-4 opacity-70" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-[min(12rem,calc(100vw-2rem))] rounded-xl">
                            <DropdownMenuItem
                              onSelect={(e) => {
                                e.preventDefault()
                                document.getElementById(coverInputId)?.click()
                              }}
                            >
                              <ImageIcon className="h-4 w-4" />
                              {hasCover ? 'Change photo' : 'Add photo'}
                            </DropdownMenuItem>
                            {hasCover ? (
                              <DropdownMenuItem
                                onSelect={() => void handleRemoveCover(portalEvent.id)}
                              >
                                <ImageIcon className="h-4 w-4" />
                                Remove photo
                              </DropdownMenuItem>
                            ) : null}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onSelect={(e) => {
                                e.preventDefault()
                                document.getElementById(qrLogoInputId)?.click()
                              }}
                            >
                              <QrCode className="h-4 w-4" />
                              {hasQrLogo ? 'Change QR logo' : 'Add QR logo'}
                            </DropdownMenuItem>
                            {hasQrLogo ? (
                              <DropdownMenuItem
                                onSelect={() => void handleRemoveQrLogo(portalEvent.id)}
                              >
                                <QrCode className="h-4 w-4" />
                                Remove QR logo
                              </DropdownMenuItem>
                            ) : null}
                            <DropdownMenuSeparator />
                            {!isEditing ? (
                              <DropdownMenuItem
                                onSelect={() => {
                                  setEditingId(portalEvent.id)
                                  setEditingName(portalEvent.name)
                                }}
                              >
                                <Pencil className="h-4 w-4" />
                                Rename
                              </DropdownMenuItem>
                            ) : null}
                            <DropdownMenuItem asChild>
                              <Link href={workspacePath}>
                                <Settings2 className="h-4 w-4" />
                                Manage event
                              </Link>
                            </DropdownMenuItem>
                            {!isDefaultEvent ? (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onSelect={() => setDeleteTarget(portalEvent)}
                                  variant="destructive"
                                >
                                  <Trash2 className="h-4 w-4" />
                                  Delete
                                </DropdownMenuItem>
                              </>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>

                    <div
                      className={`pointer-events-auto grid items-stretch gap-3 sm:mt-5 md:grid-cols-2 ${showFullEventDetails ? 'mt-4' : 'hidden md:mt-4 md:grid'}`}
                    >
                      <div className="flex h-full flex-col rounded-xl border border-white/30 bg-white/45 p-3 backdrop-blur-sm sm:rounded-2xl sm:p-4">
                        <div className="flex flex-1 flex-col gap-4 sm:flex-row sm:items-stretch">
                          <div className="flex min-w-0 flex-1 flex-col">
                            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#10233f]">
                              <Camera className="h-4 w-4 shrink-0 text-[#c6603d]" />
                              Photographer link
                            </div>
                            <p className="flex-1 break-all text-xs leading-relaxed text-slate-600 sm:text-sm">
                              {photographerUrl}
                            </p>
                            <div className="mt-3 flex flex-row items-center gap-2">
                              <button
                                className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 sm:flex-none sm:px-3"
                                onClick={() => void copyText(`photo-${portalEvent.id}`, photographerUrl)}
                                type="button"
                              >
                                <Copy className="h-3.5 w-3.5" />
                                {copiedKey === `photo-${portalEvent.id}` ? 'Copied' : 'Copy link'}
                              </button>
                              <button
                                className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 sm:flex-none sm:px-3"
                                onClick={() =>
                                  void handleDownloadQr(
                                    photographerUrl,
                                    `${portalEvent.slug}-photographer-qr.png`,
                                    portalEvent.qr_logo_url,
                                  )
                                }
                                type="button"
                              >
                                <QrCode className="h-3.5 w-3.5" />
                                Download QR
                              </button>
                            </div>
                          </div>
                          <div className="w-fit shrink-0 self-center rounded-xl border border-white/70 bg-white p-2 shadow-sm sm:self-start">
                            <EventQrCode
                              alt={`QR code for ${portalEvent.name} photographer link`}
                              className="h-24 w-24 sm:h-20 sm:w-20"
                              enabled={showFullEventDetails}
                              logoUrl={portalEvent.qr_logo_url}
                              previewSize={isMobile ? 120 : 160}
                              targetUrl={photographerUrl}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="flex h-full flex-col rounded-xl border border-white/30 bg-white/45 p-3 backdrop-blur-sm sm:rounded-2xl sm:p-4">
                        <div className="flex flex-1 flex-col gap-4 sm:flex-row sm:items-stretch">
                          <div className="flex min-w-0 flex-1 flex-col">
                            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#10233f]">
                              <Download className="h-4 w-4 shrink-0 text-[#2563eb]" />
                              Public download link
                            </div>
                            <p className="flex-1 break-all text-xs leading-relaxed text-slate-600 sm:text-sm">
                              {publicUrl}
                            </p>
                            <div className="mt-3 flex flex-row items-center gap-2">
                              <button
                                className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 sm:flex-none sm:px-3"
                                onClick={() => void copyText(`public-${portalEvent.id}`, publicUrl)}
                                type="button"
                              >
                                <Copy className="h-3.5 w-3.5" />
                                {copiedKey === `public-${portalEvent.id}` ? 'Copied' : 'Copy link'}
                              </button>
                              <button
                                className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 sm:flex-none sm:px-3"
                                onClick={() =>
                                  void handleDownloadQr(
                                    publicUrl,
                                    `${portalEvent.slug}-public-qr.png`,
                                    portalEvent.qr_logo_url,
                                  )
                                }
                                type="button"
                              >
                                <QrCode className="h-3.5 w-3.5" />
                                Download QR
                              </button>
                            </div>
                          </div>
                          <div className="w-fit shrink-0 self-center rounded-xl border border-white/70 bg-white p-2 shadow-sm sm:self-start">
                            <EventQrCode
                              alt={`QR code for ${portalEvent.name} public download link`}
                              className="h-24 w-24 sm:h-20 sm:w-20"
                              enabled={showFullEventDetails}
                              logoUrl={portalEvent.qr_logo_url}
                              previewSize={isMobile ? 120 : 160}
                              targetUrl={publicUrl}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </div>

      <Dialog onOpenChange={(open) => !open && !isDeleting && setDeleteTarget(null)} open={!!deleteTarget}>
        <DialogContent className="rounded-2xl border-slate-200 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#10233f]">Delete event?</DialogTitle>
            <DialogDescription>
              {deleteTarget
                ? `"${deleteTarget.name}" will be removed from the admin dashboard and its photographer/public links will stop working. Existing folders (${deleteTarget.folder_count}) stay in storage but are no longer tied to this event.`
                : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <button
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
              disabled={isDeleting}
              onClick={() => setDeleteTarget(null)}
              type="button"
            >
              Cancel
            </button>
            <button
              className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
              disabled={isDeleting}
              onClick={() => void handleDeleteEvent()}
              type="button"
            >
              {isDeleting ? 'Deleting…' : 'Delete event'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PortalFrame>
  )
}
