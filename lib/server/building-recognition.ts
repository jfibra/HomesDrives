import {
  countBuildingReferencePhotos,
  deleteBuildingReferencePhoto,
  getBuildingById,
  getBuildingWithPhotos,
  getBuildingsByIds,
  insertBuilding,
  insertBuildingEmbedding,
  listBuildingReferencePhotos,
  matchBuildingsByEmbedding,
  updateBuilding,
} from '@/lib/buildings'
import { embedBuildingWithViews } from '@/lib/server/building-client'
import {
  buildPublicImageUrl,
  uploadImageObject,
} from '@/lib/server/albums'
import type {
  Building,
  BuildingListing,
  BuildingMatch,
  BuildingRecognitionResult,
  BuildingRegisterInput,
  BuildingWithPhotos,
} from '@/lib/types/buildings'
import { getMatchConfidence } from '@/lib/types/buildings'
import {
  BUILDING_GPS_RADIUS_KM,
  BUILDING_MATCH_DB_THRESHOLD,
  BUILDING_MATCH_MIN_MARGIN,
  BUILDING_MATCH_THRESHOLD,
  MAX_BUILDING_REFERENCE_PHOTOS,
} from '@/lib/types/buildings'

const MAX_BUILDING_IMAGE_EDGE = 1280

async function prepareBuildingImageBuffer(imageBuffer: Buffer): Promise<Buffer> {
  const sharp = (await import('sharp')).default
  return sharp(imageBuffer)
    .rotate()
    .resize({
      width: MAX_BUILDING_IMAGE_EDGE,
      height: MAX_BUILDING_IMAGE_EDGE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer()
}

function parseOptionalNumber(value: unknown): number | null {
  if (value == null || value === '') return null
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value))
  return Number.isFinite(parsed) ? parsed : null
}

export function parseBuildingListingsInput(value: unknown): BuildingListing[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null
        const row = entry as Record<string, unknown>
        const title = typeof row.title === 'string' ? row.title.trim() : ''
        if (!title) return null
        return {
          title,
          price: typeof row.price === 'string' ? row.price.trim() : row.price == null ? null : String(row.price),
          beds: parseOptionalNumber(row.beds),
          baths: parseOptionalNumber(row.baths),
          description: typeof row.description === 'string' ? row.description.trim() : null,
        } satisfies BuildingListing
      })
      .filter((entry): entry is BuildingListing => Boolean(entry))
  }

  if (typeof value === 'string' && value.trim()) {
    try {
      return parseBuildingListingsInput(JSON.parse(value))
    } catch {
      throw new Error('Listings must be valid JSON when provided as text.')
    }
  }

  return []
}

async function uploadBuildingReferenceImage(imageBuffer: Buffer, buildingName: string, index: number) {
  const uploaded = await uploadImageObject({
    contentType: 'image/jpeg',
    fileBuffer: imageBuffer,
    fileName: `${buildingName.replace(/\s+/g, '-').toLowerCase()}-angle-${index + 1}.jpg`,
    uploaderName: 'building-testing',
  })

  return buildPublicImageUrl(uploaded.bucketName, uploaded.storagePath)
}

async function processBuildingReferencePhoto(imageBuffer: Buffer, buildingName: string, index: number) {
  const prepared = await prepareBuildingImageBuffer(imageBuffer)
  const embedded = await embedBuildingWithViews(prepared)
  if (!embedded.quality.ok) {
    throw new Error(embedded.quality.message ?? 'Reference photo quality is too low. Use a sharper, well-lit photo.')
  }

  const [imageUrl] = await Promise.all([
    uploadBuildingReferenceImage(prepared, buildingName, index),
  ])

  return { embedding: embedded.embedding, imageUrl }
}

export async function registerBuildingWithPhotos(params: {
  input: BuildingRegisterInput
  imageBuffers: Buffer[]
}): Promise<Building> {
  const name = params.input.name.trim()
  if (!name) throw new Error('Building name is required.')
  if (params.imageBuffers.length === 0) {
    throw new Error('Add at least one building photo.')
  }
  if (params.imageBuffers.length > MAX_BUILDING_REFERENCE_PHOTOS) {
    throw new Error(`You can register up to ${MAX_BUILDING_REFERENCE_PHOTOS} photos per building.`)
  }

  const processed = await Promise.all(
    params.imageBuffers.map((imageBuffer, index) => processBuildingReferencePhoto(imageBuffer, name, index)),
  )

  const building = await insertBuilding({
    name,
    description: params.input.description ?? null,
    fullAddress: params.input.fullAddress ?? null,
    latitude: params.input.latitude ?? null,
    longitude: params.input.longitude ?? null,
    listings: params.input.listings ?? [],
    coverImageUrl: processed[0]?.imageUrl ?? null,
  })

  await Promise.all(
    processed.map((entry) =>
      insertBuildingEmbedding({
        buildingId: building.id,
        embedding: entry.embedding,
        imageUrl: entry.imageUrl,
      }),
    ),
  )

  return {
    ...building,
    cover_image_url: processed[0]?.imageUrl ?? building.cover_image_url,
    reference_photo_count: processed.length,
  }
}

/** @deprecated Use registerBuildingWithPhotos */
export async function registerBuildingWithPhoto(params: {
  input: BuildingRegisterInput
  imageBuffer: Buffer
}): Promise<Building> {
  return registerBuildingWithPhotos({
    input: params.input,
    imageBuffers: [params.imageBuffer],
  })
}

