import { NextResponse } from 'next/server'

import { listReelDraftSummaries } from '@/lib/reels-maker/job-store'
import { startReelJob } from '@/lib/reels-maker/pipeline'
import type { CreateReelJobInput, ReelTemplateId } from '@/lib/reels-maker/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TEMPLATE_IDS: ReelTemplateId[] = [
  'cinematic',
  'luxury',
  'modern',
  'real-estate',
  'travel',
  'family',
  'event',
  'birthday',
  'wedding',
  'minimal',
  'social-trend',
]

function isTemplateId(value: string): value is ReelTemplateId {
  return TEMPLATE_IDS.includes(value as ReelTemplateId)
}

export async function GET() {
  try {
    const drafts = listReelDraftSummaries()
    return NextResponse.json({ drafts })
  } catch (error) {
    console.error('[reels-maker/jobs GET]', error)
    return NextResponse.json({ error: 'Unable to load reel drafts.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<CreateReelJobInput>
    const templateId = body.templateId ?? 'cinematic'
    if (!isTemplateId(templateId)) {
      return NextResponse.json({ error: 'Invalid template.' }, { status: 400 })
    }

    const job = startReelJob({
      templateId,
      voiceOverEnabled: Boolean(body.voiceOverEnabled),
      outroEnabled: body.outroEnabled !== false,
      outroLine: body.outroLine,
      reelBrief: body.reelBrief,
      customCaption: body.customCaption,
    })

    return NextResponse.json({ job })
  } catch (error) {
    console.error('[reels-maker/jobs POST]', error)
    return NextResponse.json({ error: 'Unable to create reel job.' }, { status: 500 })
  }
}
