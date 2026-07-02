import type { Building, BuildingListing, BuildingReferencePhoto, BuildingWithPhotos } from '@/lib/types/buildings'
import { BUILDING_GPS_RADIUS_KM, BUILDING_MATCH_DB_THRESHOLD } from '@/lib/types/buildings'
import { createSupabaseAdminClient } from '@/lib/server/albums'

type BuildingRow = {
  id: string
  name: string
  description: string | null
  full_address: string | null
  latitude: number | null
  longitude: number | null
  listings: unknown
  cover_image_url: string | null
  created_at: string
  updated_at: string
}

function parseListings(value: unknown): BuildingListing[] {
  if (!Array.isArray(value)) return []

  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null
      const row = entry as Record<string, unknown>
      const title = typeof row.title === 'string' ? row.title.trim() : ''
      if (!title) return null

      return {
        title,
        price: typeof row.price === 'string' ? row.price : row.price == null ? null : String(row.price),
        beds: typeof row.beds === 'number' ? row.beds : null,
        baths: typeof row.baths === 'number' ? row.baths : null,
        description: typeof row.description === 'string' ? row.description : null,
      } satisfies BuildingListing
    })
    .filter((entry): entry is BuildingListing => Boolean(entry))
}

export function mapBuildingRow(row: BuildingRow, referencePhotoCount = 0): Building {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    full_address: row.full_address,
    latitude: row.latitude,
    longitude: row.longitude,
    listings: parseListings(row.listings),
    cover_image_url: row.cover_image_url,
    reference_photo_count: referencePhotoCount,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

async function getReferencePhotoCounts(buildingIds: string[]) {
  if (buildingIds.length === 0) return new Map<string, number>()

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('building_embeddings')
    .select('building_id')
    .in('building_id', buildingIds)

  if (error) {
    if (/relation.*building_embeddings.*does not exist/i.test(error.message)) {
      return new Map<string, number>()
    }
    throw new Error(error.message)
  }

  const counts = new Map<string, number>()
  for (const row of data ?? []) {
    const buildingId = String((row as { building_id: string }).building_id)
    counts.set(buildingId, (counts.get(buildingId) ?? 0) + 1)
  }
  return counts
}

export async function listBuildings(): Promise<Building[]> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('buildings')
    .select(
      'id, name, description, full_address, latitude, longitude, listings, cover_image_url, created_at, updated_at',
    )
    .order('created_at', { ascending: false })

  if (error) {
    if (/relation.*buildings.*does not exist/i.test(error.message)) {
      throw new Error('Building tables are not set up yet. Run database/buildings.sql in Supabase first.')
    }
    throw new Error(error.message)
  }

  const rows = (data ?? []) as BuildingRow[]
  const counts = await getReferencePhotoCounts(rows.map((row) => row.id))
  return rows.map((row) => mapBuildingRow(row, counts.get(row.id) ?? 0))
}

export async function getBuildingById(id: string): Promise<Building | null> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('buildings')
    .select(
      'id, name, description, full_address, latitude, longitude, listings, cover_image_url, created_at, updated_at',
    )
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) return null
  const counts = await getReferencePhotoCounts([String((data as BuildingRow).id)])
  return mapBuildingRow(data as BuildingRow, counts.get(String((data as BuildingRow).id)) ?? 0)
}

export async function getBuildingsByIds(ids: string[]): Promise<Building[]> {
  if (ids.length === 0) return []

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('buildings')
    .select(
      'id, name, description, full_address, latitude, longitude, listings, cover_image_url, created_at, updated_at',
    )
    .in('id', ids)

  if (error) throw new Error(error.message)

  const rows = (data ?? []) as BuildingRow[]
  const counts = await getReferencePhotoCounts(rows.map((row) => row.id))
  const byId = new Map(
    rows.map((row) => [row.id, mapBuildingRow(row, counts.get(row.id) ?? 0)]),
  )
  return ids.map((id) => byId.get(id)).filter((entry): entry is Building => Boolean(entry))
}

export async function insertBuilding(params: {
  name: string
  description?: string | null
  fullAddress?: string | null
  latitude?: number | null
  longitude?: number | null
  listings?: BuildingListing[]
  coverImageUrl?: string | null
}): Promise<Building> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('buildings')
    .insert({
      name: params.name.trim(),
      description: params.description?.trim() || null,
      full_address: params.fullAddress?.trim() || null,
      latitude: params.latitude ?? null,
      longitude: params.longitude ?? null,
      listings: params.listings ?? [],
      cover_image_url: params.coverImageUrl ?? null,
    })
    .select(
      'id, name, description, full_address, latitude, longitude, listings, cover_image_url, created_at, updated_at',
    )
    .single()

  if (error) throw new Error(error.message)
  return mapBuildingRow(data as BuildingRow, 0)
}

