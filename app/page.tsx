'use client'

import { useEffect, useRef, useState } from 'react'
import { MapPin, Monitor, Smartphone, Tablet, Trash2, Upload } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

const contributors = [
  'Frank Gomez',
  'Jaevie Bayona',
  'Jomari Marson',
  'Hernan Malubay',
  'Michaela Lagdamen',
  'Johnry Fibra',
  'Marcelo Cagara Jr',
]

type UploadStatus = 'uploading' | 'uploaded' | 'error' | 'deleting'

type UploadedImage = {
  dbId: string | null
  id: string
  imageUrl: string | null
  previewUrl: string
  storagePath: string | null
  metadata: {
    altitude: number | null
    aperture: number | null
    captureDate: string | null
    description: string | null
    deviceMake: string | null
    deviceModel: string | null
    exposureTime: string | null
    fileName: string
    fileSize: number
    fileType: string
    focalLength: number | null
    height: number | null
    iso: number | null
    keywords: string[]
    lastModified: string
    latitude: number | null
    lensModel: string | null
    longitude: number | null
    width: number | null
  }
  placeName: string | null
  uploadError: string | null
  uploadStatus: UploadStatus
}

function getDeviceInfo(): { label: string; type: 'mobile' | 'tablet' | 'desktop' } {
  if (typeof navigator === 'undefined') {
    return { label: 'Unknown device', type: 'desktop' }
  }

  const ua = navigator.userAgent

  // Detect OS / brand
  const isIPhone = /iPhone/.test(ua)
  const isIPad = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  const isAndroid = /Android/.test(ua)
  const isWindows = /Windows/.test(ua)
  const isMac = /Macintosh/.test(ua) && navigator.maxTouchPoints <= 1
  const isLinux = /Linux/.test(ua) && !isAndroid

  // Detect OS version
  const iosMatch = ua.match(/OS (\d+)_(\d+)/)
  const androidMatch = ua.match(/Android (\d+\.?\d*)/)
  const windowsMatch = ua.match(/Windows NT (\d+\.\d+)/)
  const windowsVersion: Record<string, string> = { '10.0': '10/11', '6.3': '8.1', '6.2': '8', '6.1': '7' }

  if (isIPhone) {
    const v = iosMatch ? ` iOS ${iosMatch[1]}` : ''
    return { label: `iPhone${v}`, type: 'mobile' }
  }
  if (isIPad) {
    const v = iosMatch ? ` iOS ${iosMatch[1]}` : ''
    return { label: `iPad${v}`, type: 'tablet' }
  }
  if (isAndroid) {
    const v = androidMatch ? ` ${androidMatch[1]}` : ''
    // Rough tablet heuristic: screen wider than 600dp
    const isTablet = typeof screen !== 'undefined' && Math.min(screen.width, screen.height) >= 600
    return { label: `Android${v}`, type: isTablet ? 'tablet' : 'mobile' }
  }
  if (isWindows) {
    const v = windowsMatch ? ` ${windowsVersion[windowsMatch[1]] ?? windowsMatch[1]}` : ''
    return { label: `Windows${v}`, type: 'desktop' }
  }
  if (isMac) {
    return { label: 'Mac', type: 'desktop' }
  }
  if (isLinux) {
    return { label: 'Linux', type: 'desktop' }
  }

  return { label: 'Unknown device', type: 'desktop' }
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B'
  }

  const units = ['B', 'KB', 'MB', 'GB']
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** unitIndex

  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

function formatCoordinate(value: number | null, positiveDirection: string, negativeDirection: string) {
  if (value == null) {
    return 'Unavailable'
  }

  const direction = value >= 0 ? positiveDirection : negativeDirection
  return `${Math.abs(value).toFixed(6)} deg ${direction}`
}

