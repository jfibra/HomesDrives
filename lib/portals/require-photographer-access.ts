import { requirePortalEventBySlug, toPublicPortalEvent } from '@/lib/portals/events'
import { requireEventPhotographerForEvent } from '@/lib/portals/event-photographers'
import {
  readPhotographerAccessToken,
  requirePhotographerAccess,
} from '@/lib/portals/photographer-access'
import { readPhotographerIdFromRequest } from '@/lib/portals/photographer-identity'

export async function requirePhotographerAccessFromRequest(
  request: Request,
  eventSlug: string,
  body?: Record<string, unknown> | null,
) {
  const event = await requirePortalEventBySlug(eventSlug)
  await requirePhotographerAccess({
    eventId: event.id,
    pinHash: event.photographer_pin_hash,
    accessToken: readPhotographerAccessToken(request, body),
  })
  return event
}

export async function requirePhotographerSessionFromRequest(
  request: Request,
  eventSlug: string,
  body?: Record<string, unknown> | null,
) {
  const event = await requirePhotographerAccessFromRequest(request, eventSlug, body)
  const photographerId = readPhotographerIdFromRequest(request, body)
  const photographer = await requireEventPhotographerForEvent(photographerId, event.id)
  return { event, photographer }
}

export function publicEventResponse(event: Awaited<ReturnType<typeof requirePhotographerAccessFromRequest>>) {
  return toPublicPortalEvent(event)
}
