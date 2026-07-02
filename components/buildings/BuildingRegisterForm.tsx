'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Building2,
  Camera,
  CameraOff,
  Check,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  List,
  Loader2,
  MapPin,
  Plus,
  Trash2,
  X,
} from 'lucide-react'

import type { Building, BuildingListing } from '@/lib/types/buildings'
import { MAX_BUILDING_REFERENCE_PHOTOS } from '@/lib/types/buildings'
import {
  assertBuildingPhotoBatchFits,
  isBuildingImageFile,
  prepareBuildingPhotoForUpload,
} from '@/lib/client/building-photo-utils'
import { requestCurrentLocationWithAddress } from '@/lib/client/geolocation'

type ListingDraft = {
  title: string
  price: string
  beds: string
  baths: string
  description: string
}

type PhotoDraft = {
  id: string
  file: File
  preview: string
}

type RegisterStep = 1 | 2 | 3 | 4

const REGISTER_STEPS = [
  { id: 1 as RegisterStep, label: 'Photos', description: 'Reference angles' },
  { id: 2 as RegisterStep, label: 'Details', description: 'Name & location' },
  { id: 3 as RegisterStep, label: 'Listings', description: 'Optional units' },
  { id: 4 as RegisterStep, label: 'Review', description: 'Confirm & save' },
]

const EMPTY_LISTING: ListingDraft = {
  title: '',
  price: '',
  beds: '',
  baths: '',
  description: '',
}

