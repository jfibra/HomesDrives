import { createSupabaseAdminClient } from '@/lib/server/albums'

import type { PortalEvent } from './types'

export const DEFAULT_PORTAL_EVENT_SLUG = 'homes-ph-event'

const PORTAL_EVENT_SELECT = 'id, name, slug, status, created_at, updated_at'

function mapPortalEvent(row: Record<string, unknown>): PortalEvent {
  return {
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    status: String(row.status ?? 'active'),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at ?? row.created_at),
  }
}

export function slugifyPortalEventName(name: string) {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return base || 'event'
}

async function ensureUniqueSlug(baseSlug: string) {
  const supabaseAdmin = createSupabaseAdminClient()
  let slug = baseSlug
  let suffix = 2

  while (true) {
    const { data, error } = await supabaseAdmin
      .from('portal_events')
      .select('id')
      .eq('slug', slug)
      .maybeSingle()

    if (error) throw new Error(error.message)
    if (!data) return slug

    slug = `${baseSlug}-${suffix}`
    suffix += 1
  }
}

export async function listPortalEvents(): Promise<PortalEvent[]> {
  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin
    .from('portal_events')
    .select(PORTAL_EVENT_SELECT)
    .eq('status', 'active')
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => mapPortalEvent(row as Record<string, unknown>))
}

export async function getPortalEventBySlug(slug: string): Promise<PortalEvent | null> {
  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin
    .from('portal_events')
    .select(PORTAL_EVENT_SELECT)
    .eq('slug', slug.trim())
    .eq('status', 'active')
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data ? mapPortalEvent(data as Record<string, unknown>) : null
}

export async function getPortalEventById(id: string): Promise<PortalEvent | null> {
  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin
    .from('portal_events')
    .select(PORTAL_EVENT_SELECT)
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data ? mapPortalEvent(data as Record<string, unknown>) : null
}

export async function getDefaultPortalEvent(): Promise<PortalEvent> {
  const event = await getPortalEventBySlug(DEFAULT_PORTAL_EVENT_SLUG)
  if (!event) {
    throw new Error('Default portal event is not configured. Run database/portal-events.sql.')
  }
  return event
}

export async function requirePortalEventBySlug(slug: string): Promise<PortalEvent> {
  const event = await getPortalEventBySlug(slug)
  if (!event) {
    throw new Error('Event not found.')
  }
  return event
}

export async function createPortalEvent(name: string): Promise<PortalEvent> {
  const trimmedName = name.trim()
  if (!trimmedName) {
    throw new Error('Event name is required.')
  }

  const slug = await ensureUniqueSlug(slugifyPortalEventName(trimmedName))
  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin
    .from('portal_events')
    .insert({
      name: trimmedName,
      slug,
      status: 'active',
    })
    .select(PORTAL_EVENT_SELECT)
    .single()

  if (error) throw new Error(error.message)
  return mapPortalEvent(data as Record<string, unknown>)
}

export async function updatePortalEvent(
  id: string,
  updates: { name?: string; slug?: string },
): Promise<PortalEvent> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (updates.name !== undefined) {
    const trimmedName = updates.name.trim()
    if (!trimmedName) throw new Error('Event name is required.')
    patch.name = trimmedName
  }

  if (updates.slug !== undefined) {
    const trimmedSlug = slugifyPortalEventName(updates.slug)
    if (!trimmedSlug) throw new Error('Event slug is required.')
    patch.slug = trimmedSlug
  }

  if (Object.keys(patch).length === 1) {
    throw new Error('No event updates provided.')
  }

  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin
    .from('portal_events')
    .update(patch)
    .eq('id', id)
    .select(PORTAL_EVENT_SELECT)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) throw new Error('Event not found.')
  return mapPortalEvent(data as Record<string, unknown>)
}

export async function assertPortalFolderInEvent(folderId: string, eventId: string) {
  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin
    .from('albums_folders')
    .select('id, portal_event_id')
    .eq('id', folderId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data || data.portal_event_id !== eventId) {
    throw new Error('Folder not found for this event.')
  }
}

export function getEventSlugFromRequest(request: Request) {
  const { searchParams } = new URL(request.url)
  return searchParams.get('eventSlug')?.trim() ?? ''
}

export async function requirePortalEventFromRequest(request: Request) {
  const eventSlug = getEventSlugFromRequest(request)
  if (!eventSlug) {
    throw new Error('Missing eventSlug.')
  }
  return requirePortalEventBySlug(eventSlug)
}
