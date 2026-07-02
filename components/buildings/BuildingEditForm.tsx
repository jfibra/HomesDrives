'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Camera, CameraOff, ImagePlus, Loader2, MapPin, Plus, Trash2, X } from 'lucide-react'

import type { BuildingListing, BuildingReferencePhoto, BuildingWithPhotos } from '@/lib/types/buildings'
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

type NewPhotoDraft = {
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

function listingsToDrafts(listings: BuildingListing[]): ListingDraft[] {
  if (listings.length === 0) return [{ ...EMPTY_LISTING }]
  return listings.map((listing) => ({
    title: listing.title,
    price: listing.price ?? '',
    beds: listing.beds != null ? String(listing.beds) : '',
    baths: listing.baths != null ? String(listing.baths) : '',
    description: listing.description ?? '',
  }))
}

type BuildingEditFormProps = {
  buildingId: string
  onCancel: () => void
  onSaved?: (building: BuildingWithPhotos) => void
}

export default function BuildingEditForm({ buildingId, onCancel, onSaved }: BuildingEditFormProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const newPhotosRef = useRef<NewPhotoDraft[]>([])

  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [fullAddress, setFullAddress] = useState('')
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [listings, setListings] = useState<ListingDraft[]>([{ ...EMPTY_LISTING }])
  const [existingPhotos, setExistingPhotos] = useState<BuildingReferencePhoto[]>([])
  const [removedPhotoIds, setRemovedPhotoIds] = useState<string[]>([])
  const [newPhotos, setNewPhotos] = useState<NewPhotoDraft[]>([])
  const [cameraActive, setCameraActive] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isProcessingPhotos, setIsProcessingPhotos] = useState(false)
  const [isLocating, setIsLocating] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  newPhotosRef.current = newPhotos

  const activeExistingCount = existingPhotos.filter((photo) => !removedPhotoIds.includes(photo.id)).length
  const totalPhotoCount = activeExistingCount + newPhotos.length
  const canAddMorePhotos = totalPhotoCount < MAX_BUILDING_REFERENCE_PHOTOS

  const revokePreview = useCallback((preview: string) => {
    if (preview.startsWith('blob:')) URL.revokeObjectURL(preview)
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
    for (const photo of newPhotosRef.current) revokePreview(photo.preview)
  }, [releaseCamera, revokePreview])

  useEffect(() => {
    let cancelled = false

    async function loadBuilding() {
      setLoading(true)
      setError('')
      try {
        const response = await fetch(`/api/buildings/${encodeURIComponent(buildingId)}`, {
          cache: 'no-store',
        })
        const data = await response.json().catch(() => null)
        if (!response.ok) {
          throw new Error(
            data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
              ? data.error
              : 'Unable to load building.',
          )
        }

        const building =
          data && typeof data === 'object' && 'building' in data
            ? (data.building as BuildingWithPhotos)
            : null
        if (!building) throw new Error('Building data is invalid.')

        if (cancelled) return

        setName(building.name)
        setDescription(building.description ?? '')
        setFullAddress(building.full_address ?? '')
        setLatitude(building.latitude != null ? String(building.latitude) : '')
        setLongitude(building.longitude != null ? String(building.longitude) : '')
        setListings(listingsToDrafts(building.listings))
        setExistingPhotos(building.reference_photos ?? [])
        setRemovedPhotoIds([])
        setNewPhotos([])
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load building.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadBuilding()
    return () => {
      cancelled = true
    }
  }, [buildingId])

  const addNewPhotosFromFiles = useCallback(
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

        setNewPhotos((current) => {
          const remaining = MAX_BUILDING_REFERENCE_PHOTOS - activeExistingCount - current.length
          if (remaining <= 0) {
            setError(`You can have up to ${MAX_BUILDING_REFERENCE_PHOTOS} photos per building.`)
            return current
          }

          const accepted = prepared.slice(0, remaining)
          if (accepted.length < prepared.length) {
            setError(`Only ${remaining} more photo${remaining === 1 ? '' : 's'} can be added.`)
          }

          return [
            ...current,
            ...accepted.map((file) => ({
              id: createPhotoId(),
              file,
              preview: URL.createObjectURL(file),
            })),
          ]
        })
      } catch (photoError) {
        setError(photoError instanceof Error ? photoError.message : 'Unable to prepare photo for upload.')
      } finally {
        setIsProcessingPhotos(false)
      }
    },
    [activeExistingCount],
  )

  const removeNewPhoto = useCallback(
    (photoId: string) => {
      setNewPhotos((current) => {
        const target = current.find((photo) => photo.id === photoId)
        if (target) revokePreview(target.preview)
        return current.filter((photo) => photo.id !== photoId)
      })
      setError('')
    },
    [revokePreview],
  )

  const toggleRemoveExistingPhoto = useCallback(
    (photoId: string) => {
      setRemovedPhotoIds((current) => {
        const isMarked = current.includes(photoId)
        if (isMarked) return current.filter((id) => id !== photoId)

        const nextRemovedCount = current.length + 1
        if (activeExistingCount - nextRemovedCount + newPhotos.length < 1) {
          setError('Each building must keep at least one reference photo.')
          return current
        }

        setError('')
        return [...current, photoId]
      })
    },
    [activeExistingCount, newPhotos.length],
  )

  const startCamera = useCallback(async () => {
    if (!canAddMorePhotos) {
      setError(`You can have up to ${MAX_BUILDING_REFERENCE_PHOTOS} photos per building.`)
      return
    }

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
  }, [canAddMorePhotos, releaseCamera])

  const capturePhoto = useCallback(async () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.videoWidth === 0) return

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const context = canvas.getContext('2d')
    if (!context) return

    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((value) => resolve(value), 'image/jpeg', 0.9)
    })
    if (!blob) return

    void addNewPhotosFromFiles([
      new File([blob], `building-angle-${totalPhotoCount + 1}.jpg`, { type: 'image/jpeg' }),
    ])
  }, [addNewPhotosFromFiles, totalPhotoCount])

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

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSuccess('')

    if (!name.trim()) {
      setError('Building name is required.')
      return
    }
    if (totalPhotoCount < 1) {
      setError('Each building must keep at least one reference photo.')
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

    setIsSaving(true)
    try {
      const uploadFiles =
        newPhotos.length > 0
          ? await Promise.all(newPhotos.map((photo) => prepareBuildingPhotoForUpload(photo.file)))
          : []
      if (uploadFiles.length > 0) assertBuildingPhotoBatchFits(uploadFiles)

      const formData = new FormData()
      formData.append('name', name.trim())
      formData.append('description', description.trim())
      formData.append('fullAddress', fullAddress.trim())
      formData.append('latitude', latitude.trim())
      formData.append('longitude', longitude.trim())
      formData.append('listings', JSON.stringify(listingPayload))
      formData.append('removePhotoIds', JSON.stringify(removedPhotoIds))
      for (const file of uploadFiles) {
        formData.append('files', file)
      }

      const response = await fetch(`/api/buildings/${encodeURIComponent(buildingId)}`, {
        method: 'PATCH',
        body: formData,
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        const fallback =
          response.status === 413
            ? 'Upload too large. Use fewer photos or the Camera button on iPhone.'
            : 'Unable to update building.'
        throw new Error(
          data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
            ? data.error
            : fallback,
        )
      }

      const building =
        data && typeof data === 'object' && 'building' in data
          ? (data.building as BuildingWithPhotos)
          : null
      if (!building) throw new Error('Building was saved but the response was invalid.')

      setSuccess(`Saved changes to “${building.name}”.`)
      setExistingPhotos(building.reference_photos ?? [])
      setRemovedPhotoIds([])
      setNewPhotos((current) => {
        for (const photo of current) revokePreview(photo.preview)
        return []
      })
      releaseCamera()
      onSaved?.(building)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to update building.')
    } finally {
      setIsSaving(false)
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Loading building…</p>
  }

  return (
    <form className="space-y-6" onSubmit={(event) => void handleSubmit(event)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <button
            className="mb-2 inline-flex items-center gap-2 text-sm font-medium text-[#10233f] hover:underline"
            onClick={onCancel}
            type="button"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to dataset
          </button>
          <h2 className="text-xl font-semibold text-[#10233f]">Edit building</h2>
          <p className="text-sm text-slate-500">Update details, listings, or reference photos.</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
          {totalPhotoCount}/{MAX_BUILDING_REFERENCE_PHOTOS} photos
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Saved angles</p>
            <div className="grid grid-cols-3 gap-2">
              {existingPhotos.map((photo, index) => {
                const marked = removedPhotoIds.includes(photo.id)
                return (
                  <div
                    className={`group relative overflow-hidden rounded-xl border bg-slate-100 ${
                      marked ? 'border-red-300 opacity-50' : 'border-slate-200'
                    }`}
                    key={photo.id}
                  >
                    {photo.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        alt={`Saved angle ${index + 1}`}
                        className="aspect-square w-full object-cover"
                        src={photo.image_url}
                      />
                    ) : (
                      <div className="flex aspect-square items-center justify-center text-slate-300">No image</div>
                    )}
                    <button
                      className={`absolute right-1 top-1 rounded-full p-1 text-white ${
                        marked ? 'bg-red-600' : 'bg-black/65 opacity-0 transition group-hover:opacity-100'
                      }`}
                      onClick={() => toggleRemoveExistingPhoto(photo.id)}
                      title={marked ? 'Undo remove' : 'Remove photo'}
                      type="button"
                    >
                      <X className="h-3 w-3" />
                    </button>
                    <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      {index + 1}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-950">
            <div className="relative aspect-[4/3] bg-slate-900">
              {cameraActive ? (
                <video autoPlay className="h-full w-full object-cover" muted playsInline ref={videoRef} />
              ) : (
                <div className="flex h-full flex-col items-center justify-center px-4 text-center text-slate-400">
                  <ImagePlus className="mb-3 h-10 w-10" />
                  <p className="text-sm font-medium text-slate-200">Add more angles</p>
                  <p className="mt-1 text-xs text-slate-500">Upload or capture additional reference photos.</p>
                </div>
              )}
            </div>
            <canvas className="hidden" ref={canvasRef} />
            <div className="grid grid-cols-2 gap-2 border-t border-white/10 bg-slate-900 p-3 sm:flex sm:flex-wrap">
              <button
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-[#10233f] disabled:opacity-50 sm:inline-flex sm:min-h-9 sm:w-auto sm:text-xs"
                disabled={!canAddMorePhotos || isProcessingPhotos}
                onClick={() => fileInputRef.current?.click()}
                type="button"
              >
                {isProcessingPhotos ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                {isProcessingPhotos ? 'Preparing…' : 'Upload'}
              </button>
              {!cameraActive ? (
                <button
                  className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50 sm:inline-flex sm:min-h-9 sm:w-auto sm:text-xs"
                  disabled={!canAddMorePhotos}
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
            </div>
          </div>

          <input
            accept="image/*,.heic,.heif"
            className="hidden"
            multiple
            onChange={(event) => {
              const fileList = event.target.files
              if (fileList?.length) void addNewPhotosFromFiles(fileList)
              if (fileInputRef.current) fileInputRef.current.value = ''
            }}
            ref={fileInputRef}
            type="file"
          />

          {newPhotos.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">New angles to add</p>
              <div className="grid grid-cols-3 gap-2">
                {newPhotos.map((photo, index) => (
                  <div className="group relative overflow-hidden rounded-xl border border-emerald-200 bg-slate-100" key={photo.id}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img alt={`New angle ${index + 1}`} className="aspect-square w-full object-cover" src={photo.preview} />
                    <button
                      className="absolute right-1 top-1 rounded-full bg-black/65 p-1 text-white"
                      onClick={() => removeNewPhoto(photo.id)}
                      type="button"
                    >
                      <X className="h-3 w-3" />
                    </button>
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
                value={name}
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-sm font-medium text-[#10233f]">Description</span>
              <textarea
                className="min-h-24 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-[#10233f]/20 focus:ring-2"
                onChange={(event) => setDescription(event.target.value)}
                value={description}
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-sm font-medium text-[#10233f]">Address</span>
              <input
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-[#10233f]/20 focus:ring-2"
                onChange={(event) => setFullAddress(event.target.value)}
                value={fullAddress}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-[#10233f]">Latitude</span>
              <input
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-[#10233f]/20 focus:ring-2"
                onChange={(event) => setLatitude(event.target.value)}
                value={latitude}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-[#10233f]">Longitude</span>
              <input
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-[#10233f]/20 focus:ring-2"
                onChange={(event) => setLongitude(event.target.value)}
                value={longitude}
              />
            </label>
          </div>

          <button
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-[#10233f] transition hover:bg-slate-50 disabled:opacity-60"
            disabled={isLocating}
            onClick={() => void useCurrentLocation()}
            type="button"
          >
            {isLocating ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
            {isLocating ? 'Getting location…' : 'Use current location'}
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
                    placeholder="Title"
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

      <div className="flex flex-wrap gap-3">
        <button
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#10233f] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0d1c33] disabled:opacity-60"
          disabled={isSaving || isProcessingPhotos}
          type="submit"
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {isSaving ? 'Saving changes…' : 'Save changes'}
        </button>
        <button
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-[#10233f] hover:bg-slate-50"
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
