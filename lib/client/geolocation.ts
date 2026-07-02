export type CurrentLocationResult = {
  latitude: number
  longitude: number
  accuracy: number
}

export type CurrentLocationWithAddress = CurrentLocationResult & {
  fullAddress: string
}

type GeocodeSuggestion = {
  displayName: string
  lat: number
  lon: number
  address?: {
    road?: string | null
    suburb?: string | null
    city?: string | null
    state?: string | null
    postcode?: string | null
    country?: string | null
  }
}

function formatAddressFromSuggestion(suggestion: GeocodeSuggestion) {
  if (suggestion.displayName?.trim()) return suggestion.displayName.trim()

  const parts = [
    suggestion.address?.road,
    suggestion.address?.suburb,
    suggestion.address?.city,
    suggestion.address?.state,
    suggestion.address?.country,
  ].filter((part): part is string => Boolean(part?.trim()))

  return parts.join(', ')
}

async function reverseGeocode(latitude: number, longitude: number) {
  const response = await fetch(
    `/api/geocode?lat=${encodeURIComponent(String(latitude))}&lon=${encodeURIComponent(String(longitude))}`,
  )
  const data = await response.json().catch(() => null)

  if (!response.ok || !data?.suggestion) {
    throw new Error(
      data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
        ? data.error
        : 'Unable to look up address for your location.',
    )
  }

  const suggestion = data.suggestion as GeocodeSuggestion
  const fullAddress = formatAddressFromSuggestion(suggestion)
  if (!fullAddress) {
    throw new Error('Unable to look up address for your location.')
  }

  return fullAddress
}

function formatGeolocationError(error: GeolocationPositionError) {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return 'Location permission denied. On iPhone: Settings → Privacy & Security → Location Services → Safari Websites → Allow.'
    case error.POSITION_UNAVAILABLE:
      return 'Location unavailable. Turn on Location Services and try again.'
    case error.TIMEOUT:
      return 'Location timed out. Move near a window, or enter latitude/longitude manually.'
    default:
      return 'Unable to read your current location.'
  }
}

function getCurrentPosition(options: PositionOptions) {
  return new Promise<CurrentLocationResult>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        })
      },
      reject,
      options,
    )
  })
}

/**
 * iOS Safari often times out with enableHighAccuracy indoors — try coarse location first, then precise.
 */
export async function requestCurrentLocation(): Promise<CurrentLocationResult> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    throw new Error('Geolocation is not supported in this browser.')
  }

  try {
    return await getCurrentPosition({
      enableHighAccuracy: false,
      timeout: 20_000,
      maximumAge: 120_000,
    })
  } catch (firstError) {
    const geoError = firstError as GeolocationPositionError
    if (geoError.code === geoError.PERMISSION_DENIED) {
      throw new Error(formatGeolocationError(geoError))
    }

    try {
      return await getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 25_000,
        maximumAge: 60_000,
      })
    } catch (secondError) {
      throw new Error(formatGeolocationError(secondError as GeolocationPositionError))
    }
  }
}

export async function requestCurrentLocationWithAddress(): Promise<CurrentLocationWithAddress> {
  const position = await requestCurrentLocation()

  try {
    const fullAddress = await reverseGeocode(position.latitude, position.longitude)
    return { ...position, fullAddress }
  } catch {
    return {
      ...position,
      fullAddress: `${position.latitude.toFixed(6)}, ${position.longitude.toFixed(6)}`,
    }
  }
}
