import { mkdir, readFile, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

type MusicChunkSession = {
  dir: string
  fileName: string
  mimeType: string
  totalChunks: number
  received: Set<number>
  createdAt: number
}

const sessions = new Map<string, MusicChunkSession>()
const SESSION_TTL_MS = 60 * 60 * 1000

function cleanupExpiredSessions() {
  const now = Date.now()
  for (const [uploadId, session] of sessions) {
    if (now - session.createdAt > SESSION_TTL_MS) {
      sessions.delete(uploadId)
      void rm(session.dir, { recursive: true, force: true })
    }
  }
}

export async function storeMusicUploadChunk(params: {
  uploadId: string
  chunkIndex: number
  totalChunks: number
  fileName: string
  mimeType: string
  chunk: Buffer
}) {
  cleanupExpiredSessions()

  const { uploadId, chunkIndex, totalChunks, fileName, mimeType, chunk } = params
  if (!uploadId || totalChunks <= 0 || chunkIndex < 0 || chunkIndex >= totalChunks) {
    throw new Error('Invalid music chunk upload.')
  }
  if (!chunk.length) {
    throw new Error('Empty upload chunk received.')
  }

  let session = sessions.get(uploadId)
  if (!session) {
    const dir = join(tmpdir(), `reels-music-${uploadId}`)
    await mkdir(dir, { recursive: true })
    session = {
      dir,
      fileName,
      mimeType,
      totalChunks,
      received: new Set<number>(),
      createdAt: Date.now(),
    }
    sessions.set(uploadId, session)
  } else if (session.totalChunks !== totalChunks || session.fileName !== fileName) {
    throw new Error('Music upload session mismatch. Start the upload again.')
  }

  await writeFile(join(session.dir, `chunk-${chunkIndex}`), chunk)
  session.received.add(chunkIndex)

  if (session.received.size < totalChunks) {
    return { complete: false as const, received: session.received.size, totalChunks }
  }

  const chunks: Buffer[] = []
  for (let index = 0; index < totalChunks; index += 1) {
    if (!session.received.has(index)) {
      throw new Error(`Missing music chunk ${index + 1} of ${totalChunks}.`)
    }
    chunks.push(await readFile(join(session.dir, `chunk-${index}`)))
  }

  sessions.delete(uploadId)
  await rm(session.dir, { recursive: true, force: true })

  return {
    complete: true as const,
    buffer: Buffer.concat(chunks),
    fileName: session.fileName,
    mimeType: session.mimeType,
  }
}
