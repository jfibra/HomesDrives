'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, ScanFace, X } from 'lucide-react'

import { PORTAL_ADMIN_SESSION_KEY, PORTAL_API_BASE } from '@/lib/portals/constants'

const POLL_INTERVAL_MS = 20_000
const BATCH_LIMIT = 5
const REFRESH_COOLDOWN_MS = 30_000

function hiddenBannerStorageKey(eventId: string) {
  return `face-scan-banner-hidden:${eventId}`
}

type EventFaceBackgroundScannerProps = {
  eventId: string
}

type ScanStatus = {
  pendingPhotos: number
  scannedPhotos: number
  totalPhotos: number
  upToDate: boolean
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export default function EventFaceBackgroundScanner({ eventId }: EventFaceBackgroundScannerProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [active, setActive] = useState(false)
  const [status, setStatus] = useState<ScanStatus | null>(null)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [rescanningAll, setRescanningAll] = useState(false)
  const [bannerHidden, setBannerHidden] = useState(false)
  const runIdRef = useRef(0)
  const lastRefreshAtRef = useRef(0)

  const maybeRefreshPeoplePage = useCallback(
    (facesDetected: number) => {
      if (facesDetected <= 0) return
      if (!pathname.includes('/workspace/people')) return

      const now = Date.now()
      if (now - lastRefreshAtRef.current < REFRESH_COOLDOWN_MS) return

      lastRefreshAtRef.current = now
      router.refresh()
    },
    [pathname, router],
  )

  useEffect(() => {
    try {
      setBannerHidden(window.sessionStorage.getItem(hiddenBannerStorageKey(eventId)) === '1')
    } catch {
      setBannerHidden(false)
    }
  }, [eventId])

  function hideBanner() {
    setBannerHidden(true)
    try {
      window.sessionStorage.setItem(hiddenBannerStorageKey(eventId), '1')
    } catch {
      // ignore storage errors
    }
  }

  function showBanner() {
    setBannerHidden(false)
    try {
      window.sessionStorage.removeItem(hiddenBannerStorageKey(eventId))
    } catch {
      // ignore storage errors
    }
  }

  const getAdminCode = useCallback(() => {
    return window.localStorage.getItem(PORTAL_ADMIN_SESSION_KEY)?.trim() ?? ''
  }, [])

  const fetchStatus = useCallback(async () => {
    const adminCode = getAdminCode()
    if (!adminCode) return null

    const response = await fetch(
      `${PORTAL_API_BASE}/admin/events/${encodeURIComponent(eventId)}/people/process?adminCode=${encodeURIComponent(adminCode)}`,
    )
    const data = await response.json().catch(() => null)
    if (!response.ok) {
      throw new Error(data?.error || 'Unable to read face scan status.')
    }

    return {
      pendingPhotos: typeof data?.pendingPhotos === 'number' ? data.pendingPhotos : 0,
      scannedPhotos: typeof data?.scannedPhotos === 'number' ? data.scannedPhotos : 0,
      totalPhotos: typeof data?.totalPhotos === 'number' ? data.totalPhotos : 0,
      upToDate: Boolean(data?.upToDate),
    } satisfies ScanStatus
  }, [eventId, getAdminCode])

  const processBatch = useCallback(
    async (params: { offset: number; mode: 'pending' | 'all' }) => {
      const adminCode = getAdminCode()
      if (!adminCode) {
        throw new Error('Admin session expired. Sign in again from the admin portal.')
      }

      const response = await fetch(
        `${PORTAL_API_BASE}/admin/events/${encodeURIComponent(eventId)}/people/process`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            adminCode,
            offset: params.offset,
            limit: BATCH_LIMIT,
            mode: params.mode,
          }),
        },
      )
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(data?.error || 'Face scan failed.')
      }

      return data as {
        done?: boolean
        nextOffset?: number | null
        totalPhotos?: number
        processed?: number
        facesDetected?: number
        failed?: number
        errors?: string[]
      }
    },
    [eventId, getAdminCode],
  )

  const runScanLoop = useCallback(
    async (mode: 'pending' | 'all', runId: number) => {
      let offset = 0
      let totalPhotos = 0
      let scannedPhotos = 0
      let totalFaces = 0
      let totalFailed = 0

      while (runId === runIdRef.current) {
        const data = await processBatch({ offset, mode })
        totalPhotos = typeof data.totalPhotos === 'number' ? data.totalPhotos : totalPhotos
        scannedPhotos += typeof data.processed === 'number' ? data.processed : 0
        totalFaces += typeof data.facesDetected === 'number' ? data.facesDetected : 0
        totalFailed += typeof data.failed === 'number' ? data.failed : 0

        if (totalPhotos === 0) {
          setProgress('')
          setActive(false)
          setStatus({ pendingPhotos: 0, scannedPhotos: 0, totalPhotos: 0, upToDate: true })
          return
        }

        setActive(true)
        setProgress(
          `Scanning ${Math.min(scannedPhotos, totalPhotos)} of ${totalPhotos} photos (${totalFaces} faces${totalFailed > 0 ? `, ${totalFailed} failed` : ''})`,
        )
        setStatus({
          pendingPhotos: Math.max(0, totalPhotos - scannedPhotos),
          scannedPhotos,
          totalPhotos,
          upToDate: false,
        })

        if (data.done) {
          const latestStatus = await fetchStatus().catch(() => null)
          if (latestStatus) setStatus(latestStatus)
          setProgress('')
          setActive(false)
          maybeRefreshPeoplePage(totalFaces)
          return
        }

        offset = typeof data.nextOffset === 'number' ? data.nextOffset : scannedPhotos
      }
    },
    [fetchStatus, maybeRefreshPeoplePage, processBatch],
  )

  useEffect(() => {
    const runId = ++runIdRef.current
    let cancelled = false

    async function backgroundWorker() {
      while (!cancelled && runId === runIdRef.current) {
        try {
          setError('')
          const latestStatus = await fetchStatus()
          if (!latestStatus) {
            await sleep(POLL_INTERVAL_MS)
            continue
          }

          setStatus(latestStatus)

          if (latestStatus.pendingPhotos > 0) {
            await runScanLoop('pending', runId)
          }

          if (cancelled || runId !== runIdRef.current) return
          await sleep(POLL_INTERVAL_MS)
        } catch (workerError) {
          if (cancelled || runId !== runIdRef.current) return
          setError(workerError instanceof Error ? workerError.message : 'Face scan failed.')
          setActive(false)
          await sleep(POLL_INTERVAL_MS)
        }
      }
    }

    void backgroundWorker()

    return () => {
      cancelled = true
      runIdRef.current += 1
    }
  }, [eventId, fetchStatus, runScanLoop])

  async function rescanAllPhotos() {
    const runId = ++runIdRef.current
    setRescanningAll(true)
    setError('')

    try {
      await runScanLoop('all', runId)
    } catch (rescanError) {
      setError(rescanError instanceof Error ? rescanError.message : 'Face scan failed.')
      setActive(false)
    } finally {
      setRescanningAll(false)
    }
  }

  const showBannerPanel = active || rescanningAll || Boolean(error) || (status?.pendingPhotos ?? 0) > 0

  if (!showBannerPanel && status?.upToDate) {
    return null
  }

  if (bannerHidden) {
    return (
      <div className="pointer-events-none fixed bottom-4 right-4 z-50">
        <button
          aria-label="Show face scan progress"
          className="pointer-events-auto relative inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200/90 bg-white/95 text-[#10233f] shadow-lg backdrop-blur-sm transition hover:bg-slate-50"
          onClick={showBanner}
          title="Show face scan progress"
          type="button"
        >
          {active || rescanningAll ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ScanFace className="h-4 w-4" />
          )}
          {(active || rescanningAll || (status?.pendingPhotos ?? 0) > 0) && (
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-[#10233f]" />
          )}
        </button>
      </div>
    )
  }

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex max-w-sm flex-col items-end gap-2">
      <div className="pointer-events-auto rounded-2xl border border-slate-200/90 bg-white/95 px-4 py-3 shadow-lg backdrop-blur-sm">
        <div className="flex items-start gap-3">
          {active || rescanningAll ? (
            <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-[#10233f]" />
          ) : (
            <ScanFace className="mt-0.5 h-4 w-4 shrink-0 text-[#10233f]" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold text-[#10233f]">
                {active || rescanningAll ? 'Scanning faces in background' : 'Face scan'}
              </p>
              <button
                aria-label="Hide face scan progress"
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                onClick={hideBanner}
                title="Hide"
                type="button"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            {progress ? (
              <p className="mt-1 text-xs text-slate-600">{progress}</p>
            ) : status && status.pendingPhotos > 0 ? (
              <p className="mt-1 text-xs text-slate-600">
                {status.pendingPhotos} photo{status.pendingPhotos === 1 ? '' : 's'} waiting to scan
              </p>
            ) : (
              <p className="mt-1 text-xs text-slate-500">Keeps checking for new uploads.</p>
            )}
            {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button
            className="text-xs font-semibold text-slate-500 underline-offset-2 transition hover:text-[#10233f] hover:underline disabled:cursor-not-allowed disabled:opacity-50"
            disabled={active || rescanningAll}
            onClick={() => void rescanAllPhotos()}
            type="button"
          >
            Rescan all photos
          </button>
          <button
            className="text-xs font-semibold text-slate-400 underline-offset-2 transition hover:text-slate-600 hover:underline"
            onClick={hideBanner}
            type="button"
          >
            Hide
          </button>
        </div>
      </div>
    </div>
  )
}
