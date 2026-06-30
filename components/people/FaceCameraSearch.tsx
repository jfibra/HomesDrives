'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, CameraOff, Loader2, ScanFace, UserRound } from 'lucide-react'

import { PORTAL_ADMIN_SESSION_KEY } from '@/lib/portals/constants'
import type { FaceSearchMatch, FaceSearchResult } from '@/lib/types/people'

const SCAN_INTERVAL_MS = 1800

type FaceCameraSearchProps = {
  includeAdminCode?: boolean
  onResult?: (result: FaceSearchResult | null) => void
  personBasePath?: string
  searchUrl: string
}

function parseSearchResponse(data: Record<string, unknown> | null): FaceSearchResult {
  const matches: FaceSearchMatch[] = Array.isArray(data?.matches)
    ? data.matches
        .map((entry) => {
          if (!entry || typeof entry !== 'object') return null
          const row = entry as Record<string, unknown>
          const person = row.person
          if (!person || typeof person !== 'object') return null
          const p = person as Record<string, unknown>
          if (typeof p.id !== 'string') return null
          return {
            person: {
              id: p.id,
              name: typeof p.name === 'string' ? p.name : 'Unknown',
              cover_face_url:
                typeof p.cover_face_url === 'string' && p.cover_face_url.trim()
                  ? p.cover_face_url.trim()
                  : null,
              photo_count: typeof p.photo_count === 'number' ? p.photo_count : 0,
              created_at: typeof p.created_at === 'string' ? p.created_at : '',
            },
            similarity: typeof row.similarity === 'number' ? row.similarity : 0,
          }
        })
        .filter((entry): entry is FaceSearchMatch => Boolean(entry))
    : []

  const personData =
    data?.person && typeof data.person === 'object' ? (data.person as Record<string, unknown>) : null

  return {
    person: personData && typeof personData.id === 'string'
      ? {
          id: personData.id,
          name: typeof personData.name === 'string' ? personData.name : 'Unknown',
          cover_face_url:
            typeof personData.cover_face_url === 'string' && personData.cover_face_url.trim()
              ? personData.cover_face_url.trim()
              : null,
          photo_count: typeof personData.photo_count === 'number' ? personData.photo_count : 0,
          created_at: typeof personData.created_at === 'string' ? personData.created_at : '',
        }
      : matches[0]?.person ?? null,
    photos: [],
    bestSimilarity: typeof data?.bestSimilarity === 'number' ? data.bestSimilarity : matches[0]?.similarity ?? null,
    matches,
    noFaceDetected: Boolean(data?.noFaceDetected),
  }
}

