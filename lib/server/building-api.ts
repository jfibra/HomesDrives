import { NextResponse } from 'next/server'

import { listBuildings } from '@/lib/buildings'
import {
  getBuildingForEdit,
  parseBuildingListingsInput,
  recognizeBuildingFromPhoto,
  registerBuildingWithPhotos,
  updateBuildingDetails,
} from '@/lib/server/building-recognition'
import { getVisionApiHealthUrl } from '@/lib/server/building-client'
import { MAX_BUILDING_REFERENCE_PHOTOS } from '@/lib/types/buildings'

function getAppOrigins() {
  const origins = new Set<string>(['https://drive.homes.ph', 'http://localhost:3000', 'http://127.0.0.1:3000'])
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (appUrl) {
    try {
      origins.add(new URL(appUrl).origin)
    } catch {
      /* ignore */
    }
  }
  return origins
}

function isSameAppRequest(request: Request) {
  const origin = request.headers.get('origin')
  const appOrigins = getAppOrigins()

  if (origin && appOrigins.has(origin)) return true

  // Same-origin browser POSTs (especially multipart uploads) often omit Origin.
  const host = request.headers.get('host')?.split(':')[0]?.toLowerCase()
  if (host) {
    for (const appOrigin of appOrigins) {
      try {
        if (new URL(appOrigin).hostname.toLowerCase() === host) return true
      } catch {
        /* ignore */
      }
    }
  }

  const referer = request.headers.get('referer')
  if (referer) {
    try {
      if (appOrigins.has(new URL(referer).origin)) return true
    } catch {
      /* ignore */
    }
  }

  return false
}

function getAllowedOrigins() {
  const fromEnv = process.env.BUILDING_API_ALLOWED_ORIGINS?.split(',').map((v) => v.trim()).filter(Boolean)
  if (fromEnv?.length) return fromEnv

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim()
  const defaults = ['https://homes.ph', 'https://www.homes.ph', 'https://drive.homes.ph']
  if (appUrl) {
    try {
      defaults.push(new URL(appUrl).origin)
    } catch {
      /* ignore */
    }
  }
  return Array.from(new Set(defaults))
}

export function buildingApiCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('origin')
  if (!origin) return {}

  const allowed = getAllowedOrigins()
  if (!allowed.includes(origin) && !allowed.includes('*')) return {}

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Building-Api-Key',
    Vary: 'Origin',
  }
}

export function assertBuildingApiAccess(request: Request) {
  if (isSameAppRequest(request)) return

  const origin = request.headers.get('origin')
  const requiredKey = process.env.BUILDING_API_KEY?.trim()

  if (requiredKey) {
    const provided = request.headers.get('x-building-api-key')?.trim()
    if (provided === requiredKey) {
      if (!origin) return
      const allowed = getAllowedOrigins()
      if (allowed.includes('*') || allowed.includes(origin)) return
      throw new Error('This origin is not allowed to use the building API.')
    }
    throw new Error('Invalid or missing X-Building-Api-Key header.')
  }

  if (origin) {
    const allowed = getAllowedOrigins()
    if (!allowed.includes(origin) && !allowed.includes('*')) {
      throw new Error('This origin is not allowed to use the building API.')
    }
  }
}

export function buildingJsonResponse(request: Request, body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: buildingApiCorsHeaders(request),
  })
}

export function buildingOptionsResponse(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: buildingApiCorsHeaders(request),
  })
}

function collectUploadedFiles(formData: FormData) {
  const fromFiles = formData
    .getAll('files')
    .filter((entry): entry is File => entry instanceof File && entry.size > 0)

  if (fromFiles.length > 0) return fromFiles

  const legacyFile = formData.get('file')
  if (legacyFile instanceof File && legacyFile.size > 0) {
    return [legacyFile]
  }

  return []
}

function parseRemovePhotoIds(value: FormDataEntryValue | null) {
  if (typeof value !== 'string' || !value.trim()) return []

  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
  } catch {
    return []
  }
}

function parseLatLng(formData: FormData) {
  const latitudeRaw = formData.get('latitude')
  const longitudeRaw = formData.get('longitude')

  const latitude =
    typeof latitudeRaw === 'string' && latitudeRaw.trim() ? Number.parseFloat(latitudeRaw) : null
  const longitude =
    typeof longitudeRaw === 'string' && longitudeRaw.trim() ? Number.parseFloat(longitudeRaw) : null

  if (latitude != null && !Number.isFinite(latitude)) {
    throw new Error('Latitude must be a valid number.')
  }
  if (longitude != null && !Number.isFinite(longitude)) {
    throw new Error('Longitude must be a valid number.')
  }

  return { latitude, longitude }
}

export async function handleListBuildings(request: Request) {
  try {
    assertBuildingApiAccess(request)
    const buildings = await listBuildings()
    return buildingJsonResponse(request, { buildings })
  } catch (error) {
    return buildingJsonResponse(
      request,
      { error: error instanceof Error ? error.message : 'Unable to load buildings.' },
      error instanceof Error && error.message.includes('API key') ? 401 : 500,
    )
  }
}

