'use client'

import { useEffect, useRef, useState } from 'react'
import { MapPin, Monitor, Smartphone, Tablet, Trash2, Upload } from 'lucide-react'

import {
  Dialog,
  DialogContent,
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

type GoogleMapsWindow = Window & {
  google?: any
}

type UploadedImage = {
  city: string | null
  dbId: string | null
  country: string | null
  fullAddress: string | null
  id: string
  imageUrl: string | null
  latitude: number | null
  longitude: number | null
  previewUrl: string
  province: string | null
  storagePath: string | null
  street: string | null
  tags: string[]
  typeOfPlace: string[]
  zipCode: string | null
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

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
const GOOGLE_MAPS_SCRIPT_ID = 'google-maps-javascript-api'
const DEFAULT_MAP_CENTER = { lat: 14.5995, lng: 120.9842 }

type AddressSuggestion = {
  displayName: string
  lat: number
  lon: number
  address: {
    road: string | null
    suburb: string | null
    city: string | null
    state: string | null
    postcode: string | null
    country: string | null
  }
}

type TaggedLocationDetails = {
  city: string | null
  country: string | null
  fullAddress: string | null
  latitude: number | null
  longitude: number | null
  province: string | null
  street: string | null
  zipCode: string | null
}

type TaxonomyOption = {
  description: string | null
  label: string
  slug: string
}

const EMPTY_LOCATION_DETAILS: TaggedLocationDetails = {
  city: null,
  country: null,
  fullAddress: null,
  latitude: null,
  longitude: null,
  province: null,
  street: null,
  zipCode: null,
}

function loadGoogleMapsApi() {
  if (!GOOGLE_MAPS_API_KEY) {
    return Promise.reject(new Error('Missing NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.'))
  }

  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google Maps can only load in the browser.'))
  }

  const mapsWindow = window as GoogleMapsWindow

  if (mapsWindow.google?.maps) {
    return Promise.resolve(mapsWindow.google)
  }

  const existingScript = document.getElementById(GOOGLE_MAPS_SCRIPT_ID) as HTMLScriptElement | null

  if (existingScript) {
    return new Promise((resolve, reject) => {
      existingScript.addEventListener('load', () => resolve(mapsWindow.google), { once: true })
      existingScript.addEventListener('error', () => reject(new Error('Unable to load Google Maps.')), {
        once: true,
      })
    })
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.id = GOOGLE_MAPS_SCRIPT_ID
    // Load Maps JavaScript API (display only — no Places, no Geocoding billed features)
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}`
    script.async = true
    script.defer = true
    script.onload = () => resolve(mapsWindow.google)
    script.onerror = () => reject(new Error('Unable to load Google Maps.'))
    document.head.appendChild(script)
  })
}

function debounce<T extends (...args: Parameters<T>) => void>(fn: T, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined
  return (...args: Parameters<T>) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
}

function getLocationDetailsFromSuggestion(suggestion: AddressSuggestion): TaggedLocationDetails {
  return {
    city: suggestion.address.city,
    country: suggestion.address.country,
    fullAddress: suggestion.displayName,
    latitude: suggestion.lat,
    longitude: suggestion.lon,
    province: suggestion.address.state,
    street: suggestion.address.road,
    zipCode: suggestion.address.postcode,
  }
}

function normalizeChipValue(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

function mergeChipValues(currentValues: string[], nextValues: string[]) {
  const seen = new Set(currentValues.map((value) => value.toLowerCase()))
  const mergedValues = [...currentValues]

  nextValues.forEach((value) => {
    const normalizedValue = normalizeChipValue(value)

    if (!normalizedValue) {
      return
    }

    const normalizedKey = normalizedValue.toLowerCase()

    if (seen.has(normalizedKey)) {
      return
    }

    seen.add(normalizedKey)
    mergedValues.push(normalizedValue)
  })

  return mergedValues
}

function ChipInput({
  id,
  disabled = false,
  onChange,
  options,
  placeholder,
  values,
}: {
  id: string
  disabled?: boolean
  onChange: (values: string[]) => void
  options: TaxonomyOption[]
  placeholder: string
  values: string[]
}) {
  const [inputValue, setInputValue] = useState('')
  const [isFocused, setIsFocused] = useState(false)

  const normalizedInput = normalizeChipValue(inputValue).toLowerCase()
  const filteredOptions = options.filter((option) => {
    if (values.includes(option.label)) {
      return false
    }

    if (!normalizedInput) {
      return true
    }

    return (
      option.label.toLowerCase().includes(normalizedInput) ||
      option.slug.toLowerCase().includes(normalizedInput)
    )
  })

  function selectOption(option: TaxonomyOption) {
    onChange(mergeChipValues(values, [option.label]))
    setInputValue('')
    setIsFocused(false)
  }

  function removeValue(valueToRemove: string) {
    onChange(values.filter((value) => value !== valueToRemove))
  }

  function selectExactMatch() {
    const exactMatch = options.find(
      (option) => option.label.toLowerCase() === normalizedInput || option.slug.toLowerCase() === normalizedInput,
    )

    if (!exactMatch || values.includes(exactMatch.label)) {
      return false
    }

    selectOption(exactMatch)
    return true
  }

  return (
    <div className="relative rounded-2xl border border-border/70 bg-white px-4 py-3 shadow-sm focus-within:ring-2 focus-within:ring-slate-950">
      <div className="flex flex-wrap items-center gap-2">
        {values.map((value) => (
          <span
            key={value}
            className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-3 py-1 text-sm font-medium text-white"
          >
            <span>{value}</span>
            <button
              aria-label={`Remove ${value}`}
              className="text-white/70 transition-colors hover:text-white"
              onClick={() => removeValue(value)}
              type="button"
            >
              x
            </button>
          </span>
        ))}
        <input
          className="min-w-[10rem] flex-1 border-0 bg-transparent p-0 text-base text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
          disabled={disabled}
          id={id}
          onBlur={() => {
            window.setTimeout(() => {
              if (inputValue.trim()) {
                selectExactMatch()
              }
              setIsFocused(false)
            }, 100)
          }}
          onFocus={() => {
            if (!disabled) {
              setIsFocused(true)
            }
          }}
          onChange={(event) => setInputValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              if (filteredOptions.length > 0) {
                selectOption(filteredOptions[0])
                return
              }

              selectExactMatch()
            }

            if (event.key === 'Backspace' && !inputValue && values.length > 0) {
              event.preventDefault()
              onChange(values.slice(0, -1))
            }

            if (event.key === 'Escape') {
              setIsFocused(false)
            }
          }}
          placeholder={placeholder}
          type="text"
          value={inputValue}
        />
      </div>

      {isFocused && !disabled && filteredOptions.length > 0 ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-20 overflow-hidden rounded-2xl border border-border/70 bg-white shadow-xl">
          <div className="max-h-52 overflow-y-auto py-2">
            {filteredOptions.slice(0, 8).map((option) => (
              <button
                key={option.slug}
                className="flex w-full flex-col items-start px-4 py-2 text-left transition-colors hover:bg-muted/40"
                onMouseDown={(event) => {
                  event.preventDefault()
                  selectOption(option)
                }}
                type="button"
              >
                <span className="text-sm font-medium text-foreground">{option.label}</span>
                {option.description ? (
                  <span className="text-xs text-muted-foreground">{option.description}</span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
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
    city: null,
    dbId: null,
    country: null,
    fullAddress: null,
    id: `${file.name}-${file.lastModified}-${file.size}`,
    imageUrl: null,
    latitude: null,
    longitude: null,
    previewUrl,
    province: null,
    storagePath: null,
    street: null,
    tags: [],
    typeOfPlace: [],
    zipCode: null,
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
  const [tagAddressQuery, setTagAddressQuery] = useState('')
  const [tagTypeOfPlace, setTagTypeOfPlace] = useState<string[]>([])
  const [tagValues, setTagValues] = useState<string[]>([])
  const [placeTypeOptions, setPlaceTypeOptions] = useState<TaxonomyOption[]>([])
  const [tagOptions, setTagOptions] = useState<TaxonomyOption[]>([])
  const [taxonomyError, setTaxonomyError] = useState('')
  const [tagLocationDetails, setTagLocationDetails] = useState<TaggedLocationDetails>(
    EMPTY_LOCATION_DETAILS,
  )
  const [mapStatusMessage, setMapStatusMessage] = useState('')
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([])
  const [isSearchingAddress, setIsSearchingAddress] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const previewUrlsRef = useRef<string[]>([])
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<any>(null)
  const markerRef = useRef<any>(null)
  const debouncedSearchRef = useRef<((...args: Parameters<(q: string) => void>) => void) | null>(null)

  async function searchAddressSuggestions(query: string) {
    const trimmed = query.trim()

    if (trimmed.length < 3) {
      setAddressSuggestions([])
      return [] as AddressSuggestion[]
    }

    setIsSearchingAddress(true)

    try {
      const response = await fetch(`/api/geocode?q=${encodeURIComponent(trimmed)}`)
      const data = await response.json()

      if (!response.ok) {
        setAddressSuggestions([])
        setMapStatusMessage(data?.error || 'Unable to search this address right now.')
        return []
      }

      const suggestions = Array.isArray(data.suggestions)
        ? (data.suggestions as AddressSuggestion[])
        : []

      setAddressSuggestions(suggestions)
      setMapStatusMessage(suggestions.length ? '' : 'No matching address found.')
      return suggestions
    } catch {
      setAddressSuggestions([])
      setMapStatusMessage('Unable to search this address right now.')
      return []
    } finally {
      setIsSearchingAddress(false)
    }
  }

  async function reverseGeocodeCoordinates(latitude: number, longitude: number) {
    setIsSearchingAddress(true)

    try {
      const response = await fetch(
        `/api/geocode?lat=${encodeURIComponent(String(latitude))}&lon=${encodeURIComponent(String(longitude))}`,
      )
      const data = await response.json()

      if (!response.ok || !data?.suggestion) {
        setMapStatusMessage(data?.error || 'Unable to resolve this map location right now.')
        return null
      }

      setMapStatusMessage('')
      return data.suggestion as AddressSuggestion
    } catch {
      setMapStatusMessage('Unable to resolve this map location right now.')
      return null
    } finally {
      setIsSearchingAddress(false)
    }
  }

  useEffect(() => {
    return () => {
      previewUrlsRef.current.forEach((previewUrl) => {
        URL.revokeObjectURL(previewUrl)
      })
    }
  }, [])

  useEffect(() => {
    let isCancelled = false

    void fetch('/api/taxonomy')
      .then(async (response) => {
        const data = await response.json()

        if (!response.ok) {
          throw new Error(data?.error || 'Unable to load allowed tags right now.')
        }

        if (isCancelled) {
          return
        }

        setPlaceTypeOptions(Array.isArray(data.placeTypes) ? data.placeTypes : [])
        setTagOptions(Array.isArray(data.tags) ? data.tags : [])
        setTaxonomyError('')
      })
      .catch((error) => {
        if (isCancelled) {
          return
        }

        setTaxonomyError(
          error instanceof Error ? error.message : 'Unable to load allowed tags right now.',
        )
      })

    return () => {
      isCancelled = true
    }
  }, [])

  // Initialise the Google Maps display (no Places/Geocoding API calls)
  useEffect(() => {
    if (!isTagModalOpen) {
      return
    }

    if (!GOOGLE_MAPS_API_KEY) {
      setMapStatusMessage('Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to enable the map preview.')
      return
    }

    let isCancelled = false

    setMapStatusMessage('Loading map...')

    void loadGoogleMapsApi()
      .then((google) => {
        if (isCancelled) {
          return
        }

        // mapContainerRef.current may be null if the Dialog hasn't mounted its
        // portal DOM yet; wait one tick for Radix to render the portal.
        const container = mapContainerRef.current

        if (!container) {
          return
        }

        // Always re-create the map when the modal opens so it attaches to the
        // current (possibly freshly mounted) DOM node.
        mapRef.current = new google.maps.Map(container, {
          center: DEFAULT_MAP_CENTER,
          disableDefaultUI: true,
          gestureHandling: 'cooperative',
          zoom: 11,
          zoomControl: true,
        })

        markerRef.current = new google.maps.Marker({
          map: mapRef.current,
          visible: false,
        })

        mapRef.current.addListener('click', (event: any) => {
          const clickedLatitude = event.latLng?.lat?.()
          const clickedLongitude = event.latLng?.lng?.()

          if (clickedLatitude == null || clickedLongitude == null || !markerRef.current) {
            return
          }

          const position = { lat: clickedLatitude, lng: clickedLongitude }
          markerRef.current.setPosition(position)
          markerRef.current.setVisible(true)
          mapRef.current.panTo(position)

          setTagLocationDetails((current) => ({
            ...current,
            latitude: clickedLatitude,
            longitude: clickedLongitude,
          }))

          void reverseGeocodeCoordinates(clickedLatitude, clickedLongitude).then((suggestion) => {
            if (!suggestion) {
              setTagLocationDetails((current) => ({
                ...current,
                latitude: clickedLatitude,
                longitude: clickedLongitude,
              }))
              return
            }

            handleAddressSelect(suggestion)
          })
        })

        setMapStatusMessage('')
      })
      .catch((error) => {
        if (isCancelled) {
          return
        }

        setMapStatusMessage(error instanceof Error ? error.message : 'Unable to load Google Maps.')
      })

    return () => {
      isCancelled = true
    }
  }, [isTagModalOpen])

  // Set up debounced LocationIQ search (no Google billing)
  useEffect(() => {
    debouncedSearchRef.current = debounce(async (query: string) => {
      await searchAddressSuggestions(query)
    }, 400)
  }, [])

  function handleAddressSelect(suggestion: AddressSuggestion) {
    const nextLocationDetails = getLocationDetailsFromSuggestion(suggestion)

    setTagAddressQuery(suggestion.displayName)
    setAddressSuggestions([])
    setTagLocationDetails(nextLocationDetails)

    if (mapRef.current && markerRef.current) {
      const position = { lat: suggestion.lat, lng: suggestion.lon }
      markerRef.current.setPosition(position)
      markerRef.current.setVisible(true)
      mapRef.current.panTo(position)
      mapRef.current.setZoom(16)
    }
  }

  async function handlePlaceNameSearch() {
    const trimmedPlaceName = tagPlaceName.trim()

    if (!trimmedPlaceName) {
      return
    }

    setTagAddressQuery(trimmedPlaceName)
    const suggestions = await searchAddressSuggestions(trimmedPlaceName)

    if (suggestions.length > 0) {
      handleAddressSelect(suggestions[0])
      return
    }

    if (mapRef.current && markerRef.current) {
      markerRef.current.setVisible(false)
      mapRef.current.setCenter(DEFAULT_MAP_CENTER)
      mapRef.current.setZoom(11)
    }
  }

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

  function resetTagModalState() {
    setTagPlaceName('')
    setTagAddressQuery('')
    setTagTypeOfPlace([])
    setTagValues([])
    setTagLocationDetails(EMPTY_LOCATION_DETAILS)
    setMapStatusMessage('')
    setAddressSuggestions([])
    setIsSearchingAddress(false)
    // Reset map to default view
    if (mapRef.current && markerRef.current) {
      markerRef.current.setVisible(false)
      mapRef.current.setCenter(DEFAULT_MAP_CENTER)
      mapRef.current.setZoom(11)
    }
  }

  async function persistImageTags(imageId: string, payload: {
    city: string | null
    country: string | null
    fullAddress: string | null
    latitude: number | null
    longitude: number | null
    placeName: string
    province: string | null
    street: string | null
    tags: string[]
    typeOfPlace: string[]
    zipCode: string | null
  }) {
    const image = uploadedImages.find((currentImage) => currentImage.id === imageId)

    if (!image?.dbId) {
      return
    }

    const response = await fetch(`/api/photos/${image.dbId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const data = await response.json().catch(() => null)
      throw new Error(data?.error || 'Unable to save photo tags right now.')
    }
  }

  function handleTagImages() {
    const trimmed = tagPlaceName.trim()
    if (!trimmed) return

    const trimmedAddress = normalizeChipValue(tagAddressQuery)
    const typeOfPlace = [...tagTypeOfPlace]
    const tags = [...tagValues]
    const fallbackFullAddress = trimmedAddress || null
    const locationDetails = {
      ...tagLocationDetails,
      fullAddress: tagLocationDetails.fullAddress ?? fallbackFullAddress,
    }

    setUploadedImages((currentImages) =>
      currentImages.map((image) =>
        selectedIds.has(image.id)
          ? {
              ...image,
              city: locationDetails.city,
              country: locationDetails.country,
              fullAddress: locationDetails.fullAddress,
              latitude: locationDetails.latitude,
              longitude: locationDetails.longitude,
              placeName: trimmed,
              province: locationDetails.province,
              street: locationDetails.street,
              tags,
              typeOfPlace,
              uploadError: null,
              zipCode: locationDetails.zipCode,
            }
          : image,
      ),
    )

    const selectedImageIds = [...selectedIds]

    void Promise.allSettled(
      selectedImageIds.map(async (imageId) => {
        try {
          await persistImageTags(imageId, {
            city: locationDetails.city,
            country: locationDetails.country,
            fullAddress: locationDetails.fullAddress,
            latitude: locationDetails.latitude,
            longitude: locationDetails.longitude,
            placeName: trimmed,
            province: locationDetails.province,
            street: locationDetails.street,
            tags,
            typeOfPlace,
            zipCode: locationDetails.zipCode,
          })
        } catch (error) {
          updateUploadedImage(imageId, (image) => ({
            ...image,
            uploadError:
              error instanceof Error ? error.message : 'Unable to save photo tags right now.',
          }))
        }
      }),
    )

    setSelectedIds(new Set())
    setIsTagModalOpen(false)
    resetTagModalState()
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
                resetTagModalState()
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
          if (!open) {
            setIsTagModalOpen(false)
            resetTagModalState()
          }
        }}
      >
        <DialogContent
          className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden rounded-3xl p-0 sm:max-w-lg"
          showCloseButton={false}
        >
          {/* Sticky header */}
          <div className="flex items-center justify-between border-b border-border/60 bg-white px-6 py-4">
            <div>
              <DialogTitle className="text-lg font-semibold leading-tight">
                Tag photos
              </DialogTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Tagging {selectedIds.size} photo{selectedIds.size !== 1 ? 's' : ''}
              </p>
            </div>
            <button
              aria-label="Close"
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
              onClick={() => {
                setIsTagModalOpen(false)
                resetTagModalState()
              }}
              type="button"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto">
            {/* Location section */}
            <div className="px-6 pt-5 pb-4">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Location
              </p>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground" htmlFor="place-name-input">
                    Name of place <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      autoFocus
                      className="h-12 w-full rounded-xl border border-border/70 bg-white px-4 pr-11 text-sm text-foreground shadow-sm transition-shadow focus:outline-none focus:ring-2 focus:ring-slate-950"
                      id="place-name-input"
                      onChange={(e) => setTagPlaceName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleTagImages()
                      }}
                      placeholder="e.g. Ayala Mall, Makati City"
                      type="text"
                      value={tagPlaceName}
                    />
                    <button
                      aria-label="Search place name on map"
                      className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={!tagPlaceName.trim() || isSearchingAddress}
                      onClick={() => void handlePlaceNameSearch()}
                      type="button"
                    >
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        viewBox="0 0 24 24"
                      >
                        <circle cx="11" cy="11" r="8" />
                        <path d="m21 21-4.35-4.35" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground" htmlFor="address-search-input">
                    Search address
                  </label>
                  <div className="relative">
                    <svg
                      className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                    >
                      <circle cx="11" cy="11" r="8" />
                      <path d="m21 21-4.35-4.35" strokeLinecap="round" />
                    </svg>
                    <input
                      autoComplete="off"
                      className="h-12 w-full rounded-xl border border-border/70 bg-white py-0 pl-10 pr-9 text-sm text-foreground shadow-sm transition-shadow focus:outline-none focus:ring-2 focus:ring-slate-950"
                      id="address-search-input"
                      onChange={(e) => {
                        const value = e.target.value
                        setTagAddressQuery(value)
                        debouncedSearchRef.current?.(value)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          setAddressSuggestions([])
                        }
                      }}
                      placeholder="Type to search an address…"
                      type="text"
                      value={tagAddressQuery}
                    />
                    {isSearchingAddress ? (
                      <svg
                        className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                        <path className="opacity-75" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" fill="currentColor" />
                      </svg>
                    ) : null}
                  </div>
                  {addressSuggestions.length > 0 ? (
                    <ul className="mt-1 overflow-hidden rounded-xl border border-border/70 bg-white shadow-md">
                      {addressSuggestions.map((suggestion, index) => (
                        <li key={index}>
                          <button
                            className="w-full px-4 py-2.5 text-left text-sm text-foreground transition-colors hover:bg-muted/40 focus:bg-muted/40 focus:outline-none"
                            onClick={() => handleAddressSelect(suggestion)}
                            type="button"
                          >
                            {suggestion.displayName}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>

                {/* Map */}
                <div className="overflow-hidden rounded-xl border border-border/60 shadow-sm">
                  <div className="h-52 w-full" ref={mapContainerRef} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {mapStatusMessage || 'Select a suggested address or click the map to pin an accurate location.'}
                </p>
              </div>
            </div>

            <div className="mx-6 border-t border-border/40" />

            {/* Classification section */}
            <div className="px-6 pt-4 pb-5">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Classification
              </p>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground" htmlFor="type-of-place-input">
                    Type Of Place
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Choose from the approved place types for consistent photo classification.
                  </p>
                  <ChipInput
                    disabled={placeTypeOptions.length === 0}
                    id="type-of-place-input"
                    onChange={setTagTypeOfPlace}
                    options={placeTypeOptions}
                    placeholder={placeTypeOptions.length ? 'Search place types…' : 'Loading place types…'}
                    values={tagTypeOfPlace}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground" htmlFor="tags-input">
                    Tags
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Choose from the approved internal tags for searchable consistency.
                  </p>
                  <ChipInput
                    disabled={tagOptions.length === 0}
                    id="tags-input"
                    onChange={setTagValues}
                    options={tagOptions}
                    placeholder={tagOptions.length ? 'Search tags…' : 'Loading tags…'}
                    values={tagValues}
                  />
                </div>

                {taxonomyError ? (
                  <p className="text-xs text-red-600">{taxonomyError}</p>
                ) : null}
              </div>
            </div>
          </div>

          {/* Sticky footer */}
          <div className="border-t border-border/60 bg-white px-6 py-4">
            <div className="flex gap-3">
              <button
                className="flex-1 rounded-xl border border-border/70 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted/30"
                onClick={() => {
                  setIsTagModalOpen(false)
                  resetTagModalState()
                }}
                type="button"
              >
                Cancel
              </button>
              <button
                className="flex-1 rounded-xl bg-slate-950 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                disabled={!tagPlaceName.trim()}
                onClick={() => handleTagImages()}
                type="button"
              >
                Save tags
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  )
}
