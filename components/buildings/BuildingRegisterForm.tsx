'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, CameraOff, ImagePlus, Loader2, MapPin, Plus, Trash2, X } from 'lucide-react'

import type { Building, BuildingListing } from '@/lib/types/buildings'
import { MAX_BUILDING_REFERENCE_PHOTOS } from '@/lib/types/buildings'

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
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  photosRef.current = photos

  const activePhoto = photos.find((photo) => photo.id === activePhotoId) ?? photos[photos.length - 1] ?? null

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

  const addPhotosFromFiles = useCallback(
    (files: FileList | File[]) => {
      const incoming = Array.from(files).filter((file) => file.type.startsWith('image/'))
      if (incoming.length === 0) return

      setPhotos((current) => {
        const remaining = MAX_BUILDING_REFERENCE_PHOTOS - current.length
        if (remaining <= 0) {
          setError(`You can add up to ${MAX_BUILDING_REFERENCE_PHOTOS} photos per building.`)
          return current
        }

        const accepted = incoming.slice(0, remaining)
        if (accepted.length < incoming.length) {
          setError(`Only ${remaining} more photo${remaining === 1 ? '' : 's'} can be added.`)
        } else {
          setError('')
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
    addPhotosFromFiles([file])
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

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported in this browser.')
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude.toFixed(6))
        setLongitude(position.coords.longitude.toFixed(6))
        setError('')
      },
      () => {
        setError('Unable to read your current location.')
      },
      { enableHighAccuracy: true, timeout: 15000 },
    )
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSuccess('')

    if (!name.trim()) {
      setError('Building name is required.')
      return
    }
    if (photos.length === 0) {
      setError('Add at least one reference photo from different angles.')
      return
    }

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
      const formData = new FormData()
      for (const photo of photos) {
        formData.append('files', photo.file)
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
        throw new Error(
          data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
            ? data.error
            : 'Unable to register building.',
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

      setName('')
      setDescription('')
      setFullAddress('')
      setLatitude('')
      setLongitude('')
      setListings([{ ...EMPTY_LISTING }])
      clearPhotos()
      releaseCamera()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to register building.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form className="space-y-6" onSubmit={(event) => void handleSubmit(event)}>
      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <div className="space-y-4">
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
                  <p className="text-sm font-medium text-slate-200">Reference photos</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Add multiple angles — front, side, entrance, signage — for better scan matches.
                  </p>
                </div>
              )}
              {photos.length > 0 ? (
                <span className="absolute right-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-semibold text-white">
                  {photos.length}/{MAX_BUILDING_REFERENCE_PHOTOS}
                </span>
              ) : null}
            </div>
            <canvas className="hidden" ref={canvasRef} />
            <div className="flex flex-wrap gap-2 border-t border-white/10 bg-slate-900 p-3">
              <button
                className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-[#10233f] disabled:opacity-50"
                disabled={photos.length >= MAX_BUILDING_REFERENCE_PHOTOS}
                onClick={() => fileInputRef.current?.click()}
                type="button"
              >
                <ImagePlus className="h-3.5 w-3.5" />
                Upload
              </button>
              {!cameraActive ? (
                <button
                  className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                  disabled={photos.length >= MAX_BUILDING_REFERENCE_PHOTOS}
                  onClick={() => void startCamera()}
                  type="button"
                >
                  <Camera className="h-3.5 w-3.5" />
                  Camera
                </button>
              ) : (
                <>
                  <button
                    className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-white"
                    onClick={() => void capturePhoto()}
                    type="button"
                  >
                    Add angle
                  </button>
                  <button
                    className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-slate-300"
                    onClick={releaseCamera}
                    type="button"
                  >
                    <CameraOff className="h-3.5 w-3.5" />
                    Stop
                  </button>
                </>
              )}
              {photos.length > 0 ? (
                <button
                  className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-red-200"
                  onClick={clearPhotos}
                  type="button"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Clear all
                </button>
              ) : null}
            </div>
          </div>

          <input
            accept="image/*"
            className="hidden"
            multiple
            onChange={(event) => {
              const fileList = event.target.files
              if (fileList?.length) addPhotosFromFiles(fileList)
              if (fileInputRef.current) fileInputRef.current.value = ''
            }}
            ref={fileInputRef}
            type="file"
          />

          {photos.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Added angles</p>
              <div className="grid grid-cols-3 gap-2">
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
                      className="absolute right-1 top-1 rounded-full bg-black/65 p-1 text-white opacity-0 transition group-hover:opacity-100"
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

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-sm font-medium text-[#10233f]">Building name</span>
              <input
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-[#10233f]/20 focus:ring-2"
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Azure Residences Tower A"
                value={name}
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-sm font-medium text-[#10233f]">Description</span>
              <textarea
                className="min-h-24 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-[#10233f]/20 focus:ring-2"
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Short notes about the building"
                value={description}
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-sm font-medium text-[#10233f]">Address</span>
              <input
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-[#10233f]/20 focus:ring-2"
                onChange={(event) => setFullAddress(event.target.value)}
                placeholder="Street, city, province"
                value={fullAddress}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-[#10233f]">Latitude</span>
              <input
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-[#10233f]/20 focus:ring-2"
                onChange={(event) => setLatitude(event.target.value)}
                placeholder="10.3157"
                value={latitude}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-[#10233f]">Longitude</span>
              <input
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-[#10233f]/20 focus:ring-2"
                onChange={(event) => setLongitude(event.target.value)}
                placeholder="123.8854"
                value={longitude}
              />
            </label>
          </div>

          <button
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-[#10233f] transition hover:bg-slate-50"
            onClick={useCurrentLocation}
            type="button"
          >
            <MapPin className="h-4 w-4" />
            Use current location
          </button>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#10233f]">Listings</h3>
              <button
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-[#10233f] hover:bg-slate-100"
                onClick={addListing}
                type="button"
              >
                <Plus className="h-3.5 w-3.5" />
                Add listing
              </button>
            </div>
            {listings.map((listing, index) => (
              <div className="rounded-2xl border border-slate-200/80 bg-slate-50 p-4" key={`listing-${index}`}>
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Listing {index + 1}
                  </p>
                  {listings.length > 1 ? (
                    <button
                      className="inline-flex items-center gap-1 text-xs text-red-600"
                      onClick={() => removeListing(index)}
                      type="button"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remove
                    </button>
                  ) : null}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm sm:col-span-2"
                    onChange={(event) => updateListing(index, 'title', event.target.value)}
                    placeholder="Title (e.g. Unit 1204)"
                    value={listing.title}
                  />
                  <input
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    onChange={(event) => updateListing(index, 'price', event.target.value)}
                    placeholder="Price"
                    value={listing.price}
                  />
                  <input
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    onChange={(event) => updateListing(index, 'beds', event.target.value)}
                    placeholder="Beds"
                    value={listing.beds}
                  />
                  <input
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    onChange={(event) => updateListing(index, 'baths', event.target.value)}
                    placeholder="Baths"
                    value={listing.baths}
                  />
                  <textarea
                    className="min-h-20 rounded-xl border border-slate-200 px-3 py-2 text-sm sm:col-span-2"
                    onChange={(event) => updateListing(index, 'description', event.target.value)}
                    placeholder="Listing details"
                    value={listing.description}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {success ? <p className="text-sm text-emerald-700">{success}</p> : null}

      <button
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#10233f] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0d1c33] disabled:opacity-60"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {isSubmitting
          ? `Registering ${photos.length} photo${photos.length === 1 ? '' : 's'}…`
          : `Register building${photos.length > 0 ? ` (${photos.length} photo${photos.length === 1 ? '' : 's'})` : ''}`}
      </button>
      {isSubmitting ? (
        <p className="text-sm text-slate-500">
          Saving photos, generating AI embeddings for each angle, and storing building details.
        </p>
      ) : null}
    </form>
  )
}
