'use client'

import { useEffect, useRef, useState } from 'react'
import * as exifr from 'exifr'
import { MapPin, Upload, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
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

type UploadedImage = {
  id: string
  previewUrl: string
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
  return `${Math.abs(value).toFixed(6)}Â° ${direction}`
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
    id: `${file.name}-${file.lastModified}-${file.size}`,
    previewUrl,
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
  }
}

export default function Home() {
  const [selectedName, setSelectedName] = useState('')
  const [submittedName, setSubmittedName] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([])
  const [analysisError, setAnalysisError] = useState('')
  const [selectedImage, setSelectedImage] = useState<UploadedImage | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const previewUrlsRef = useRef<string[]>([])

  useEffect(() => {
    return () => {
      previewUrlsRef.current.forEach((previewUrl) => {
        URL.revokeObjectURL(previewUrl)
      })
    }
  }, [])

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!selectedName) {
      return
    }

    setSubmittedName(selectedName)
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
      const analyzedFiles = await Promise.all(files.map((file) => analyzeImage(file)))

      setUploadedImages((currentImages) => {
        const existing = new Set(currentImages.map((image) => image.id))
        const nextImages = analyzedFiles.filter((image) => !existing.has(image.id))

        previewUrlsRef.current.push(...nextImages.map((image) => image.previewUrl))

        return [...currentImages, ...nextImages]
      })
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
            {' Â· '}
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
              or click to browse â€” JPG, HEIC, PNG supported
            </p>
          </div>
        </label>

        {isAnalyzing ? (
          <p className="text-center text-sm text-muted-foreground">Reading photosâ€¦</p>
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
                {uploadedImages.length} photo{uploadedImages.length !== 1 ? 's' : ''} ready
                {photosWithLocation > 0 ? ` Â· ${photosWithLocation} with GPS` : ''}
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

                return (
                  <button
                    key={image.id}
                    className="group relative overflow-hidden rounded-2xl border border-border/60 bg-white shadow-sm text-left transition-all hover:shadow-md active:scale-[0.98]"
                    onClick={() => setSelectedImage(image)}
                    type="button"
                  >
                    <img
                      alt={image.metadata.fileName}
                      className="aspect-square w-full object-cover"
                      src={image.previewUrl}
                    />
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
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Image metadata modal */}
            <Dialog open={selectedImage !== null} onOpenChange={(open) => { if (!open) setSelectedImage(null) }}>
              <DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl p-0 sm:max-w-lg">
                {selectedImage ? (
                  <>
                    <div className="relative">
                      <img
                        alt={selectedImage.metadata.fileName}
                        className="aspect-video w-full rounded-t-3xl object-cover"
                        src={selectedImage.previewUrl}
                      />
                    </div>

                    <div className="space-y-5 p-6">
                      <DialogHeader>
                        <DialogTitle className="break-all text-base font-semibold">
                          {selectedImage.metadata.fileName}
                        </DialogTitle>
                      </DialogHeader>

                      <div className="grid grid-cols-2 gap-3 text-sm">
                        {([
                          ['File size', formatBytes(selectedImage.metadata.fileSize)],
                          ['File type', selectedImage.metadata.fileType || 'Unknown'],
                          ['Dimensions',
                            selectedImage.metadata.width && selectedImage.metadata.height
                              ? `${selectedImage.metadata.width} × ${selectedImage.metadata.height}`
                              : 'Unknown'],
                          ['Captured', selectedImage.metadata.captureDate
                            ? new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(selectedImage.metadata.captureDate))
                            : 'Unknown'],
                          ['Device', [selectedImage.metadata.deviceMake, selectedImage.metadata.deviceModel].filter(Boolean).join(' ') || 'Unknown'],
                          ['Lens', selectedImage.metadata.lensModel || 'Unknown'],
                          ['Aperture', selectedImage.metadata.aperture ? `f/${selectedImage.metadata.aperture}` : 'Unknown'],
                          ['Exposure', selectedImage.metadata.exposureTime || 'Unknown'],
                          ['ISO', selectedImage.metadata.iso ? String(selectedImage.metadata.iso) : 'Unknown'],
                          ['Focal length', selectedImage.metadata.focalLength ? `${selectedImage.metadata.focalLength}mm` : 'Unknown'],
                          ['Altitude', selectedImage.metadata.altitude ? `${selectedImage.metadata.altitude.toFixed(1)}m` : 'Unknown'],
                          ['Latitude',
                            selectedImage.metadata.latitude != null
                              ? `${Math.abs(selectedImage.metadata.latitude).toFixed(6)}° ${selectedImage.metadata.latitude >= 0 ? 'N' : 'S'}`
                              : 'No GPS'],
                          ['Longitude',
                            selectedImage.metadata.longitude != null
                              ? `${Math.abs(selectedImage.metadata.longitude).toFixed(6)}° ${selectedImage.metadata.longitude >= 0 ? 'E' : 'W'}`
                              : 'No GPS'],
                        ] as [string, string][]).map(([label, value]) => (
                          <div key={label} className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5">
                            <p className="text-xs text-muted-foreground">{label}</p>
                            <p className="mt-0.5 text-xs font-medium text-foreground break-words">{value}</p>
                          </div>
                        ))}
                      </div>

                      {selectedImage.metadata.latitude != null && selectedImage.metadata.longitude != null ? (
                        <a
                          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 py-3 text-sm font-medium text-emerald-700 hover:bg-emerald-100 transition-colors"
                          href={`https://maps.google.com/?q=${selectedImage.metadata.latitude},${selectedImage.metadata.longitude}`}
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          <MapPin className="h-4 w-4" />
                          View on Google Maps
                        </a>
                      ) : null}
                    </div>
                  </>
                ) : null}
              </DialogContent>
            </Dialog>
          </div>
        ) : null}
      </div>
    </main>
  )
}
