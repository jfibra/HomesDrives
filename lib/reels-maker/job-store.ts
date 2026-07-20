import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'

import type { ReelDraftSummary, ReelJob, ReelJobStatus } from '@/lib/reels-maker/types'

const jobs = new Map<string, ReelJob>()
const JOBS_DIR = join(process.cwd(), '.data', 'reels-jobs')

function ensureJobsDir() {
  if (!existsSync(JOBS_DIR)) {
    mkdirSync(JOBS_DIR, { recursive: true })
  }
}

function jobFilePath(jobId: string) {
  return join(JOBS_DIR, `${jobId}.json`)
}

function persistJob(job: ReelJob) {
  ensureJobsDir()
  writeFileSync(jobFilePath(job.id), JSON.stringify(job), 'utf8')
  jobs.set(job.id, job)
}

function loadJob(jobId: string): ReelJob | null {
  const filePath = jobFilePath(jobId)
  if (!existsSync(filePath)) {
    jobs.delete(jobId)
    return null
  }

  try {
    const job = JSON.parse(readFileSync(filePath, 'utf8')) as ReelJob
    jobs.set(jobId, job)
    return job
  } catch {
    return jobs.get(jobId) ?? null
  }
}

export function createReelJob(job: ReelJob) {
  persistJob(job)
  return job
}

export function getReelJob(jobId: string) {
  return loadJob(jobId)
}

export function updateReelJob(jobId: string, patch: Partial<ReelJob>) {
  const current = loadJob(jobId)
  if (!current) return null

  const next: ReelJob = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  }
  persistJob(next)
  return next
}

export function setReelJobStatus(
  jobId: string,
  status: ReelJobStatus,
  message: string,
  progress: number,
  extra?: Partial<ReelJob>,
) {
  return updateReelJob(jobId, {
    status,
    message,
    progress,
    ...extra,
  })
}

export function toReelDraftSummary(job: ReelJob): ReelDraftSummary {
  return {
    id: job.id,
    status: job.status,
    title: job.plan?.title ?? 'Untitled Reel',
    caption: job.caption,
    templateId: job.templateId,
    resultUrl: job.resultUrl,
    thumbnailUrl: job.thumbnailUrl ?? job.media[0]?.publicUrl ?? null,
    mediaCount: job.media.length,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    error: job.error,
  }
}

export function listReelJobs() {
  ensureJobsDir()
  const files = readdirSync(JOBS_DIR).filter((name) => name.endsWith('.json'))
  const allJobs: ReelJob[] = []

  for (const fileName of files) {
    try {
      const job = JSON.parse(readFileSync(join(JOBS_DIR, fileName), 'utf8')) as ReelJob
      jobs.set(job.id, job)
      allJobs.push(job)
    } catch {
      // skip corrupt files
    }
  }

  return allJobs.sort(
    (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
  )
}

export function listReelDraftSummaries() {
  return listReelJobs().map(toReelDraftSummary)
}

export function deleteReelJob(jobId: string) {
  jobs.delete(jobId)
  const filePath = jobFilePath(jobId)
  if (existsSync(filePath)) {
    unlinkSync(filePath)
    return true
  }
  return false
}
