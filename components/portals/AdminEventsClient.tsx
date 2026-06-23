'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowRight,
  CalendarDays,
  Camera,
  Copy,
  Download,
  FolderKanban,
  LogOut,
  Pencil,
  Plus,
  RefreshCw,
  Settings2,
  Shield,
  Trash2,
} from 'lucide-react'

import PortalFrame from '@/components/portals/PortalFrame'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DEFAULT_PORTAL_EVENT_SLUG } from '@/lib/portals/events'
import {
  getAdminEventWorkspacePath,
  getPhotographerPortalUrl,
  getPublicPortalUrl,
  PORTAL_ADMIN_SESSION_KEY,
  PORTAL_API_BASE,
} from '@/lib/portals/constants'
import type { PortalEventWithStats } from '@/lib/portals/types'

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

export default function AdminEventsClient() {
  const router = useRouter()
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

  return (
    <PortalFrame
      actions={
        adminCode ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              onClick={() => void loadEvents(adminCode).catch((err) => setError(getErrorMessage(err, 'Unable to refresh.')))}
              type="button"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
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
      subtitle="Create events, manage folders and uploads, copy portal links, rename events, or delete events you no longer need."
      title="Events dashboard"
      variant="admin"
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <section className="overflow-hidden rounded-[1.75rem] border border-white/80 bg-white/90 p-6 shadow-[0_20px_60px_-12px_rgba(16,35,63,0.12)] sm:p-8">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#10233f] text-white">
              <Plus className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[#10233f]">Create a new event</h2>
              <p className="text-sm text-slate-500">
                Each event gets its own folders, photographer upload link, and public download link.
              </p>
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
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#10233f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#1a3358] disabled:opacity-60"
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

        <section className="overflow-hidden rounded-[1.75rem] border border-white/80 bg-white/90 shadow-[0_20px_60px_-12px_rgba(16,35,63,0.12)]">
          <div className="border-b border-slate-100 px-6 py-5 sm:px-8">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-[#10233f]">
                <FolderKanban className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-[#10233f]">Your events</h2>
                <p className="text-sm text-slate-500">
                  Manage folders and photos, copy portal links, rename events, or delete unused events.
                </p>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="px-6 py-10 text-sm text-slate-500 sm:px-8">Loading events…</div>
          ) : events.length === 0 ? (
            <div className="px-6 py-10 text-sm text-slate-500 sm:px-8">
              No events yet. Create your first event above.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {events.map((portalEvent) => {
                const photographerUrl = getPhotographerPortalUrl(portalEvent.slug)
                const publicUrl = getPublicPortalUrl(portalEvent.slug)
                const workspacePath = getAdminEventWorkspacePath(portalEvent.slug)
                const isEditing = editingId === portalEvent.id
                const isDefaultEvent = portalEvent.slug === DEFAULT_PORTAL_EVENT_SLUG

                return (
                  <article className="px-6 py-6 sm:px-8" key={portalEvent.id}>
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#10233f]/8 text-[#10233f]">
                            <Shield className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            {isEditing ? (
                              <div className="flex flex-col gap-3 sm:flex-row">
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
                                <h3 className="text-xl font-semibold text-[#10233f]">{portalEvent.name}</h3>
                                <p className="mt-1 text-sm text-slate-500">/{portalEvent.slug}</p>
                              </>
                            )}
                            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                              <span className="inline-flex items-center gap-1.5">
                                <CalendarDays className="h-3.5 w-3.5" />
                                Created {new Date(portalEvent.created_at).toLocaleDateString()}
                              </span>
                              <span className="inline-flex items-center gap-1.5">
                                <FolderKanban className="h-3.5 w-3.5" />
                                {portalEvent.folder_count} folder{portalEvent.folder_count !== 1 ? 's' : ''}
                              </span>
                              {isDefaultEvent ? (
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">
                                  Default event
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {!isEditing ? (
                          <button
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                            onClick={() => {
                              setEditingId(portalEvent.id)
                              setEditingName(portalEvent.name)
                            }}
                            type="button"
                          >
                            <Pencil className="h-4 w-4" />
                            Rename
                          </button>
                        ) : null}
                        <Link
                          className="inline-flex items-center gap-2 rounded-xl bg-[#10233f] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1a3358]"
                          href={workspacePath}
                        >
                          <Settings2 className="h-4 w-4" />
                          Manage event
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                        {!isDefaultEvent ? (
                          <button
                            className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50"
                            onClick={() => setDeleteTarget(portalEvent)}
                            type="button"
                          >
                            <Trash2 className="h-4 w-4" />
                            Delete
                          </button>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-5 grid gap-3 lg:grid-cols-2">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#10233f]">
                          <Camera className="h-4 w-4 text-[#c6603d]" />
                          Photographer link
                        </div>
                        <p className="break-all text-sm text-slate-600">{photographerUrl}</p>
                        <button
                          className="mt-3 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                          onClick={() => void copyText(`photo-${portalEvent.id}`, photographerUrl)}
                          type="button"
                        >
                          <Copy className="h-3.5 w-3.5" />
                          {copiedKey === `photo-${portalEvent.id}` ? 'Copied' : 'Copy link'}
                        </button>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#10233f]">
                          <Download className="h-4 w-4 text-[#2563eb]" />
                          Public download link
                        </div>
                        <p className="break-all text-sm text-slate-600">{publicUrl}</p>
                        <button
                          className="mt-3 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                          onClick={() => void copyText(`public-${portalEvent.id}`, publicUrl)}
                          type="button"
                        >
                          <Copy className="h-3.5 w-3.5" />
                          {copiedKey === `public-${portalEvent.id}` ? 'Copied' : 'Copy link'}
                        </button>
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
