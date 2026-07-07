import { NextResponse } from 'next/server'

import { getReelJob, updateReelJob } from '@/lib/reels-maker/job-store'
import { runReelJobPipeline } from '@/lib/reels-maker/pipeline'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = {
  params: Promise<{ jobId: string }>
}

export async function POST(request: Request, context: RouteContext) {
  const { jobId } = await context.params
  const job = getReelJob(jobId)
  if (!job) {
    return NextResponse.json({ error: 'Job not found.' }, { status: 404 })
  }

  if (!job.media.length) {
    return NextResponse.json({ error: 'Upload at least one photo or video first.' }, { status: 400 })
  }

  if (job.status !== 'queued' && job.status !== 'uploading' && job.status !== 'failed') {
    return NextResponse.json({ error: 'This job is already processing or completed.' }, { status: 409 })
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      caption?: string
      reelBrief?: string
      voiceOverEnabled?: boolean
      outroEnabled?: boolean
      outroLine?: string
      templateId?: string
    }
    if (
      body.caption !== undefined ||
      body.reelBrief !== undefined ||
      body.voiceOverEnabled !== undefined ||
      body.outroEnabled !== undefined ||
      body.outroLine !== undefined ||
      body.templateId
    ) {
      updateReelJob(jobId, {
        caption: body.caption ?? job.caption,
        reelBrief: body.reelBrief ?? job.reelBrief,
        voiceOverEnabled: body.voiceOverEnabled ?? job.voiceOverEnabled,
        outroEnabled: body.outroEnabled ?? job.outroEnabled ?? true,
        outroLine: body.outroLine ?? job.outroLine ?? '',
        templateId: (body.templateId as typeof job.templateId) ?? job.templateId,
        status: 'queued',
        error: null,
        progress: Math.max(job.progress, 38),
        message: 'Starting generation…',
      })
    }
  } catch {
    // non-fatal
  }

  runReelJobPipeline(jobId)
  return NextResponse.json({ jobId, started: true })
}
