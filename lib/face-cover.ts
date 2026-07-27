import { createSupabaseAdminClient } from '@/lib/server/albums'
import { boundingBoxArea } from '@/lib/face-dedupe'
import type { BoundingBox, Face, Person } from '@/lib/types/people'

type CoverFaceCandidate = Pick<Face, 'person_id' | 'face_thumbnail_url' | 'bounding_box' | 'confidence'>

function mapBoundingBox(value: unknown): BoundingBox {
  if (!value || typeof value !== 'object') {
    return { x: 0, y: 0, width: 0, height: 0 }
  }
  const box = value as Record<string, unknown>
  return {
    x: Number(box.x) || 0,
    y: Number(box.y) || 0,
    width: Number(box.width) || 0,
    height: Number(box.height) || 0,
  }
}

function mapCoverCandidate(row: Record<string, unknown>): CoverFaceCandidate | null {
  const thumb =
    typeof row.face_thumbnail_url === 'string' && row.face_thumbnail_url.trim()
      ? row.face_thumbnail_url.trim()
      : null
  if (!thumb) return null

  const confidenceRaw = row.detection_confidence ?? row.confidence
  return {
    person_id: String(row.person_id ?? ''),
    face_thumbnail_url: thumb,
    bounding_box: mapBoundingBox(row.bounding_box),
    confidence:
      typeof confidenceRaw === 'number' && Number.isFinite(confidenceRaw) ? confidenceRaw : null,
  }
}

/** Prefer higher detector confidence, then larger face crop (clearer close-up). */
export function compareFacesForCover(
  a: Pick<Face, 'bounding_box' | 'confidence'>,
  b: Pick<Face, 'bounding_box' | 'confidence'>,
): number {
  const confA = a.confidence ?? -1
  const confB = b.confidence ?? -1
  if (confB !== confA) return confB - confA
  return boundingBoxArea(b.bounding_box) - boundingBoxArea(a.bounding_box)
}

export function pickBestCoverFace<T extends Pick<Face, 'face_thumbnail_url' | 'bounding_box' | 'confidence'>>(
  faces: T[],
): T | null {
  const withThumb = faces.filter(
    (face) => typeof face.face_thumbnail_url === 'string' && face.face_thumbnail_url.trim(),
  )
  if (withThumb.length === 0) return null
  return [...withThumb].sort(compareFacesForCover)[0] ?? null
}

async function setPersonCoverUrl(personId: string, coverFaceUrl: string | null): Promise<void> {
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase
    .from('people')
    .update({ cover_face_url: coverFaceUrl })
    .eq('id', personId)
  if (error) throw new Error(error.message)
}

async function getPersonCoverState(personId: string): Promise<{
  coverFaceUrl: string | null
  coverLocked: boolean
}> {
  const supabase = createSupabaseAdminClient()
  const primary = await supabase
    .from('people')
    .select('cover_face_url, cover_locked')
    .eq('id', personId)
    .maybeSingle()

  if (primary.error && /cover_locked/i.test(primary.error.message)) {
    const fallback = await supabase
      .from('people')
      .select('cover_face_url')
      .eq('id', personId)
      .maybeSingle()
    if (fallback.error) throw new Error(fallback.error.message)
    const url =
      typeof fallback.data?.cover_face_url === 'string' && fallback.data.cover_face_url.trim()
        ? fallback.data.cover_face_url.trim()
        : null
    // Without cover_locked column, treat any existing cover as sticky (manual or prior auto).
    return { coverFaceUrl: url, coverLocked: Boolean(url) }
  }

  if (primary.error) throw new Error(primary.error.message)
  const url =
    typeof primary.data?.cover_face_url === 'string' && primary.data.cover_face_url.trim()
      ? primary.data.cover_face_url.trim()
      : null
  return { coverFaceUrl: url, coverLocked: primary.data?.cover_locked === true }
}

