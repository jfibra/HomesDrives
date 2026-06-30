import { getPersonById, getPersonPhotos, getPersonPhotosForEvent } from '@/lib/people'
import { embedFaceFromImage } from '@/lib/server/insightface-client'
import { findSimilarFaces, findSimilarFacesForEvent } from '@/lib/vector-search'
import type { FaceSearchMatch, FaceSearchResult, PersonPhoto } from '@/lib/types/people'
import { FACE_MATCH_THRESHOLD } from '@/lib/types/people'

function groupMatchesByPerson(
  matches: Array<{ person_id: string; similarity: number }>,
): Array<{ personId: string; similarity: number }> {
  const byPerson = new Map<string, number>()

  for (const match of matches) {
    const current = byPerson.get(match.person_id)
    if (current == null || match.similarity > current) {
      byPerson.set(match.person_id, match.similarity)
    }
  }

  return [...byPerson.entries()]
    .map(([personId, similarity]) => ({ personId, similarity }))
    .sort((a, b) => b.similarity - a.similarity)
}

export async function searchPeopleByFaceImage(params: {
  imageBuffer: Buffer
  eventId?: string
  limit?: number
  threshold?: number
  includePhotosForBestMatch?: boolean
}): Promise<FaceSearchResult> {
  const limit = Math.min(24, Math.max(1, params.limit ?? 12))
  const threshold = params.threshold ?? FACE_MATCH_THRESHOLD

  let detected
  try {
    detected = await embedFaceFromImage(params.imageBuffer)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Face search failed.'
    if (/no face detected/i.test(message)) {
      return {
        person: null,
        photos: [],
        bestSimilarity: null,
        matches: [],
        noFaceDetected: true,
      }
    }
    throw error
  }

  const faceMatches = params.eventId
    ? await findSimilarFacesForEvent({
        eventId: params.eventId,
        embedding: detected.embedding,
        threshold,
        limit: Math.max(limit * 3, 12),
      })
    : await findSimilarFaces({
        embedding: detected.embedding,
        threshold,
        limit: Math.max(limit * 3, 12),
      })

  const grouped = groupMatchesByPerson(faceMatches).slice(0, limit)
  const people = await Promise.all(grouped.map((entry) => getPersonById(entry.personId)))

  const matches: FaceSearchMatch[] = []
  for (let index = 0; index < grouped.length; index++) {
    const person = people[index]
    if (!person) continue
    matches.push({
      person,
      similarity: grouped[index].similarity,
    })
  }

  const best = matches[0] ?? null
  let photos: PersonPhoto[] = []

  if (best && params.includePhotosForBestMatch !== false) {
    photos = params.eventId
      ? (
          await getPersonPhotosForEvent({
            personId: best.person.id,
            eventId: params.eventId,
            page: 1,
            pageSize: 48,
          })
        ).items
      : (await getPersonPhotos({ personId: best.person.id, page: 1, pageSize: 48 })).items
  }

  return {
    person: best?.person ?? null,
    photos,
    bestSimilarity: best?.similarity ?? null,
    matches,
    noFaceDetected: false,
  }
}
