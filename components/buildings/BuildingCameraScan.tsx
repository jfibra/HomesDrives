'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Building2, Camera, CameraOff, Loader2, MapPin, ScanSearch } from 'lucide-react'

import type { BuildingMatch, BuildingMatchConfidence, BuildingRecognitionResult } from '@/lib/types/buildings'
import { requestCurrentLocation } from '@/lib/client/geolocation'

const SCAN_INTERVAL_MS = 2500

type BuildingCameraScanProps = {
  onResult?: (result: BuildingRecognitionResult | null) => void
  searchUrl?: string
}

function parseRecognitionResponse(data: Record<string, unknown> | null): BuildingRecognitionResult {
  const matches: BuildingMatch[] = Array.isArray(data?.matches)
    ? data.matches
        .map((entry) => {
          if (!entry || typeof entry !== 'object') return null
          const row = entry as Record<string, unknown>
          const building = row.building
          if (!building || typeof building !== 'object') return null
          const b = building as Record<string, unknown>
          if (typeof b.id !== 'string' || typeof b.name !== 'string') return null

          return {
            building: {
              id: b.id,
              name: b.name,
              description: typeof b.description === 'string' ? b.description : null,
              full_address: typeof b.full_address === 'string' ? b.full_address : null,
              latitude: typeof b.latitude === 'number' ? b.latitude : null,
              longitude: typeof b.longitude === 'number' ? b.longitude : null,
              listings: Array.isArray(b.listings) ? (b.listings as BuildingMatch['building']['listings']) : [],
              cover_image_url:
                typeof b.cover_image_url === 'string' && b.cover_image_url.trim()
                  ? b.cover_image_url.trim()
                  : null,
              reference_photo_count:
                typeof b.reference_photo_count === 'number' ? b.reference_photo_count : 0,
              created_at: typeof b.created_at === 'string' ? b.created_at : '',
              updated_at: typeof b.updated_at === 'string' ? b.updated_at : '',
            },
            similarity: typeof row.similarity === 'number' ? row.similarity : 0,
            confidence:
              row.confidence === 'high' || row.confidence === 'medium' || row.confidence === 'low'
                ? (row.confidence as BuildingMatchConfidence)
                : 'medium',
          }
        })
        .filter((entry): entry is BuildingMatch => Boolean(entry))
    : []

  return {
    matches,
    bestSimilarity: typeof data?.bestSimilarity === 'number' ? data.bestSimilarity : matches[0]?.similarity ?? null,
    building: matches[0]?.building ?? null,
    ambiguous: Boolean(data?.ambiguous),
    lowQualityImage: Boolean(data?.lowQualityImage),
    qualityMessage:
      typeof data?.qualityMessage === 'string' && data.qualityMessage.trim()
        ? data.qualityMessage.trim()
        : null,
    usedGpsFilter: Boolean(data?.usedGpsFilter),
  }
}

function confidenceLabel(confidence: BuildingMatchConfidence) {
  if (confidence === 'high') return 'High confidence'
  if (confidence === 'medium') return 'Good match'
  return 'Low confidence'
}

function confidenceClass(confidence: BuildingMatchConfidence) {
  if (confidence === 'high') return 'bg-emerald-500'
  if (confidence === 'medium') return 'bg-amber-500'
  return 'bg-slate-500'
}

