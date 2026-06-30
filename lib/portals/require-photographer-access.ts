import { requirePortalEventBySlug, toPublicPortalEvent } from '@/lib/portals/events'
import { readPhotographerAccessToken, requirePhotographerAccess } from '@/lib/portals/photographer-access'

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

export function publicEventResponse(event: Awaited<ReturnType<typeof requirePhotographerAccessFromRequest>>) {
  return toPublicPortalEvent(event)
}
