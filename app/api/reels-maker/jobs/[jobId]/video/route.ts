import { GetObjectCommand } from '@aws-sdk/client-s3'
import { Readable } from 'stream'
import { NextResponse } from 'next/server'

import { getReelJob } from '@/lib/reels-maker/job-store'
import { parseReelResultStorage } from '@/lib/reels-maker/reel-playback'
import { createStorageClient } from '@/lib/server/albums'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = {
  params: Promise<{ jobId: string }>
}

function toWebStream(body: unknown) {
  if (
    body &&
    typeof body === 'object' &&
    'transformToWebStream' in body &&
    typeof (body as { transformToWebStream: () => ReadableStream }).transformToWebStream === 'function'
  ) {
    return (body as { transformToWebStream: () => ReadableStream }).transformToWebStream()
  }

  return Readable.toWeb(body as Readable) as ReadableStream
}

export async function GET(request: Request, context: RouteContext) {
  const { jobId } = await context.params
  const job = getReelJob(jobId)
  if (!job?.resultUrl) {
    return NextResponse.json({ error: 'Reel video not found.' }, { status: 404 })
  }

  const location = parseReelResultStorage(job.resultUrl)
  if (!location) {
    return NextResponse.json({ error: 'Unable to resolve reel storage location.' }, { status: 500 })
  }

  const range = request.headers.get('range') ?? undefined

  try {
    const storageClient = createStorageClient()
    const object = await storageClient.send(
      new GetObjectCommand({
        Bucket: location.bucketName,
        Key: location.storagePath,
        Range: range,
      }),
    )

    if (!object.Body) {
      return NextResponse.json({ error: 'Empty video object.' }, { status: 502 })
    }

    const headers = new Headers({
      'Content-Type': object.ContentType || 'video/mp4',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=3600',
    })

    if (object.ContentLength != null) {
      headers.set('Content-Length', String(object.ContentLength))
    }
    if (object.ContentRange) {
      headers.set('Content-Range', object.ContentRange)
    }

    return new NextResponse(toWebStream(object.Body), {
      status: range && object.ContentRange ? 206 : 200,
      headers,
    })
  } catch (error) {
    console.error('[reels-maker/jobs/video]', error)
    return NextResponse.json({ error: 'Unable to stream reel video.' }, { status: 502 })
  }
}