export async function handleRegisterBuilding(request: Request) {
  try {
    assertBuildingApiAccess(request)
    const formData = await request.formData()
    const files = collectUploadedFiles(formData)
    const { latitude, longitude } = parseLatLng(formData)

    if (files.length === 0) {
      return buildingJsonResponse(request, { error: 'Add at least one building photo.' }, 400)
    }
    if (files.length > MAX_BUILDING_REFERENCE_PHOTOS) {
      return buildingJsonResponse(
        request,
        { error: `You can register up to ${MAX_BUILDING_REFERENCE_PHOTOS} photos per building.` },
        400,
      )
    }

    const name = typeof formData.get('name') === 'string' ? formData.get('name') : ''
    const description = typeof formData.get('description') === 'string' ? formData.get('description') : ''
    const fullAddress = typeof formData.get('fullAddress') === 'string' ? formData.get('fullAddress') : ''
    const listingsRaw = formData.get('listings')

    const imageBuffers = await Promise.all(files.map(async (file) => Buffer.from(await file.arrayBuffer())))
    const building = await registerBuildingWithPhotos({
      imageBuffers,
      input: {
        name: String(name),
        description: description ? String(description) : null,
        fullAddress: fullAddress ? String(fullAddress) : null,
        latitude,
        longitude,
        listings: parseBuildingListingsInput(listingsRaw),
      },
    })

    return buildingJsonResponse(request, { building })
  } catch (error) {
    return buildingJsonResponse(
      request,
      { error: error instanceof Error ? error.message : 'Unable to register building.' },
      500,
    )
  }
}

export async function handleGetBuilding(request: Request, id: string) {
  try {
    assertBuildingApiAccess(request)
    const building = await getBuildingForEdit(id)
    if (!building) {
      return buildingJsonResponse(request, { error: 'Building not found.' }, 404)
    }
    return buildingJsonResponse(request, { building })
  } catch (error) {
    return buildingJsonResponse(
      request,
      { error: error instanceof Error ? error.message : 'Unable to load building.' },
      500,
    )
  }
}

export async function handleUpdateBuilding(request: Request, id: string) {
  try {
    assertBuildingApiAccess(request)
    const formData = await request.formData()
    const { latitude, longitude } = parseLatLng(formData)
    const files = collectUploadedFiles(formData)

    const name = typeof formData.get('name') === 'string' ? formData.get('name') : ''
    const description = typeof formData.get('description') === 'string' ? formData.get('description') : ''
    const fullAddress = typeof formData.get('fullAddress') === 'string' ? formData.get('fullAddress') : ''
    const listingsRaw = formData.get('listings')
    const removePhotoIds = parseRemovePhotoIds(formData.get('removePhotoIds'))

    const newImageBuffers =
      files.length > 0
        ? await Promise.all(files.map(async (file) => Buffer.from(await file.arrayBuffer())))
        : []

    const building = await updateBuildingDetails({
      id,
      removePhotoIds,
      newImageBuffers,
      input: {
        name: String(name),
        description: description ? String(description) : null,
        fullAddress: fullAddress ? String(fullAddress) : null,
        latitude,
        longitude,
        listings: parseBuildingListingsInput(listingsRaw),
      },
    })

    return buildingJsonResponse(request, { building })
  } catch (error) {
    return buildingJsonResponse(
      request,
      { error: error instanceof Error ? error.message : 'Unable to update building.' },
      500,
    )
  }
}

export async function handleRecognizeBuilding(request: Request) {
  try {
    assertBuildingApiAccess(request)
    const formData = await request.formData()
    const file = formData.get('file')
    const limitRaw = formData.get('limit')
    const limit =
      typeof limitRaw === 'string' && Number.isFinite(Number.parseInt(limitRaw, 10))
        ? Number.parseInt(limitRaw, 10)
        : 5

    const { latitude, longitude } = parseLatLng(formData)

    if (!(file instanceof File)) {
      return buildingJsonResponse(request, { error: 'Upload a building photo.' }, 400)
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const result = await recognizeBuildingFromPhoto({
      imageBuffer: buffer,
      limit,
      scanLatitude: latitude,
      scanLongitude: longitude,
    })

    return buildingJsonResponse(request, result)
  } catch (error) {
    return buildingJsonResponse(
      request,
      { error: error instanceof Error ? error.message : 'Building recognition failed.' },
      500,
    )
  }
}

export async function handleBuildingApiHealth(request: Request) {
  try {
    assertBuildingApiAccess(request)
    const response = await fetch(getVisionApiHealthUrl(), {
      signal: AbortSignal.timeout(10_000),
    })
    const data = await response.json().catch(() => null)

    if (!response.ok) {
      return buildingJsonResponse(
        request,
        {
          ok: false,
          error: 'Vision API is unreachable.',
          url: getVisionApiHealthUrl(),
        },
        503,
      )
    }

    return buildingJsonResponse(request, {
      ok: true,
      url: getVisionApiHealthUrl(),
      ...(data && typeof data === 'object' ? data : {}),
    })
  } catch (error) {
    return buildingJsonResponse(
      request,
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Vision API is unreachable.',
        url: getVisionApiHealthUrl(),
      },
      503,
    )
  }
}
