import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

function isAllowedImageUrl(url: URL) {
  if (url.hostname.endsWith('.amazonaws.com')) return true
  if (url.hostname === 'api.qrserver.com') return true
  return false
}

export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get('url')
  if (!rawUrl) {
    return NextResponse.json({ error: 'Missing url parameter.' }, { status: 400 })
  }

  let target: URL
  try {
    target = new URL(rawUrl)
  } catch {
    return NextResponse.json({ error: 'Invalid url parameter.' }, { status: 400 })
  }

  if (target.protocol !== 'https:' || !isAllowedImageUrl(target)) {
    return NextResponse.json({ error: 'Image URL is not allowed.' }, { status: 403 })
  }

  try {
    const response = await fetch(target.href, { cache: 'no-store' })
    if (!response.ok) {
      return NextResponse.json({ error: 'Unable to fetch image.' }, { status: 502 })
    }

    const buffer = await response.arrayBuffer()
    const contentType = response.headers.get('content-type') || 'image/jpeg'

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Unable to fetch image.' }, { status: 502 })
  }
}