function formatDate(value: string | null) {
  if (!value) {
    return 'Unavailable'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function getTextValue(value: string | number | null | undefined) {
  if (value == null || value === '') {
    return 'Unavailable'
  }

  return String(value)
}

async function getImageDimensions(file: File) {
  const objectUrl = URL.createObjectURL(file)

  try {
    const image = new Image()

    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error(`Unable to read dimensions for ${file.name}`))
      image.src = objectUrl
    })

    return {
      width: image.naturalWidth || null,
      height: image.naturalHeight || null,
    }
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

async function analyzeImage(file: File): Promise<UploadedImage> {
  const previewUrl = URL.createObjectURL(file)
  const dimensions = await getImageDimensions(file)
  const exifr = await import('exifr')
  const metadata = await exifr.parse(file, {
    gps: true,
    exif: true,
    iptc: true,
    tiff: true,
    xmp: true,
    sanitize: true,
  })

  const latitude = metadata?.latitude ?? metadata?.lat ?? null
  const longitude = metadata?.longitude ?? metadata?.lon ?? null
  const keywords = Array.isArray(metadata?.Keywords)
    ? metadata.Keywords.map(String)
    : metadata?.Keywords
      ? [String(metadata.Keywords)]
      : []

  return {
    dbId: null,
    id: `${file.name}-${file.lastModified}-${file.size}`,
    imageUrl: null,
    previewUrl,
    storagePath: null,
    metadata: {
      altitude: metadata?.GPSAltitude ?? metadata?.altitude ?? null,
      aperture: metadata?.FNumber ?? metadata?.ApertureValue ?? null,
      captureDate:
        metadata?.DateTimeOriginal?.toISOString?.() ??
        metadata?.CreateDate?.toISOString?.() ??
        metadata?.ModifyDate?.toISOString?.() ??
        null,
      description: metadata?.ImageDescription ?? metadata?.Description ?? null,
      deviceMake: metadata?.Make ?? null,
      deviceModel: metadata?.Model ?? null,
      exposureTime: metadata?.ExposureTime ? String(metadata.ExposureTime) : null,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type || 'Unknown',
      focalLength: metadata?.FocalLength ?? null,
      height: dimensions.height,
      iso: metadata?.ISO ?? null,
      keywords,
      lastModified: new Date(file.lastModified).toISOString(),
      latitude,
      lensModel: metadata?.LensModel ?? null,
      longitude,
      width: dimensions.width,
    },
    placeName: null,
    uploadError: null,
    uploadStatus: 'uploading',
  }
}

export default function Home() {
  const [selectedName, setSelectedName] = useState('')
  const [submittedName, setSubmittedName] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([])
  const [analysisError, setAnalysisError] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isTagModalOpen, setIsTagModalOpen] = useState(false)
  const [tagPlaceName, setTagPlaceName] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const previewUrlsRef = useRef<string[]>([])

  useEffect(() => {
    return () => {
      previewUrlsRef.current.forEach((previewUrl) => {
        URL.revokeObjectURL(previewUrl)
      })
    }
  }, [])

  function updateUploadedImage(
    imageId: string,
    updater: (image: UploadedImage) => UploadedImage,
  ) {
    setUploadedImages((currentImages) =>
      currentImages.map((image) => (image.id === imageId ? updater(image) : image)),
    )
  }

  async function uploadImageToStorage(file: File, image: UploadedImage, uploaderName: string) {
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('uploaderName', uploaderName)
      formData.append('metadata', JSON.stringify(image.metadata))

      const response = await fetch('/api/photos', {
        method: 'POST',
        body: formData,
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Unable to upload the photo right now.')
      }

      updateUploadedImage(image.id, (currentImage) => ({
        ...currentImage,
        dbId: data.photo.id,
        imageUrl: data.photo.image_url,
        storagePath: data.photo.storage_path,
        uploadError: null,
        uploadStatus: 'uploaded',
      }))
    } catch (error) {
      updateUploadedImage(image.id, (currentImage) => ({
        ...currentImage,
        uploadError:
          error instanceof Error ? error.message : 'Unable to upload the photo right now.',
        uploadStatus: 'error',
      }))
    }
  }

  async function handleDeleteImage(imageId: string) {
    const image = uploadedImages.find((currentImage) => currentImage.id === imageId)

    if (!image || image.uploadStatus === 'uploading' || image.uploadStatus === 'deleting') {
      return
    }

    updateUploadedImage(imageId, (currentImage) => ({
      ...currentImage,
      uploadError: null,
      uploadStatus: 'deleting',
    }))

    try {
      if (image.dbId) {
        const response = await fetch(`/api/photos/${image.dbId}`, {
          method: 'DELETE',
        })
        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Unable to delete the photo right now.')
        }
      }

      URL.revokeObjectURL(image.previewUrl)
      previewUrlsRef.current = previewUrlsRef.current.filter(
        (previewUrl) => previewUrl !== image.previewUrl,
      )
      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.delete(imageId)
        return next
      })
      setUploadedImages((currentImages) =>
        currentImages.filter((currentImage) => currentImage.id !== imageId),
      )
    } catch (error) {
      updateUploadedImage(imageId, (currentImage) => ({
        ...currentImage,
        uploadError:
          error instanceof Error ? error.message : 'Unable to delete the photo right now.',
        uploadStatus: image.dbId ? 'uploaded' : 'error',
      }))
    }
  }

  async function handleIncomingFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList).filter((file) => file.type.startsWith('image/'))

    if (!files.length) {
      setAnalysisError('Please upload image files only.')
      return
    }

    setAnalysisError('')
    setIsAnalyzing(true)

    try {
      const preparedImages = await Promise.all(
        files.map(async (file) => ({
          file,
          image: await analyzeImage(file),
        })),
      )
      const existingIds = new Set(uploadedImages.map((image) => image.id))
      const nextImages = preparedImages.filter(({ image }) => !existingIds.has(image.id))

      if (!nextImages.length) {
        return
      }

      previewUrlsRef.current.push(...nextImages.map(({ image }) => image.previewUrl))
      setUploadedImages((currentImages) => [
        ...currentImages,
        ...nextImages.map(({ image }) => image),
      ])

      await Promise.all(
        nextImages.map(({ file, image }) => uploadImageToStorage(file, image, submittedName)),
      )
    } catch (error) {
      setAnalysisError(
        error instanceof Error
          ? error.message
          : 'Unable to analyze the uploaded files.',
      )
    } finally {
      setIsAnalyzing(false)
    }
  }

  function toggleImageSelection(imageId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(imageId)) {
        next.delete(imageId)
      } else {
        next.add(imageId)
      }
      return next
    })
  }

  function handleTagImages() {
    const trimmed = tagPlaceName.trim()
    if (!trimmed) return
    setUploadedImages((currentImages) =>
      currentImages.map((image) =>
        selectedIds.has(image.id) ? { ...image, placeName: trimmed } : image,
      ),
    )
    setSelectedIds(new Set())
    setIsTagModalOpen(false)
    setTagPlaceName('')
  }

  function handleDrop(event: React.DragEvent<HTMLLabelElement>) {
    event.preventDefault()
    setIsDragging(false)

    void handleIncomingFiles(event.dataTransfer.files)
  }

  function handleDragOver(event: React.DragEvent<HTMLLabelElement>) {
    event.preventDefault()
    setIsDragging(true)
  }

  function handleDragLeave(event: React.DragEvent<HTMLLabelElement>) {
    event.preventDefault()
    setIsDragging(false)
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    if (!event.target.files?.length) {
      return
    }

    void handleIncomingFiles(event.target.files)
    event.target.value = ''
  }

  const photosWithLocation = uploadedImages.filter(
    (image) => image.metadata.latitude != null && image.metadata.longitude != null,
  ).length
  const uploadedPhotosCount = uploadedImages.filter(
    (image) => image.uploadStatus === 'uploaded',
  ).length

  //  Step 1: name selection 
  if (!submittedName) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-white via-orange-50/60 to-emerald-50/40 px-4">
        <div className="w-full max-w-md space-y-10">
          {/* Wordmark */}
          <p className="text-center text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
            Homes Albums
          </p>

          {/* Greeting */}
          <div className="space-y-3 text-center">
            <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
              Good day! 
            </h1>
            <p className="text-base leading-7 text-muted-foreground">
              Select your name below to start uploading your photos.
            </p>
          </div>

          {/* Dropdown form */}
          <div className="space-y-4">
            <select
              className="h-14 w-full appearance-none rounded-2xl border border-border/70 bg-white px-5 text-base text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-950"
              onChange={(e) => setSelectedName(e.target.value)}
              value={selectedName}
            >
              <option value="" disabled>
                Choose your name…
              </option>
              {contributors.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>

            <button
              className={cn(
                'h-14 w-full rounded-2xl text-base font-semibold transition-all',
                selectedName
                  ? 'bg-slate-950 text-white shadow-md active:scale-[0.98]'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed',
              )}
              onClick={() => {
                if (selectedName) setSubmittedName(selectedName)
              }}
              type="button"
            >
              Continue
            </button>
          </div>
        </div>
      </main>
    )
  }

  //  Step 2: upload 
  const deviceInfo = getDeviceInfo()
  const DeviceIcon =
    deviceInfo.type === 'mobile'
      ? Smartphone
      : deviceInfo.type === 'tablet'
        ? Tablet
        : Monitor

  return (
    <main className="min-h-screen bg-gradient-to-br from-white via-orange-50/60 to-emerald-50/40 px-4 py-12">
      <div className="mx-auto max-w-2xl space-y-10">
        {/* Header */}
        <div className="space-y-1 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
            Homes Albums
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Upload your photos
          </h1>
          <p className="text-sm text-muted-foreground">
            Uploading as{' '}
            <span className="font-semibold text-foreground">{submittedName}</span>
            {' - '}
            <button
              className="underline underline-offset-2 hover:text-foreground"
              onClick={() => {
                setSubmittedName('')
                setUploadedImages([])
                setAnalysisError('')
              }}
              type="button"
            >
              Change
            </button>
          </p>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-white px-3 py-1 text-xs text-muted-foreground shadow-sm">
            <DeviceIcon className="h-3.5 w-3.5" />
            <span>{deviceInfo.label}</span>
          </div>
        </div>

        {/* Dropzone */}
        <label
          className={cn(
            'flex min-h-52 cursor-pointer flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed px-8 py-10 text-center transition-all duration-200',
            isDragging
              ? 'border-orange-400 bg-orange-50 shadow-[0_18px_50px_-30px_rgba(249,115,22,0.4)]'
              : 'border-border/70 bg-white hover:border-orange-300 hover:bg-orange-50/50',
          )}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <input
            accept="image/*"
            className="sr-only"
            multiple
            onChange={handleFileChange}
            ref={fileInputRef}
            type="file"
          />
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-950 text-white">
            <Upload className="h-6 w-6" />
          </div>
          <div>
            <p className="text-lg font-semibold">Drop photos here</p>
            <p className="mt-1 text-sm text-muted-foreground">
              or click to browse - JPG, HEIC, PNG supported
            </p>
          </div>
        </label>

        {isAnalyzing ? (
          <p className="text-center text-sm text-muted-foreground">
            Reading and uploading photos...
          </p>
        ) : null}

        {analysisError ? (
          <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-center text-sm text-red-700">
            {analysisError}
          </p>
        ) : null}

        {/* Uploaded image grid */}
        {uploadedImages.length > 0 ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">
                {uploadedPhotosCount} uploaded of {uploadedImages.length} photo
                {uploadedImages.length !== 1 ? 's' : ''}
                {photosWithLocation > 0 ? ` - ${photosWithLocation} with GPS` : ''}
              </p>
              <button
                className="text-sm underline underline-offset-2 hover:text-foreground text-muted-foreground"
                onClick={() => fileInputRef.current?.click()}
                type="button"
              >
                Add more
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {uploadedImages.map((image) => {
                const hasGps =
                  image.metadata.latitude != null && image.metadata.longitude != null
                const imageSrc = image.imageUrl || image.previewUrl
                const isBusy =
                  image.uploadStatus === 'uploading' || image.uploadStatus === 'deleting'

                return (
                  <div
                    key={image.id}
                    className={cn(
                      'overflow-hidden rounded-2xl border bg-white shadow-sm transition-all',
                      selectedIds.has(image.id)
                        ? 'border-slate-950 ring-2 ring-slate-950'
                        : 'border-border/60',
                    )}
                  >
                    <button
                      className="relative block w-full text-left transition-all hover:opacity-95 active:scale-[0.99]"
                      onClick={() => toggleImageSelection(image.id)}
                      type="button"
                    >
                      <img
                        alt={image.metadata.fileName}
                        className="aspect-square w-full object-cover"
                        src={imageSrc}
                      />
                      {image.uploadStatus === 'uploading' ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40">
                          <svg
                            className="h-8 w-8 animate-spin text-white"
                            fill="none"
                            viewBox="0 0 24 24"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="3"
                            />
                            <path
                              className="opacity-80"
                              d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                              fill="currentColor"
                            />
                          </svg>
                          <span className="text-[11px] font-semibold text-white">Uploading…</span>
                        </div>
                      ) : null}
                      {image.uploadStatus === 'deleting' ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40">
                          <svg
                            className="h-8 w-8 animate-spin text-white"
                            fill="none"
                            viewBox="0 0 24 24"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="3"
                            />
                            <path
                              className="opacity-80"
                              d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                              fill="currentColor"
                            />
                          </svg>
                          <span className="text-[11px] font-semibold text-white">Deleting…</span>
                        </div>
                      ) : null}
                      {selectedIds.has(image.id) && !isBusy ? (
                        <div className="absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full bg-slate-950">
                          <svg
                            className="h-3 w-3 text-white"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            viewBox="0 0 24 24"
                          >
                            <path
                              d="M5 13l4 4L19 7"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </div>
                      ) : null}
                    </button>
                    <div className="p-3">
                      <p
                        className="truncate text-xs font-medium text-foreground"
                        title={image.metadata.fileName}
                      >
                        {image.metadata.fileName}
                      </p>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {formatBytes(image.metadata.fileSize)}
                        </span>
                        {hasGps ? (
                          <span className="flex items-center gap-0.5 text-xs font-medium text-emerald-600">
                            <MapPin className="h-3 w-3" />
                            GPS
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span
                          className={cn(
                            'text-[11px] font-medium',
                            image.uploadStatus === 'uploaded' && 'text-emerald-600',
                            image.uploadStatus === 'uploading' && 'text-amber-600',
                            image.uploadStatus === 'deleting' && 'text-slate-500',
                            image.uploadStatus === 'error' && 'text-red-600',
                          )}
                        >
                          {image.uploadStatus === 'uploaded' && 'Uploaded'}
                          {image.uploadStatus === 'uploading' && 'Uploading...'}
                          {image.uploadStatus === 'deleting' && 'Deleting...'}
                          {image.uploadStatus === 'error' && 'Upload failed'}
                        </span>

                        <button
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-red-600 disabled:cursor-not-allowed disabled:text-slate-300"
                          disabled={isBusy}
                          onClick={() => void handleDeleteImage(image.id)}
                          type="button"
                        >
                          <Trash2 className="h-3 w-3" />
                          Delete
                        </button>
                      </div>

                      {image.uploadError ? (
                        <p className="mt-2 text-[11px] leading-4 text-red-600">
                          {image.uploadError}
                        </p>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>

          </div>
        ) : null}
      </div>

      {/* Floating selection bar */}
      {selectedIds.size > 0 ? (
        <div className="pointer-events-none fixed bottom-6 left-0 right-0 z-50 flex justify-center px-4">
          <div className="pointer-events-auto flex items-center gap-3 rounded-2xl bg-slate-950 px-5 py-3 shadow-2xl">
            <span className="text-sm font-medium text-white">
              {selectedIds.size} photo{selectedIds.size !== 1 ? 's' : ''} selected
            </span>
            <div className="h-4 w-px bg-white/20" />
            <button
              className="rounded-xl bg-white px-4 py-1.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-white/90"
              onClick={() => {
                setTagPlaceName('')
                setIsTagModalOpen(true)
              }}
              type="button"
            >
              Tag photos
            </button>
            <button
              className="text-sm font-medium text-white/60 transition-colors hover:text-white"
              onClick={() => setSelectedIds(new Set())}
              type="button"
            >
              Clear
            </button>
          </div>
        </div>
      ) : null}

      {/* Tag place name modal */}
      <Dialog
        open={isTagModalOpen}
        onOpenChange={(open) => {
          if (!open) setIsTagModalOpen(false)
        }}
      >
        <DialogContent className="rounded-3xl p-0 sm:max-w-md">
          <div className="space-y-6 p-6">
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold">
                Tag {selectedIds.size} photo{selectedIds.size !== 1 ? 's' : ''}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground" htmlFor="place-name-input">
                Name of place
              </label>
              <input
                autoFocus
                className="h-14 w-full rounded-2xl border border-border/70 bg-white px-5 text-base text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-950"
                id="place-name-input"
                onChange={(e) => setTagPlaceName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleTagImages()
                }}
                placeholder="e.g. Makati City"
                type="text"
                value={tagPlaceName}
              />
            </div>
            <div className="flex gap-3">
              <button
                className="flex-1 rounded-2xl border border-border/70 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted/30"
                onClick={() => setIsTagModalOpen(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="flex-1 rounded-2xl bg-slate-950 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400"
                disabled={!tagPlaceName.trim()}
                onClick={() => handleTagImages()}
                type="button"
              >
                Save
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  )
}