function createPhotoId() {
  return `photo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

type BuildingRegisterFormProps = {
  onRegistered?: (building: Building) => void
}

export default function BuildingRegisterForm({ onRegistered }: BuildingRegisterFormProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const photosRef = useRef<PhotoDraft[]>([])

  const [step, setStep] = useState<RegisterStep>(1)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [fullAddress, setFullAddress] = useState('')
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [listings, setListings] = useState<ListingDraft[]>([{ ...EMPTY_LISTING }])
  const [photos, setPhotos] = useState<PhotoDraft[]>([])
  const [activePhotoId, setActivePhotoId] = useState<string | null>(null)
  const [cameraActive, setCameraActive] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isProcessingPhotos, setIsProcessingPhotos] = useState(false)
  const [isLocating, setIsLocating] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  photosRef.current = photos

  const activePhoto = photos.find((photo) => photo.id === activePhotoId) ?? photos[photos.length - 1] ?? null
  const listingCount = listings.filter((entry) => entry.title.trim()).length

  const revokePhotoPreview = useCallback((preview: string) => {
    if (preview.startsWith('blob:')) {
      URL.revokeObjectURL(preview)
    }
  }, [])

  const releaseCamera = useCallback(() => {
    const stream = streamRef.current
    if (stream) {
      for (const track of stream.getTracks()) track.stop()
      streamRef.current = null
    }
    const video = videoRef.current
    if (video) video.srcObject = null
    setCameraActive(false)
  }, [])

  useEffect(() => () => {
    releaseCamera()
    for (const photo of photosRef.current) {
      revokePhotoPreview(photo.preview)
    }
  }, [releaseCamera, revokePhotoPreview])

  useEffect(() => {
    if (step !== 1) releaseCamera()
  }, [step, releaseCamera])

  const addPhotosFromFiles = useCallback(
    async (files: FileList | File[]) => {
      const incoming = Array.from(files).filter(isBuildingImageFile)
      if (incoming.length === 0) {
        setError('Please choose a photo (JPG, PNG, or HEIC).')
        return
      }

      setIsProcessingPhotos(true)
      setError('')

      try {
        const prepared = await Promise.all(incoming.map((file) => prepareBuildingPhotoForUpload(file)))

        setPhotos((current) => {
          const remaining = MAX_BUILDING_REFERENCE_PHOTOS - current.length
          if (remaining <= 0) {
            setError(`You can add up to ${MAX_BUILDING_REFERENCE_PHOTOS} photos per building.`)
            return current
          }

          const accepted = prepared.slice(0, remaining)
          if (accepted.length < prepared.length) {
            setError(`Only ${remaining} more photo${remaining === 1 ? '' : 's'} can be added.`)
          }

          const nextPhotos = accepted.map((file) => ({
            id: createPhotoId(),
            file,
            preview: URL.createObjectURL(file),
          }))

          const merged = [...current, ...nextPhotos]
          setActivePhotoId(nextPhotos[nextPhotos.length - 1]?.id ?? merged[merged.length - 1]?.id ?? null)
          return merged
        })
      } catch (photoError) {
        setError(photoError instanceof Error ? photoError.message : 'Unable to prepare photo for upload.')
      } finally {
        setIsProcessingPhotos(false)
      }
    },
    [],
  )

  const removePhoto = useCallback(
    (photoId: string) => {
      setPhotos((current) => {
        const target = current.find((photo) => photo.id === photoId)
        if (target) revokePhotoPreview(target.preview)
        const next = current.filter((photo) => photo.id !== photoId)
        setActivePhotoId((activeId) => {
          if (activeId === photoId) return next[next.length - 1]?.id ?? null
          return activeId
        })
        return next
      })
      setError('')
    },
    [revokePhotoPreview],
  )

  const clearPhotos = useCallback(() => {
    setPhotos((current) => {
      for (const photo of current) revokePhotoPreview(photo.preview)
      return []
    })
    setActivePhotoId(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [revokePhotoPreview])

  const startCamera = useCallback(async () => {
    setError('')
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
      if (!video) throw new Error('Camera preview is not ready.')
      video.srcObject = stream
      await video.play()
      setCameraActive(true)
    } catch (cameraError) {
      releaseCamera()
      setError(cameraError instanceof Error ? cameraError.message : 'Unable to access camera.')
    }
  }, [releaseCamera])

  const capturePhoto = useCallback(async () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.videoWidth === 0) return

    if (photos.length >= MAX_BUILDING_REFERENCE_PHOTOS) {
      setError(`You can add up to ${MAX_BUILDING_REFERENCE_PHOTOS} photos per building.`)
      return
    }

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const context = canvas.getContext('2d')
    if (!context) return

    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((value) => resolve(value), 'image/jpeg', 0.9)
    })
    if (!blob) return

    const file = new File([blob], `building-angle-${photos.length + 1}.jpg`, { type: 'image/jpeg' })
    void addPhotosFromFiles([file])
  }, [addPhotosFromFiles, photos.length])

  function updateListing(index: number, field: keyof ListingDraft, value: string) {
    setListings((current) =>
      current.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, [field]: value } : entry,
      ),
    )
  }

  function addListing() {
    setListings((current) => [...current, { ...EMPTY_LISTING }])
  }

  function removeListing(index: number) {
    setListings((current) => (current.length === 1 ? current : current.filter((_, i) => i !== index)))
  }

  async function useCurrentLocation() {
    setIsLocating(true)
    setError('')
    try {
      const position = await requestCurrentLocationWithAddress()
      setLatitude(position.latitude.toFixed(6))
      setLongitude(position.longitude.toFixed(6))
      setFullAddress(position.fullAddress)
    } catch (locationError) {
      setError(locationError instanceof Error ? locationError.message : 'Unable to read your current location.')
    } finally {
      setIsLocating(false)
    }
  }

  function validateStep(targetStep: RegisterStep) {
    if (targetStep >= 2 && photos.length === 0) {
      setError('Add at least one reference photo before continuing.')
      return false
    }
    if (targetStep >= 3 && !name.trim()) {
      setError('Building name is required before continuing.')
      return false
    }
    return true
  }

  function goToStep(targetStep: RegisterStep) {
    if (targetStep > step) {
      for (let check = (step + 1) as RegisterStep; check <= targetStep; check = (check + 1) as RegisterStep) {
        if (!validateStep(check)) return
      }
    }
    setError('')
    setStep(targetStep)
  }

  function goNext() {
    if (step >= 4) return
    goToStep((step + 1) as RegisterStep)
  }

  function goBack() {
    if (step <= 1) return
    setError('')
    setStep((step - 1) as RegisterStep)
  }

  function resetForm() {
    setStep(1)
    setName('')
    setDescription('')
    setFullAddress('')
    setLatitude('')
    setLongitude('')
    setListings([{ ...EMPTY_LISTING }])
    clearPhotos()
    releaseCamera()
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSuccess('')

    if (!validateStep(4)) return

    const listingPayload: BuildingListing[] = listings
      .map((entry) => ({
        title: entry.title.trim(),
        price: entry.price.trim() || null,
        beds: entry.beds.trim() ? Number.parseInt(entry.beds, 10) : null,
        baths: entry.baths.trim() ? Number.parseInt(entry.baths, 10) : null,
        description: entry.description.trim() || null,
      }))
      .filter((entry) => entry.title)

    setIsSubmitting(true)
    try {
      const uploadFiles = await Promise.all(photos.map((photo) => prepareBuildingPhotoForUpload(photo.file)))
      assertBuildingPhotoBatchFits(uploadFiles)

      const formData = new FormData()
      for (const file of uploadFiles) {
        formData.append('files', file)
      }
      formData.append('name', name.trim())
      formData.append('description', description.trim())
      formData.append('fullAddress', fullAddress.trim())
      formData.append('latitude', latitude.trim())
      formData.append('longitude', longitude.trim())
      formData.append('listings', JSON.stringify(listingPayload))

      const response = await fetch('/api/buildings', {
        method: 'POST',
        body: formData,
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        const fallback =
          response.status === 413
            ? 'Upload too large. Use fewer photos or the Camera button on iPhone.'
            : 'Unable to register building.'
        throw new Error(
          data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
            ? data.error
            : fallback,
        )
      }

      const building =
        data && typeof data === 'object' && 'building' in data ? (data.building as Building) : null
      if (!building) throw new Error('Building was saved but the response was invalid.')

      const photoCount = building.reference_photo_count || photos.length
      setSuccess(
        `Registered “${building.name}” with ${photoCount} reference photo${photoCount === 1 ? '' : 's'}. Try scanning it on the Scan tab.`,
      )
      onRegistered?.(building)
      resetForm()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to register building.')
    } finally {
      setIsSubmitting(false)
    }
  }

  function renderPhotoSection() {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-[#10233f]">Add reference photos</h2>
          <p className="mt-1 text-sm text-slate-500">
            Upload or capture multiple angles — front, side, entrance — for better scan matches.
          </p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-950">
          <div className="relative aspect-[4/3] bg-slate-900">
            {cameraActive ? (
              <video autoPlay className="h-full w-full object-cover" muted playsInline ref={videoRef} />
            ) : activePhoto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt="Selected building angle"
                className="h-full w-full object-cover"
                src={activePhoto.preview}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center px-4 text-center text-slate-400">
                <ImagePlus className="mb-3 h-10 w-10" />
                <p className="text-sm font-medium text-slate-200">No photos yet</p>
                <p className="mt-1 text-xs text-slate-500">Use Upload or Camera below</p>
              </div>
            )}
            {photos.length > 0 ? (
              <span className="absolute right-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-semibold text-white">
                {photos.length}/{MAX_BUILDING_REFERENCE_PHOTOS}
              </span>
            ) : null}
          </div>
          <canvas className="hidden" ref={canvasRef} />
          <div className="grid grid-cols-2 gap-2 border-t border-white/10 bg-slate-900 p-3 sm:flex sm:flex-wrap">
            <button
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-[#10233f] disabled:opacity-50 sm:inline-flex sm:min-h-9 sm:w-auto sm:text-xs"
              disabled={photos.length >= MAX_BUILDING_REFERENCE_PHOTOS || isProcessingPhotos}
              onClick={() => fileInputRef.current?.click()}
              type="button"
            >
              {isProcessingPhotos ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
              {isProcessingPhotos ? 'Preparing…' : 'Upload'}
            </button>
            {!cameraActive ? (
              <button
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50 sm:inline-flex sm:min-h-9 sm:w-auto sm:text-xs"
                disabled={photos.length >= MAX_BUILDING_REFERENCE_PHOTOS}
                onClick={() => void startCamera()}
                type="button"
              >
                <Camera className="h-4 w-4" />
                Camera
              </button>
            ) : (
              <>
                <button
                  className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm font-semibold text-white sm:inline-flex sm:min-h-9 sm:w-auto sm:text-xs"
                  onClick={() => void capturePhoto()}
                  type="button"
                >
                  Add angle
                </button>
                <button
                  className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm font-semibold text-slate-300 sm:inline-flex sm:min-h-9 sm:w-auto sm:text-xs"
                  onClick={releaseCamera}
                  type="button"
                >
                  <CameraOff className="h-4 w-4" />
                  Stop
                </button>
              </>
            )}
            {photos.length > 0 ? (
              <button
                className="col-span-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm font-semibold text-red-200 sm:col-span-1 sm:inline-flex sm:min-h-9 sm:w-auto sm:text-xs"
                onClick={clearPhotos}
                type="button"
              >
                <Trash2 className="h-4 w-4" />
                Clear all
              </button>
            ) : null}
          </div>
        </div>

        <input
          accept="image/*,.heic,.heif"
          className="hidden"
          multiple
          onChange={(event) => {
            const fileList = event.target.files
            if (fileList?.length) void addPhotosFromFiles(fileList)
            if (fileInputRef.current) fileInputRef.current.value = ''
          }}
          ref={fileInputRef}
          type="file"
        />

        {photos.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Added angles</p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {photos.map((photo, index) => (
                <div className="group relative overflow-hidden rounded-xl border border-slate-200 bg-slate-100" key={photo.id}>
                  <button
                    className={`block w-full ${activePhotoId === photo.id ? 'ring-2 ring-[#10233f]' : ''}`}
                    onClick={() => setActivePhotoId(photo.id)}
                    type="button"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img alt={`Angle ${index + 1}`} className="aspect-square w-full object-cover" src={photo.preview} />
                  </button>
                  <button
                    aria-label={`Remove angle ${index + 1}`}
                    className="absolute right-1 top-1 rounded-full bg-black/65 p-1 text-white"
                    onClick={() => removePhoto(photo.id)}
                    type="button"
                  >
                    <X className="h-3 w-3" />
                  </button>
                  <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    {index + 1}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    )
  }

  function renderDetailsSection() {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-[#10233f]">Building details</h2>
          <p className="mt-1 text-sm text-slate-500">Name the building and add its location for better scan accuracy.</p>
        </div>

        <div className="grid gap-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-[#10233f]">Building name</span>
            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-3 text-base outline-none ring-[#10233f]/20 focus:ring-2 sm:py-2.5 sm:text-sm"
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Azure Residences Tower A"
              value={name}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-[#10233f]">Description</span>
            <textarea
              className="min-h-24 w-full rounded-xl border border-slate-200 px-3 py-3 text-base outline-none ring-[#10233f]/20 focus:ring-2 sm:py-2.5 sm:text-sm"
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Short notes about the building"
              value={description}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-[#10233f]">Address</span>
            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-3 text-base outline-none ring-[#10233f]/20 focus:ring-2 sm:py-2.5 sm:text-sm"
              onChange={(event) => setFullAddress(event.target.value)}
              placeholder="Street, city, province"
              value={fullAddress}
            />
          </label>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-[#10233f]">Latitude</span>
              <input
                className="w-full rounded-xl border border-slate-200 px-3 py-3 text-base outline-none ring-[#10233f]/20 focus:ring-2 sm:py-2.5 sm:text-sm"
                onChange={(event) => setLatitude(event.target.value)}
                inputMode="decimal"
                placeholder="10.3157"
                value={latitude}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-[#10233f]">Longitude</span>
              <input
                className="w-full rounded-xl border border-slate-200 px-3 py-3 text-base outline-none ring-[#10233f]/20 focus:ring-2 sm:py-2.5 sm:text-sm"
                onChange={(event) => setLongitude(event.target.value)}
                inputMode="decimal"
                placeholder="123.8854"
                value={longitude}
              />
            </label>
          </div>
        </div>

        <button
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-[#10233f] transition hover:bg-slate-50 disabled:opacity-60 sm:inline-flex sm:min-h-10 sm:w-auto"
          disabled={isLocating}
          onClick={() => void useCurrentLocation()}
          type="button"
        >
          {isLocating ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
          {isLocating ? 'Getting location…' : 'Use current location'}
        </button>
      </div>
    )
  }

  function renderListingsSection() {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-[#10233f]">Listings</h2>
          <p className="mt-1 text-sm text-slate-500">Optional — add units or properties inside this building.</p>
        </div>

        <div className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-500">You can skip this step if there are no listings yet.</p>
            <button
              className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-[#10233f] transition hover:bg-slate-50 sm:inline-flex sm:min-h-9 sm:w-auto sm:rounded-lg sm:px-2 sm:py-1 sm:text-xs"
              onClick={addListing}
              type="button"
            >
              <Plus className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
              Add listing
            </button>
          </div>
          {listings.map((listing, index) => (
            <div className="rounded-2xl border border-slate-200/80 bg-slate-50 p-3 sm:p-4" key={`listing-${index}`}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Listing {index + 1}
                </p>
                {listings.length > 1 ? (
                  <button
                    className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs text-red-600"
                    onClick={() => removeListing(index)}
                    type="button"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove
                  </button>
                ) : null}
              </div>
              <div className="grid gap-3">
                <input
                  className="w-full rounded-xl border border-slate-200 px-3 py-3 text-base outline-none ring-[#10233f]/20 focus:ring-2 sm:py-2 sm:text-sm"
                  onChange={(event) => updateListing(index, 'title', event.target.value)}
                  placeholder="Title (e.g. Unit 1204)"
                  value={listing.title}
                />
                <input
                  className="w-full rounded-xl border border-slate-200 px-3 py-3 text-base outline-none ring-[#10233f]/20 focus:ring-2 sm:py-2 sm:text-sm"
                  onChange={(event) => updateListing(index, 'price', event.target.value)}
                  placeholder="Price"
                  value={listing.price}
                />
                <div className="grid grid-cols-2 gap-3">
                  <input
                    className="w-full rounded-xl border border-slate-200 px-3 py-3 text-base outline-none ring-[#10233f]/20 focus:ring-2 sm:py-2 sm:text-sm"
                    onChange={(event) => updateListing(index, 'beds', event.target.value)}
                    inputMode="numeric"
                    placeholder="Beds"
                    value={listing.beds}
                  />
                  <input
                    className="w-full rounded-xl border border-slate-200 px-3 py-3 text-base outline-none ring-[#10233f]/20 focus:ring-2 sm:py-2 sm:text-sm"
                    onChange={(event) => updateListing(index, 'baths', event.target.value)}
                    inputMode="numeric"
                    placeholder="Baths"
                    value={listing.baths}
                  />
                </div>
                <textarea
                  className="min-h-24 w-full rounded-xl border border-slate-200 px-3 py-3 text-base outline-none ring-[#10233f]/20 focus:ring-2 sm:py-2 sm:text-sm"
                  onChange={(event) => updateListing(index, 'description', event.target.value)}
                  placeholder="Listing details"
                  value={listing.description}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  function renderReviewSection() {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-[#10233f]">Review & register</h2>
          <p className="mt-1 text-sm text-slate-500">Confirm everything looks correct before saving.</p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-slate-50 p-3 space-y-4 sm:p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
            {activePhoto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt={name || 'Building preview'}
                className="h-40 w-full rounded-xl object-cover sm:h-20 sm:w-20 sm:shrink-0"
                src={activePhoto.preview}
              />
            ) : (
              <div className="flex h-40 w-full items-center justify-center rounded-xl bg-slate-200 text-slate-400 sm:h-20 sm:w-20 sm:shrink-0">
                <Building2 className="h-8 w-8" />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-base font-semibold text-[#10233f]">{name || 'Unnamed building'}</p>
              {fullAddress ? <p className="mt-1 text-sm text-slate-600 break-words">{fullAddress}</p> : null}
              {latitude && longitude ? (
                <p className="mt-1 text-xs text-slate-400 break-all">
                  {latitude}, {longitude}
                </p>
              ) : null}
            </div>
          </div>

          <dl className="grid grid-cols-3 gap-2 text-sm sm:gap-3">
            <div className="rounded-xl bg-white px-3 py-2.5">
              <dt className="text-xs text-slate-500">Photos</dt>
              <dd className="font-semibold text-[#10233f]">{photos.length}</dd>
            </div>
            <div className="rounded-xl bg-white px-3 py-2.5">
              <dt className="text-xs text-slate-500">Listings</dt>
              <dd className="font-semibold text-[#10233f]">{listingCount}</dd>
            </div>
            <div className="rounded-xl bg-white px-3 py-2.5 sm:col-span-1">
              <dt className="text-xs text-slate-500">GPS</dt>
              <dd className="font-semibold text-[#10233f]">{latitude && longitude ? 'Set' : 'Not set'}</dd>
            </div>
          </dl>

          {description ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Description</p>
              <p className="mt-1 text-sm text-slate-600">{description}</p>
            </div>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <form className="space-y-5 pb-6 sm:space-y-6" onSubmit={(event) => void handleSubmit(event)}>
      <div className="rounded-2xl border border-slate-200/80 bg-slate-50 p-3 sm:p-4">
        <div className="mb-3 flex items-center justify-between gap-2 text-xs text-slate-500 sm:mb-4">
          <span>Step {step} of {REGISTER_STEPS.length}</span>
          <span className="font-medium text-[#10233f]">{REGISTER_STEPS[step - 1]?.label}</span>
        </div>
        <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-slate-200 sm:mb-4">
          <div
            className="h-full rounded-full bg-[#10233f] transition-all duration-300"
            style={{ width: `${(step / REGISTER_STEPS.length) * 100}%` }}
          />
        </div>
        <ol className="grid grid-cols-4 gap-1 sm:gap-2">
          {REGISTER_STEPS.map((item) => {
            const isActive = item.id === step
            const isCompleted = item.id < step
            return (
              <li key={item.id}>
                <button
                  className="flex w-full flex-col items-center gap-1 text-center sm:gap-1.5"
                  onClick={() => goToStep(item.id)}
                  type="button"
                >
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-[11px] font-bold transition sm:h-9 sm:w-9 sm:text-xs ${
                      isCompleted
                        ? 'border-[#10233f] bg-[#10233f] text-white'
                        : isActive
                          ? 'border-[#10233f] bg-white text-[#10233f] shadow-sm'
                          : 'border-slate-200 bg-white text-slate-400'
                    }`}
                  >
                    {isCompleted ? <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> : item.id}
                  </span>
                  <span
                    className={`hidden text-[10px] font-semibold leading-tight sm:block sm:text-xs ${
                      isActive ? 'text-[#10233f]' : isCompleted ? 'text-slate-600' : 'text-slate-400'
                    }`}
                  >
                    {item.label}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      </div>

      {step === 1 ? renderPhotoSection() : null}
      {step === 2 ? renderDetailsSection() : null}
      {step === 3 ? renderListingsSection() : null}
      {step === 4 ? renderReviewSection() : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {success ? <p className="text-sm text-emerald-700">{success}</p> : null}

      <div className="sticky bottom-0 z-10 -mx-4 border-t border-slate-200 bg-white/95 px-4 py-4 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-[#10233f] transition hover:bg-slate-50 disabled:opacity-40 sm:w-auto"
            disabled={step === 1 || isSubmitting}
            onClick={goBack}
            type="button"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>

          {step < 4 ? (
            <button
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#10233f] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0d1c33] disabled:opacity-60 sm:w-auto"
              disabled={isProcessingPhotos}
              onClick={goNext}
              type="button"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#10233f] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0d1c33] disabled:opacity-60 sm:w-auto"
              disabled={isSubmitting || isProcessingPhotos}
              type="submit"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <List className="h-4 w-4" />}
              {isSubmitting
                ? `Registering ${photos.length} photo${photos.length === 1 ? '' : 's'}…`
                : 'Register building'}
            </button>
          )}
        </div>
      </div>

      {isSubmitting ? (
        <p className="text-sm text-slate-500">
          Saving photos, generating AI embeddings for each angle, and storing building details.
        </p>
      ) : null}
    </form>
  )
}
