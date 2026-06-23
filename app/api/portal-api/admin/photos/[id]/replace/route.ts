import { NextResponse } from 'next/server'

import { replacePortalPhoto, requirePortalAdmin } from '@/lib/portals/storage'

export const runtime = 'nodejs'

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const formData = await request.formData()
    const adminCode = formData.get('adminCode')?.toString().trim() ?? ''
    const file = formData.get('file')

    if (!adminCode) {
      return NextResponse.json({ error: 'Missing adminCode.' }, { status: 400 })
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Missing replacement image file.' }, { status: 400 })
    }

    await requirePortalAdmin(adminCode)
    const photo = await replacePortalPhoto(id, file)
    return NextResponse.json({ photo })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to replace photo.'
    const status = /forbidden|not active|not found/i.test(message) ? 403 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