export default function BuildingCameraScan({
  onResult,
  searchUrl = '/api/buildings/recognize',
}: BuildingCameraScanProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const scanTimerRef = useRef<number | null>(null)
  const inFlightRef = useRef(false)
  const resultLockedRef = useRef(false)

  const [cameraActive, setCameraActive] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [loading, setLoading] = useState(false)
  const [resultLocked, setResultLocked] = useState(false)
  const [status, setStatus] = useState('Start the camera to scan a building in real time.')
  const [error, setError] = useState('')
  const [matches, setMatches] = useState<BuildingMatch[]>([])
  const [scanLocation, setScanLocation] = useState<{ latitude: number; longitude: number } | null>(null)
  const [gpsEnabled, setGpsEnabled] = useState(false)

  const pauseScanLoop = useCallback(() => {
    if (scanTimerRef.current != null) {
      window.clearInterval(scanTimerRef.current)
      scanTimerRef.current = null
    }
    setScanning(false)
  }, [])

  const releaseCameraStream = useCallback(() => {
    pauseScanLoop()

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
    setLoading(false)
    inFlightRef.current = false
  }, [pauseScanLoop])

  const stopCamera = useCallback(() => {
    releaseCameraStream()
    setResultLocked(false)
    resultLockedRef.current = false
    setMatches([])
    setStatus('Start the camera to scan a building in real time.')
  }, [releaseCameraStream])

  useEffect(() => () => {
    releaseCameraStream()
  }, [releaseCameraStream])

  const lockCapture = useCallback((nextMatches: BuildingMatch[]) => {
    releaseCameraStream()
    resultLockedRef.current = true
    setResultLocked(true)
    setMatches(nextMatches)
    setStatus(
      nextMatches.length > 0
        ? `Found ${nextMatches.length} matching ${nextMatches.length === 1 ? 'building' : 'buildings'}.`
        : 'No matching buildings found in the dataset.',
    )
  }, [releaseCameraStream])

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
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.9)
    })
  }, [])

  const runSearch = useCallback(async () => {
    if (inFlightRef.current || resultLockedRef.current) return

    const frame = await captureFrame()
    if (!frame) return

    inFlightRef.current = true
    setLoading(true)
    setError('')

    try {
      const formData = new FormData()
      formData.append('file', frame, 'building-frame.jpg')
      formData.append('limit', '5')
      if (scanLocation) {
        formData.append('latitude', String(scanLocation.latitude))
        formData.append('longitude', String(scanLocation.longitude))
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
            : 'Building recognition failed.',
        )
      }

      const result = parseRecognitionResponse(data as Record<string, unknown>)
      onResult?.(result)

      if (result.lowQualityImage) {
        setStatus(result.qualityMessage ?? 'Hold steady and improve lighting for a clearer scan.')
        return
      }

      if (result.matches.length === 0) {
        setStatus(
          result.usedGpsFilter
            ? 'No nearby buildings matched. Move closer to the facade or add this building in Register.'
            : 'No matching buildings yet. Register this building first, then scan again.',
        )
        return
      }

      if (result.ambiguous) {
        setStatus('Possible match found, but another building looks similar. Showing the best candidate only.')
      }

      lockCapture(result.matches)
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : 'Building recognition failed.')
      setStatus('Scan paused due to an error.')
    } finally {
      inFlightRef.current = false
      setLoading(false)
    }
  }, [captureFrame, lockCapture, onResult, scanLocation, searchUrl])

  const startScanLoop = useCallback(() => {
    if (scanTimerRef.current != null) {
      window.clearInterval(scanTimerRef.current)
    }

    setScanning(true)
    setStatus('Scanning for matching buildings…')
    void runSearch()

    scanTimerRef.current = window.setInterval(() => {
      void runSearch()
    }, SCAN_INTERVAL_MS)
  }, [runSearch])

  const startCamera = useCallback(async () => {
    setError('')
    setMatches([])
    setResultLocked(false)
    resultLockedRef.current = false
    setStatus('Starting camera…')

    if (navigator.geolocation) {
      void requestCurrentLocation()
        .then((position) => {
          setScanLocation({
            latitude: position.latitude,
            longitude: position.longitude,
          })
          setGpsEnabled(true)
        })
        .catch(() => {
          setScanLocation(null)
          setGpsEnabled(false)
        })
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 960 },
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

  const scanAgain = useCallback(() => {
    resultLockedRef.current = false
    setResultLocked(false)
    setMatches([])
    setError('')
    onResult?.(null)
    window.requestAnimationFrame(() => {
      void startCamera()
    })
  }, [onResult, startCamera])

  return (
    <div className="space-y-6">
      {!resultLocked ? (
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
                  <Building2 className="h-8 w-8" />
                </div>
                <p className="text-sm font-medium text-white">Live building scanner</p>
                <p className="mt-1 max-w-sm text-xs text-slate-400">
                  Point your camera at a registered building facade. Use good lighting and hold steady.
                </p>
              </div>
            ) : null}
            {cameraActive ? (
              <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/50 to-transparent px-4 py-3">
                <div className="inline-flex items-center gap-2 text-xs font-medium text-white">
                  {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanSearch className="h-3.5 w-3.5" />}
                  {scanning ? 'Live scanning' : 'Camera on'}
                </div>
                {gpsEnabled ? (
                  <span className="rounded-full bg-emerald-500/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                    GPS on
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
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />}
                    Capture now
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
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {resultLocked ? (
        <div>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-[#10233f]">
                {matches.length > 0 ? 'Matching buildings' : 'No match'}
              </h3>
              <p className="mt-1 text-sm text-slate-500">{status}</p>
            </div>
            <button
              className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#10233f] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0d1c33]"
              onClick={scanAgain}
              type="button"
            >
              <ScanSearch className="h-4 w-4" />
              Scan again
            </button>
          </div>

          {matches.length > 0 ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {matches.map((match, index) => (
                <article
                  className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm"
                  key={match.building.id}
                >
                  <div className="grid gap-0 sm:grid-cols-[180px_1fr]">
                    <div className="relative aspect-[4/3] bg-slate-100 sm:aspect-auto sm:min-h-full">
                      {match.building.cover_image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          alt={match.building.name}
                          className="h-full w-full object-cover"
                          src={match.building.cover_image_url}
                        />
                      ) : (
                        <div className="flex h-full min-h-[140px] items-center justify-center text-slate-300">
                          <Building2 className="h-12 w-12" />
                        </div>
                      )}
                      <span className="absolute bottom-2 right-2 rounded-full bg-[#10233f] px-2 py-0.5 text-[11px] font-semibold text-white">
                        {Math.round(match.similarity * 100)}%
                      </span>
                      {index === 0 ? (
                        <span
                          className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white ${confidenceClass(match.confidence)}`}
                        >
                          {confidenceLabel(match.confidence)}
                        </span>
                      ) : null}
                    </div>
                    <div className="space-y-3 p-4">
                      <div>
                        <h4 className="text-lg font-semibold text-[#10233f]">{match.building.name}</h4>
                        {match.building.full_address ? (
                          <p className="mt-1 inline-flex items-start gap-1 text-sm text-slate-500">
                            <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                            {match.building.full_address}
                          </p>
                        ) : null}
                      </div>
                      {match.building.description ? (
                        <p className="text-sm text-slate-600">{match.building.description}</p>
                      ) : null}
                      {(match.building.latitude != null || match.building.longitude != null) ? (
                        <p className="text-xs text-slate-500">
                          {match.building.latitude ?? '—'}, {match.building.longitude ?? '—'}
                        </p>
                      ) : null}
                      {match.building.listings.length > 0 ? (
                        <div className="space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Listings</p>
                          {match.building.listings.map((listing) => (
                            <div className="rounded-xl bg-slate-50 px-3 py-2 text-sm" key={`${match.building.id}-${listing.title}`}>
                              <p className="font-medium text-[#10233f]">{listing.title}</p>
                              {listing.price ? <p className="text-slate-600">{listing.price}</p> : null}
                              {listing.description ? <p className="mt-1 text-slate-500">{listing.description}</p> : null}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
