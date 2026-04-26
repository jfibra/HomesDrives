import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q')?.trim()
  const latitude = searchParams.get('lat')?.trim()
  const longitude = searchParams.get('lon')?.trim()

  const apiKey = process.env.LOCATIONIQ_API_KEY

  if (!apiKey) {
    return NextResponse.json({ error: 'Geocoding service is not configured.' }, { status: 503 })
  }

  type LocationIQResult = {
    lat: string
    lon: string
    display_name: string
    address?: {
      county?: string
      municipality?: string
      road?: string
      region?: string
      suburb?: string
      city?: string
      state_district?: string
      town?: string
      village?: string
      state?: string
      postcode?: string
      country?: string
    }
  }

  function toSuggestion(item: LocationIQResult) {
    return {
      displayName: item.display_name,
      lat: parseFloat(item.lat),
      lon: parseFloat(item.lon),
      address: {
        road: item.address?.road ?? null,
        suburb: item.address?.suburb ?? null,
        city:
          item.address?.city ??
          item.address?.municipality ??
          item.address?.town ??
          item.address?.village ??
          null,
        state:
          item.address?.state_district ??
          item.address?.state ??
          item.address?.region ??
          item.address?.county ??
          null,
        postcode: item.address?.postcode ?? null,
        country: item.address?.country ?? null,
      },
    }
  }

  if (latitude && longitude) {
    const url = new URL('https://us1.locationiq.com/v1/reverse')
    url.searchParams.set('key', apiKey)
    url.searchParams.set('lat', latitude)
    url.searchParams.set('lon', longitude)
    url.searchParams.set('format', 'json')
    url.searchParams.set('addressdetails', '1')

    const response = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
      },
      next: { revalidate: 60 },
    })

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Unable to reach geocoding service.' },
        { status: response.status },
      )
    }

    const data = (await response.json()) as LocationIQResult

    return NextResponse.json({ suggestion: toSuggestion(data) })
  }

  if (!query) {
    return NextResponse.json({ error: 'Missing search query.' }, { status: 400 })
  }

  const url = new URL('https://us1.locationiq.com/v1/search')
  url.searchParams.set('key', apiKey)
  url.searchParams.set('q', query)
  url.searchParams.set('format', 'json')
  url.searchParams.set('limit', '5')
  url.searchParams.set('addressdetails', '1')
  url.searchParams.set('countrycodes', 'ph')

  const response = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
    },
    next: { revalidate: 60 },
  })

  if (!response.ok) {
    return NextResponse.json(
      { error: 'Unable to reach geocoding service.' },
      { status: response.status },
    )
  }

  const data = await response.json()

  const suggestions = (Array.isArray(data) ? data : []).map((item: LocationIQResult) =>
    toSuggestion(item),
  )

  return NextResponse.json({ suggestions })
}