export async function refreshPersonCoverFromBestFace(
  personId: string,
  options?: { force?: boolean },
): Promise<string | null> {
  if (!options?.force) {
    const state = await getPersonCoverState(personId)
    if (state.coverLocked || state.coverFaceUrl) {
      return state.coverFaceUrl
    }
  }

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('faces')
    .select('person_id, face_thumbnail_url, bounding_box, detection_confidence')
    .eq('person_id', personId)
    .not('face_thumbnail_url', 'is', null)

  if (error) {
    const fallback = await supabase
      .from('faces')
      .select('person_id, face_thumbnail_url, bounding_box')
      .eq('person_id', personId)
      .not('face_thumbnail_url', 'is', null)
    if (fallback.error) throw new Error(fallback.error.message)
    const candidates = (fallback.data ?? [])
      .map((row) => mapCoverCandidate(row as Record<string, unknown>))
      .filter((face): face is CoverFaceCandidate => Boolean(face))
    const best = pickBestCoverFace(candidates)
    const coverUrl = best?.face_thumbnail_url ?? null
    await setPersonCoverUrl(personId, coverUrl)
    return coverUrl
  }

  const candidates = (data ?? [])
    .map((row) => mapCoverCandidate(row as Record<string, unknown>))
    .filter((face): face is CoverFaceCandidate => Boolean(face))
  const best = pickBestCoverFace(candidates)
  const coverUrl = best?.face_thumbnail_url ?? null
  await setPersonCoverUrl(personId, coverUrl)
  return coverUrl
}

/** Fill missing covers only. Never replace a stored preview (manual or prior auto). */
export async function applyBestCoverFacesToPeople<
  T extends { id: string; cover_face_url: string | null; cover_locked?: boolean },
>(people: T[]): Promise<T[]> {
  if (people.length === 0) return people

  const needingCover = people.filter((person) => !person.cover_locked && !person.cover_face_url)
  if (needingCover.length === 0) return people

  const supabase = createSupabaseAdminClient()
  const personIds = needingCover.map((person) => person.id)
  const { data, error } = await supabase
    .from('faces')
    .select('person_id, face_thumbnail_url, bounding_box, detection_confidence')
    .in('person_id', personIds)
    .not('face_thumbnail_url', 'is', null)

  if (error) {
    const fallback = await supabase
      .from('faces')
      .select('person_id, face_thumbnail_url, bounding_box')
      .in('person_id', personIds)
      .not('face_thumbnail_url', 'is', null)

    if (fallback.error) {
      console.warn('[face-cover] unable to load best cover faces:', fallback.error.message)
      return people
    }

    return applyCandidates(people, fallback.data ?? [])
  }

  return applyCandidates(people, data ?? [])
}

function applyCandidates<T extends { id: string; cover_face_url: string | null; cover_locked?: boolean }>(
  people: T[],
  rows: unknown[],
): T[] {
  const bestByPerson = new Map<string, CoverFaceCandidate>()
  for (const row of rows) {
    const face = mapCoverCandidate(row as Record<string, unknown>)
    if (!face?.person_id) continue
    const existing = bestByPerson.get(face.person_id)
    if (!existing || compareFacesForCover(face, existing) < 0) {
      bestByPerson.set(face.person_id, face)
    }
  }

  return people.map((person) => {
    if (person.cover_locked || person.cover_face_url) return person
    const bestUrl = bestByPerson.get(person.id)?.face_thumbnail_url ?? null
    if (!bestUrl) return person
    return { ...person, cover_face_url: bestUrl } as T
  })
}

export type PersonCoverFaceOption = {
  face_id: string
  face_thumbnail_url: string
  confidence: number | null
}

export async function listPersonCoverFaceOptions(
  personId: string,
  options?: { limit?: number },
): Promise<PersonCoverFaceOption[]> {
  const limit = Math.min(96, Math.max(1, options?.limit ?? 48))
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('faces')
    .select('id, photo_id, face_thumbnail_url, bounding_box, detection_confidence')
    .eq('person_id', personId)
    .not('face_thumbnail_url', 'is', null)

  if (error) {
    const fallback = await supabase
      .from('faces')
      .select('id, photo_id, face_thumbnail_url, bounding_box')
      .eq('person_id', personId)
      .not('face_thumbnail_url', 'is', null)
    if (fallback.error) throw new Error(fallback.error.message)
    return mapCoverOptions(await filterRejectedCoverRows(personId, fallback.data ?? []), limit)
  }

  return mapCoverOptions(await filterRejectedCoverRows(personId, data ?? []), limit)
}