export async function countBuildingReferencePhotos(buildingId: string) {
  const supabase = createSupabaseAdminClient()
  const { count, error } = await supabase
    .from('building_embeddings')
    .select('id', { count: 'exact', head: true })
    .eq('building_id', buildingId)

  if (error) throw new Error(error.message)
  return count ?? 0
}

export async function listBuildingReferencePhotos(buildingId: string): Promise<BuildingReferencePhoto[]> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('building_embeddings')
    .select('id, image_url, created_at')
    .eq('building_id', buildingId)
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)

  return (data ?? []).map((row) => ({
    id: String((row as { id: string }).id),
    image_url:
      typeof (row as { image_url: string | null }).image_url === 'string'
        ? (row as { image_url: string }).image_url
        : null,
    created_at: String((row as { created_at: string }).created_at),
  }))
}

export async function deleteBuildingReferencePhoto(params: { buildingId: string; photoId: string }) {
  const supabase = createSupabaseAdminClient()
  const { data: existing, error: existingError } = await supabase
    .from('building_embeddings')
    .select('id, building_id, image_url')
    .eq('id', params.photoId)
    .eq('building_id', params.buildingId)
    .maybeSingle()

  if (existingError) throw new Error(existingError.message)
  if (!existing) throw new Error('Reference photo not found.')

  const remaining = await countBuildingReferencePhotos(params.buildingId)
  if (remaining <= 1) {
    throw new Error('Each building must keep at least one reference photo.')
  }

  const { error } = await supabase.from('building_embeddings').delete().eq('id', params.photoId)
  if (error) throw new Error(error.message)

  return {
    id: String(existing.id),
    image_url: typeof existing.image_url === 'string' ? existing.image_url : null,
  }
}

export async function updateBuilding(params: {
  id: string
  name: string
  description?: string | null
  fullAddress?: string | null
  latitude?: number | null
  longitude?: number | null
  listings?: BuildingListing[]
  coverImageUrl?: string | null
}): Promise<Building> {
  const supabase = createSupabaseAdminClient()
  const updates: Record<string, unknown> = {
    name: params.name.trim(),
    description: params.description?.trim() || null,
    full_address: params.fullAddress?.trim() || null,
    latitude: params.latitude ?? null,
    longitude: params.longitude ?? null,
    listings: params.listings ?? [],
    updated_at: new Date().toISOString(),
  }

  if (params.coverImageUrl !== undefined) {
    updates.cover_image_url = params.coverImageUrl
  }

  const { data, error } = await supabase
    .from('buildings')
    .update(updates)
    .eq('id', params.id)
    .select(
      'id, name, description, full_address, latitude, longitude, listings, cover_image_url, created_at, updated_at',
    )
    .single()

  if (error) throw new Error(error.message)
  const photoCount = await countBuildingReferencePhotos(params.id)
  return mapBuildingRow(data as BuildingRow, photoCount)
}

export async function getBuildingWithPhotos(id: string): Promise<BuildingWithPhotos | null> {
  const building = await getBuildingById(id)
  if (!building) return null

  const reference_photos = await listBuildingReferencePhotos(id)
  return {
    ...building,
    reference_photo_count: reference_photos.length,
    reference_photos,
  }
}

export async function insertBuildingEmbedding(params: {
  buildingId: string
  embedding: number[]
  imageUrl?: string | null
}) {
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase.from('building_embeddings').insert({
    building_id: params.buildingId,
    embedding: params.embedding,
    image_url: params.imageUrl ?? null,
  })

  if (error) throw new Error(error.message)
}

export async function matchBuildingsByEmbedding(params: {
  embedding: number[]
  threshold?: number
  limit?: number
  scanLatitude?: number | null
  scanLongitude?: number | null
  scanRadiusKm?: number | null
}) {
  const supabase = createSupabaseAdminClient()
  const hasGps =
    params.scanLatitude != null &&
    params.scanLongitude != null &&
    Number.isFinite(params.scanLatitude) &&
    Number.isFinite(params.scanLongitude)

  const rpcParams = {
    query_embedding: params.embedding,
    match_threshold: params.threshold ?? BUILDING_MATCH_DB_THRESHOLD,
    match_count: params.limit ?? 12,
    scan_latitude: hasGps ? params.scanLatitude : null,
    scan_longitude: hasGps ? params.scanLongitude : null,
    scan_radius_km: hasGps ? (params.scanRadiusKm ?? BUILDING_GPS_RADIUS_KM) : null,
  }

  const { data, error } = await supabase.rpc('match_buildings', rpcParams)

  if (error) {
    if (/function.*match_buildings.*does not exist/i.test(error.message)) {
      throw new Error('Building match function is missing. Run database/buildings.sql in Supabase first.')
    }
    throw new Error(error.message)
  }

  return (data ?? []) as Array<{
    building_id: string
    embedding_id: string
    similarity: number
  }>
}
