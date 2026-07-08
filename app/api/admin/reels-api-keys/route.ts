import { NextResponse } from 'next/server'
import { requirePortalAdmin } from '@/lib/portals/storage'

export const runtime = 'nodejs'

function ec2AdminUrl(path: string) {
  const base = (process.env.REELS_API_URL ?? '').replace(/\/$/, '')
  return `${base}${path}`
}

function ec2AdminHeaders() {
  return {
    'x-admin-secret': process.env.REELS_API_ADMIN_SECRET ?? '',
    'Content-Type': 'application/json',
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const adminCode = searchParams.get('adminCode')?.trim() ?? ''
    if (!adminCode) return NextResponse.json({ error: 'Missing adminCode.' }, { status: 400 })
    await requirePortalAdmin(adminCode)

    const res = await fetch(ec2AdminUrl('/admin/api-keys'), { headers: ec2AdminHeaders() })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list keys.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const adminCode = typeof body?.adminCode === 'string' ? body.adminCode.trim() : ''
    const name = typeof body?.name === 'string' ? body.name.trim() : ''
    if (!adminCode) return NextResponse.json({ error: 'Missing adminCode.' }, { status: 400 })
    if (!name) return NextResponse.json({ error: 'Name is required.' }, { status: 400 })
    await requirePortalAdmin(adminCode)

    const res = await fetch(ec2AdminUrl('/admin/api-keys'), {
      method: 'POST',
      headers: ec2AdminHeaders(),
      body: JSON.stringify({ name }),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create key.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
