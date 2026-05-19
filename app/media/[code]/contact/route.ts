import { NextResponse } from 'next/server'

import { getUserByCode } from '@/lib/server/albums'

type RouteContext = {
  params: Promise<{ code: string }>
}

function escapeVCardValue(value: string) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

export async function GET(request: Request, { params }: RouteContext) {
  const { code } = await params
  const user = await getUserByCode(code).catch(() => null)

  if (!user || user.status !== 'active' || user.role !== 'media') {
    return new NextResponse('Not found', { status: 404 })
  }

  const profileUrl = `${new URL(request.url).origin}/media/${encodeURIComponent(user.code)}`
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${escapeVCardValue(user.last_name)};${escapeVCardValue(user.first_name)};;;`,
    `FN:${escapeVCardValue(user.full_name)}`,
    'TITLE:Media',
    `TEL;TYPE=CELL:${escapeVCardValue(user.phone_number)}`,
    `URL:${profileUrl}`,
    'END:VCARD',
  ]
  const body = `${lines.join('\r\n')}\r\n`

  return new NextResponse(body, {
    headers: {
      'Content-Disposition': `attachment; filename="${user.code}-contact.vcf"`,
      'Content-Type': 'text/vcard; charset=utf-8',
    },
  })
}
