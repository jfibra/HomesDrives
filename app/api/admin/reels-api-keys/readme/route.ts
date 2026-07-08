import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { resolve } from 'path'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const filePath = resolve(process.cwd(), 'REELS_API_PARTNER.md')
    const content = await readFile(filePath, 'utf8')
    return new NextResponse(content, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': 'attachment; filename="REELS_API_PARTNER.md"',
      },
    })
  } catch {
    return NextResponse.json({ error: 'README not found.' }, { status: 404 })
  }
}
