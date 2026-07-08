import { NextResponse } from 'next/server'
import { requirePortalAdmin } from '@/lib/portals/storage'

export const runtime = 'nodejs'

function ec2AdminUrl(path: string) {
  const base = process.env.REELS_API_URL?.trim().replace(/\/$/, '')
  if (!base) throw new Error('REELS_API_URL is not configured on this server.')
  return `${base}${path}`
}

function ec2AdminHeaders() {
  return {
    'x-admin-secret': process.env.REELS_API_ADMIN_SECRET ?? '',
    'Content-Type': 'application/json',
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ key: string }> }) {
  try {
    const { searchParams } = new URL(request.url)
    const adminCode = searchParams.get('adminCode')?.trim() ?? ''
    if (!adminCode) return NextResponse.json({ error: 'Missing adminCode.' }, { status: 400 })
    await requirePortalAdmin(adminCode)

    const { key } = await params
    const res = await fetch(ec2AdminUrl(`/admin/api-keys/${key}`), {
      method: 'DELETE',
      headers: ec2AdminHeaders(),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to revoke key.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
