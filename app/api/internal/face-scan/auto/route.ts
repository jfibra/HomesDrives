import { NextResponse } from 'next/server'

import { listPortalEvents } from '@/lib/portals/events'
import { processEventPhotoFacesBatch } from '@/lib/server/event-face-processing'

export const runtime = 'nodejs'
export const maxDuration = 300

const DEFAULT_EVENTS_PER_RUN = 2
const DEFAULT_PHOTOS_PER_EVENT = 10

function readBearerToken(request: Request): string {
  const header = request.headers.get('authorization')?.trim() ?? ''
  if (!header.toLowerCase().startsWith('bearer ')) return ''
  return header.slice(7).trim()
}

function readPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return parsed
}

function isAuthorized(request: Request): boolean {
  const expected =
    process.env.FACE_SCAN_CRON_SECRET?.trim() || process.env.CRON_SECRET?.trim() || ''
  if (!expected) return false
  const provided = readBearerToken(request)
  return Boolean(provided) && provided === expected
}

export async function GET(request: Request) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
    }

    const maxEventsPerRun = readPositiveInt(
      process.env.FACE_SCAN_AUTO_EVENTS_PER_RUN,
      DEFAULT_EVENTS_PER_RUN,
    )
    const photosPerEvent = Math.min(
      25,
      readPositiveInt(process.env.FACE_SCAN_AUTO_BATCH_SIZE, DEFAULT_PHOTOS_PER_EVENT),
    )

    const events = await listPortalEvents()
    const summaries: Array<{
      eventId: string
      eventSlug: string
      processed: number
      facesDetected: number
      failed: number
      remaining: number
      done: boolean
    }> = []

    for (const event of events) {
      if (summaries.length >= maxEventsPerRun) break

      const batch = await processEventPhotoFacesBatch({
        eventId: event.id,
        mode: 'pending',
        offset: 0,
        limit: photosPerEvent,
      })

      if (batch.totalPhotos <= 0 || batch.processed <= 0) continue

      const remaining = Math.max(0, batch.totalPhotos - batch.processed)
      summaries.push({
        eventId: event.id,
        eventSlug: event.slug,
        processed: batch.processed,
        facesDetected: batch.facesDetected,
        failed: batch.failed,
        remaining,
        done: Boolean(batch.done),
      })
    }

    return NextResponse.json({
      ok: true,
      scannedEvents: summaries.length,
      events: summaries,
      settings: {
        maxEventsPerRun,
        photosPerEvent,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Auto face scan failed.' },
      { status: 500 },
    )
  }
}