async function filterRejectedCoverRows(personId: string, rows: unknown[]): Promise<unknown[]> {
  if (rows.length === 0) return rows
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('face_rejections')
    .select('photo_id')
    .eq('person_id', personId)

  if (error) {
    if (/face_rejections|does not exist|schema cache/i.test(error.message)) {
      return rows
    }
    console.warn('[face-cover] unable to filter rejections:', error.message)
    return rows
  }

  const rejectedPhotos = new Set((data ?? []).map((row) => String(row.photo_id)))
  if (rejectedPhotos.size === 0) return rows

  return rows.filter((row) => {
    const photoId = String((row as Record<string, unknown>).photo_id ?? '')
    return !rejectedPhotos.has(photoId)
  })
}

function mapCoverOptions(rows: unknown[], limit: number): PersonCoverFaceOption[] {
  const options: Array<PersonCoverFaceOption & { bounding_box: BoundingBox }> = []
  const seen = new Set<string>()

  for (const row of rows) {
    const record = row as Record<string, unknown>
    const url =
      typeof record.face_thumbnail_url === 'string' ? record.face_thumbnail_url.trim() : ''
    if (!url || seen.has(url)) continue
    seen.add(url)
    const confidenceRaw = record.detection_confidence
    options.push({
      face_id: String(record.id),
      face_thumbnail_url: url,
      confidence:
        typeof confidenceRaw === 'number' && Number.isFinite(confidenceRaw) ? confidenceRaw : null,
      bounding_box: mapBoundingBox(record.bounding_box),
    })
  }

  return options
    .sort((a, b) => compareFacesForCover(a, b))
    .slice(0, limit)
    .map(({ face_id, face_thumbnail_url, confidence }) => ({
      face_id,
      face_thumbnail_url,
      confidence,
    }))
}

/** Prefer stored people.cover_face_url over RPC/auto-computed covers. */
export async function hydratePeopleCoversFromDb<
  T extends { id: string; cover_face_url: string | null; cover_locked?: boolean },
>(people: T[]): Promise<T[]> {
  if (people.length === 0) return people

  const supabase = createSupabaseAdminClient()
  const personIds = people.map((person) => person.id)
  const primary = await supabase
    .from('people')
    .select('id, cover_face_url, cover_locked')
    .in('id', personIds)

  let rows: unknown[] | null = primary.data as unknown[] | null
  if (primary.error && /cover_locked/i.test(primary.error.message)) {
    const fallback = await supabase.from('people').select('id, cover_face_url').in('id', personIds)
    if (fallback.error) {
      console.warn('[face-cover] unable to hydrate covers:', fallback.error.message)
      return people
    }
    rows = fallback.data as unknown[] | null
  } else if (primary.error) {
    console.warn('[face-cover] unable to hydrate covers:', primary.error.message)
    return people
  }

  const byId = new Map(
    (rows ?? []).map((row) => {
      const record = row as Record<string, unknown>
      const url =
        typeof record.cover_face_url === 'string' && record.cover_face_url.trim()
          ? record.cover_face_url.trim()
          : null
      return [
        String(record.id),
        {
          cover_face_url: url,
          cover_locked: record.cover_locked === true,
        },
      ] as const
    }),
  )

  return people.map((person) => {
    const stored = byId.get(person.id)
    if (!stored) return person
    if (!stored.cover_face_url && !person.cover_face_url) {
      return { ...person, cover_locked: stored.cover_locked } as T
    }
    if (!stored.cover_face_url) return person
    return {
      ...person,
      cover_face_url: stored.cover_face_url,
      cover_locked: stored.cover_locked,
    } as T
  })
}