export default function FaceCameraSearch({
  includeAdminCode = false,
  onResult,
  personBasePath = '/people',
  searchUrl,
}: FaceCameraSearchProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const scanTimerRef = useRef<number | null>(null)
  const inFlightRef = useRef(false)

  const [cameraActive, setCameraActive] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('Start the camera to scan your face in real time.')
  const [error, setError] = useState('')
  const [matches, setMatches] = useState<FaceSearchMatch[]>([])

  const stopCamera = useCallback(() => {
    if (scanTimerRef.current != null) {
      window.clearInterval(scanTimerRef.current)
      scanTimerRef.current = null
    }

    const stream = streamRef.current
    if (stream) {
      for (const track of stream.getTracks()) {
        track.stop()
      }
      streamRef.current = null
    }

    const video = videoRef.current
    if (video) {
      video.srcObject = null
    }

    setCameraActive(false)
    setScanning(false)
    setLoading(false)
    inFlightRef.current = false
  }, [])

  useEffect(() => () => stopCamera(), [stopCamera])

  const captureFrame = useCallback(async () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.videoWidth === 0 || video.videoHeight === 0) {
      return null
    }

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const context = canvas.getContext('2d')
    if (!context) return null

    context.drawImage(video, 0, 0, canvas.width, canvas.height)

    return new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.88)
    })
  }, [])

  const runSearch = useCallback(async () => {
    if (inFlightRef.current) return

    const frame = await captureFrame()
    if (!frame) return

    inFlightRef.current = true
    setLoading(true)
    setError('')

    try {
      const formData = new FormData()
      formData.append('file', frame, 'camera-frame.jpg')
      formData.append('limit', '12')

      if (includeAdminCode) {
        const adminCode = window.localStorage.getItem(PORTAL_ADMIN_SESSION_KEY)?.trim() ?? ''
        if (!adminCode) {
          throw new Error('Admin session expired. Sign in again from the admin portal.')
        }
        formData.append('adminCode', adminCode)
      }

      const response = await fetch(searchUrl, {
        method: 'POST',
        body: formData,
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(
          data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
            ? data.error
            : 'Face search failed.',
        )
      }

      const result = parseSearchResponse(data as Record<string, unknown>)
      onResult?.(result)
      setMatches(result.matches)

      if (result.noFaceDetected) {
        setStatus('No face detected. Center your face in the camera frame.')
        return
      }

      if (result.matches.length === 0) {
        setStatus('Face detected, but no matching people found in this library.')
        return
      }

      setStatus(
        `Found ${result.matches.length} matching ${result.matches.length === 1 ? 'person' : 'people'}.`,
      )
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : 'Face search failed.')
      setStatus('Scan paused due to an error.')
    } finally {
      inFlightRef.current = false
      setLoading(false)
    }
  }, [captureFrame, includeAdminCode, onResult, searchUrl])

  const startScanLoop = useCallback(() => {
    if (scanTimerRef.current != null) {
      window.clearInterval(scanTimerRef.current)
    }

    setScanning(true)
    setStatus('Scanning for matches…')
    void runSearch()

    scanTimerRef.current = window.setInterval(() => {
      void runSearch()
    }, SCAN_INTERVAL_MS)
  }, [runSearch])

  const startCamera = useCallback(async () => {
    setError('')
    setMatches([])
    setStatus('Starting camera…')

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: 'user',
          width: { ideal: 960 },
          height: { ideal: 720 },
        },
      })

      streamRef.current = stream
      const video = videoRef.current
      if (!video) {
        throw new Error('Camera preview is not ready.')
      }

      video.srcObject = stream
      await video.play()
      setCameraActive(true)
      startScanLoop()
    } catch (cameraError) {
      stopCamera()
      setError(
        cameraError instanceof Error
          ? cameraError.message
          : 'Unable to access the camera. Check browser permissions.',
      )
      setStatus('Camera unavailable.')
    }
  }, [startScanLoop, stopCamera])

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-950 shadow-sm">
        <div className="relative aspect-[4/3] w-full bg-slate-900 sm:aspect-video">
          <video
            autoPlay
            className={`h-full w-full object-cover ${cameraActive ? 'block' : 'hidden'}`}
            muted
            playsInline
            ref={videoRef}
          />
          {!cameraActive ? (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center text-slate-300">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/10">
                <Camera className="h-8 w-8" />
              </div>
              <p className="text-sm font-medium text-white">Live face scanner</p>
              <p className="mt-1 max-w-sm text-xs text-slate-400">
                Use your webcam to find matching people in this event&apos;s library in real time.
              </p>
            </div>
          ) : null}
          {cameraActive ? (
            <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/50 to-transparent px-4 py-3">
              <div className="inline-flex items-center gap-2 text-xs font-medium text-white">
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanFace className="h-3.5 w-3.5" />}
                {scanning ? 'Live scanning' : 'Camera on'}
              </div>
              {matches.length > 0 ? (
                <span className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold text-white">
                  {matches.length} match{matches.length === 1 ? '' : 'es'}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        <canvas className="hidden" ref={canvasRef} />

        <div className="flex flex-col gap-3 border-t border-white/10 bg-slate-900 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-300">{status}</p>
          <div className="flex flex-wrap gap-2">
            {!cameraActive ? (
              <button
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-[#10233f] transition hover:bg-slate-100"
                onClick={() => void startCamera()}
                type="button"
              >
                <Camera className="h-4 w-4" />
                Start camera
              </button>
            ) : (
              <>
                <button
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15"
                  disabled={loading}
                  onClick={() => void runSearch()}
                  type="button"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanFace className="h-4 w-4" />}
                  Scan now
                </button>
                <button
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
                  onClick={stopCamera}
                  type="button"
                >
                  <CameraOff className="h-4 w-4" />
                  Stop camera
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {matches.length > 0 ? (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-[#10233f]">Matching people</h3>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {matches.map((match, index) => (
              <Link
                className="group overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                href={`${personBasePath}/${match.person.id}`}
                key={match.person.id}
              >
                <div className="relative aspect-square overflow-hidden bg-slate-100">
                  {match.person.cover_face_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      alt={match.person.name}
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                      src={match.person.cover_face_url}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-slate-300">
                      <UserRound className="h-16 w-16" />
                    </div>
                  )}
                  <span className="absolute bottom-2 right-2 rounded-full bg-[#10233f] px-2 py-0.5 text-[11px] font-semibold text-white">
                    {Math.round(match.similarity * 100)}%
                  </span>
                  {index === 0 ? (
                    <span className="absolute left-2 top-2 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                      Best
                    </span>
                  ) : null}
                </div>
                <div className="space-y-1 p-4">
                  <p className="truncate text-sm font-semibold text-[#10233f]">{match.person.name}</p>
                  <p className="text-xs text-slate-500">
                    {match.person.photo_count} photo{match.person.photo_count === 1 ? '' : 's'}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
