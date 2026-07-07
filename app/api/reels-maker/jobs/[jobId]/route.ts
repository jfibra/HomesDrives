import { NextResponse } from 'next/server'

import { deleteReelJob, getReelJob } from '@/lib/reels-maker/job-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = {
  params: Promise<{ jobId: string }>
}

export async function GET(_request: Request, context: RouteContext) {
  const { jobId } = await context.params
  const job = getReelJob(jobId)
  if (!job) {
    return NextResponse.json({ error: 'Job not found.' }, { status: 404 })
  }
  return NextResponse.json(
    { job },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } },
  )
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { jobId } = await context.params
  const deleted = deleteReelJob(jobId)
  if (!deleted) {
    return NextResponse.json({ error: 'Draft not found.' }, { status: 404 })
  }
  return NextResponse.json({ deleted: true })
}