export async function recognizeBuildingFromPhoto(params: {
  imageBuffer: Buffer
  limit?: number
  threshold?: number
  scanLatitude?: number | null
  scanLongitude?: number | null
  scanRadiusKm?: number | null
  allowLowQuality?: boolean
}): Promise<BuildingRecognitionResult> {
  if (!params.imageBuffer.length) {
    throw new Error('Upload a building photo.')
  }

  const imageBuffer = await prepareBuildingImageBuffer(params.imageBuffer)
  const embedded = await embedBuildingWithViews(imageBuffer)
  const usedGpsFilter =
    params.scanLatitude != null &&
    params.scanLongitude != null &&
    Number.isFinite(params.scanLatitude) &&
    Number.isFinite(params.scanLongitude)

  if (!embedded.quality.ok && !params.allowLowQuality) {
    return {
      matches: [],
      bestSimilarity: null,
      building: null,
      ambiguous: false,
      lowQualityImage: true,
      qualityMessage: embedded.quality.message ?? 'Image quality is too low for a reliable match.',
      usedGpsFilter,
    }
  }

  const queryEmbeddings = embedded.viewEmbeddings.length > 0 ? embedded.viewEmbeddings : [embedded.embedding]
  const rowSets = await Promise.all(
    queryEmbeddings.map((embedding) =>
      matchBuildingsByEmbedding({
        embedding,
        threshold: BUILDING_MATCH_DB_THRESHOLD,
        limit: Math.max(params.limit ?? 5, 8),
        scanLatitude: params.scanLatitude,
        scanLongitude: params.scanLongitude,
        scanRadiusKm: params.scanRadiusKm ?? BUILDING_GPS_RADIUS_KM,
      }),
    ),
  )

  const merged = new Map<string, { building_id: string; embedding_id: string; similarity: number }>()
  for (const rows of rowSets) {
    for (const row of rows) {
      const existing = merged.get(row.building_id)
      if (!existing || row.similarity > existing.similarity) {
        merged.set(row.building_id, row)
      }
    }
  }

  const finalThreshold = params.threshold ?? BUILDING_MATCH_THRESHOLD
  const ranked = Array.from(merged.values())
    .filter((row) => row.similarity >= finalThreshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, params.limit ?? 5)

  const ambiguous =
    ranked.length >= 2 && ranked[0].similarity - ranked[1].similarity < BUILDING_MATCH_MIN_MARGIN

  const accepted = ambiguous ? ranked.slice(0, 1) : ranked

  const buildings = await getBuildingsByIds(accepted.map((row) => row.building_id))
  const buildingById = new Map(buildings.map((building) => [building.id, building]))

  const matches: BuildingMatch[] = accepted
    .map((row) => {
      const building = buildingById.get(row.building_id)
      if (!building) return null
      return {
        building,
        similarity: row.similarity,
        confidence: getMatchConfidence(row.similarity),
      }
    })
    .filter((entry): entry is BuildingMatch => Boolean(entry))

  return {
    matches,
    bestSimilarity: matches[0]?.similarity ?? null,
    building: matches[0]?.building ?? null,
    ambiguous,
    lowQualityImage: !embedded.quality.ok,
    qualityMessage: embedded.quality.ok ? null : embedded.quality.message,
    usedGpsFilter,
  }
}

export async function getBuildingForEdit(id: string): Promise<BuildingWithPhotos | null> {
  return getBuildingWithPhotos(id)
}

export async function updateBuildingDetails(params: {
  id: string
  input: BuildingRegisterInput
  removePhotoIds?: string[]
  newImageBuffers?: Buffer[]
}): Promise<BuildingWithPhotos> {
  const existing = await getBuildingById(params.id)
  if (!existing) throw new Error('Building not found.')

  const name = params.input.name.trim()
  if (!name) throw new Error('Building name is required.')

  const removePhotoIds = Array.from(new Set((params.removePhotoIds ?? []).filter(Boolean)))
  const newImageBuffers = params.newImageBuffers ?? []
  const currentCount = await countBuildingReferencePhotos(params.id)
  const nextCount = currentCount - removePhotoIds.length + newImageBuffers.length

  if (nextCount < 1) {
    throw new Error('Each building must keep at least one reference photo.')
  }
  if (nextCount > MAX_BUILDING_REFERENCE_PHOTOS) {
    throw new Error(`You can register up to ${MAX_BUILDING_REFERENCE_PHOTOS} photos per building.`)
  }

  for (const photoId of removePhotoIds) {
    await deleteBuildingReferencePhoto({ buildingId: params.id, photoId })
  }

  const startIndex = Math.max(0, currentCount - removePhotoIds.length)
  const processed =
    newImageBuffers.length > 0
      ? await Promise.all(
          newImageBuffers.map((imageBuffer, offset) =>
            processBuildingReferencePhoto(imageBuffer, name, startIndex + offset),
          ),
        )
      : []

  if (processed.length > 0) {
    await Promise.all(
      processed.map((entry) =>
        insertBuildingEmbedding({
          buildingId: params.id,
          embedding: entry.embedding,
          imageUrl: entry.imageUrl,
        }),
      ),
    )
  }

  const remainingPhotos = await listBuildingReferencePhotos(params.id)
  const coverImageUrl =
    existing.cover_image_url &&
    remainingPhotos.some((photo) => photo.image_url === existing.cover_image_url)
      ? existing.cover_image_url
      : remainingPhotos[0]?.image_url ?? processed[0]?.imageUrl ?? existing.cover_image_url

  await updateBuilding({
    id: params.id,
    name,
    description: params.input.description ?? null,
    fullAddress: params.input.fullAddress ?? null,
    latitude: params.input.latitude ?? null,
    longitude: params.input.longitude ?? null,
    listings: params.input.listings ?? [],
    coverImageUrl,
  })

  const updated = await getBuildingWithPhotos(params.id)
  if (!updated) throw new Error('Building not found after update.')
  return updated
}
