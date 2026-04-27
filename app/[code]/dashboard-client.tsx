'use client'

import { useEffect, useRef, useState } from 'react'
import {
  CloudUpload,
  Folder,
  FolderOpen,
  Grid3X3,
  ImageIcon,
  List,
  MapPin,
  Maximize2,
  Menu,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react'

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

type UploadStatus = 'uploading' | 'uploaded' | 'error' | 'deleting'
type DashboardView = 'upload' | 'my-photos'

type GoogleMapsWindow = Window & { google?: any }

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

export type DashboardUser = {
  id: string
  fullName: string
  firstName: string
  areaFocused: string
  email: string
  code: string
}

type DbPhoto = {
  id: string
  album_user_id: number | null
  uploader_code: string | null
  folder_id: string | null
  image_url: string
  original_file_name: string
  file_size_bytes: number
  created_at: string
  capture_date: string | null
  device_make: string | null
  device_model: string | null
  place_name: string | null
  city: string | null
  province: string | null
  type_of_place: string[]
  tags: string[]
  latitude: number | null
  longitude: number | null
}

type AlbumFolder = {
  id: string
  album_user_id: number | null
  uploader_code: string | null
  uploader_name: string
  folder_name: string
  full_address: string | null
  street: string | null
  city: string | null
  province: string | null
  zip_code: string | null
  country: string | null
  latitude: number | null
  longitude: number | null
  type_of_place: string[]
  tags: string[]
  created_at: string
}

type LightboxImage = {
  id: string
  src: string
  alt: string
  subtitle?: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
const GOOGLE_MAPS_SCRIPT_ID = 'google-maps-javascript-api'
// Default map center: Cebu City
const DEFAULT_MAP_CENTER = { lat: 10.3157, lng: 123.8854 }

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadGoogleMapsApi() {
  if (!GOOGLE_MAPS_API_KEY) {
    return Promise.reject(new Error('Missing NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.'))
  }
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google Maps can only load in the browser.'))
  }
  const w = window as GoogleMapsWindow
  if (w.google?.maps) return Promise.resolve(w.google)
  const existing = document.getElementById(GOOGLE_MAPS_SCRIPT_ID) as HTMLScriptElement | null
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve(w.google), { once: true })
      existing.addEventListener('error', () => reject(new Error('Unable to load Google Maps.')), { once: true })
    })
  }
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.id = GOOGLE_MAPS_SCRIPT_ID
    s.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}`
    s.async = true
    s.defer = true
    s.onload = () => resolve(w.google)
    s.onerror = () => reject(new Error('Unable to load Google Maps.'))
    document.head.appendChild(s)
  })
}

function debounce<T extends (...args: Parameters<T>) => void>(fn: T, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined
  return (...args: Parameters<T>) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
}

function normalizeChipValue(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

function mergeChipValues(current: string[], next: string[]) {
  const seen = new Set(current.map((v) => v.toLowerCase()))
  const merged = [...current]
  next.forEach((v) => {
    const norm = normalizeChipValue(v)
    if (!norm) return
    const key = norm.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    merged.push(norm)
  })
  return merged
}

function getLocationDetailsFromSuggestion(s: AddressSuggestion): TaggedLocationDetails {
  return {
    city: s.address.city,
    country: s.address.country,
    fullAddress: s.displayName,
    latitude: s.lat,
    longitude: s.lon,
    province: s.address.state,
    street: s.address.road,
    zipCode: s.address.postcode,
  }
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const v = bytes / 1024 ** i
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`
}

function formatRelativeDate(isoString: string) {
  const date = new Date(isoString)
  const diffDays = Math.floor((Date.now() - date.getTime()) / 86_400_000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  return new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium' }).format(date)
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
    return { width: image.naturalWidth || null, height: image.naturalHeight || null }
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

async function analyzeImage(file: File): Promise<UploadedImage> {
  const previewUrl = URL.createObjectURL(file)
  const dimensions = await getImageDimensions(file)
  const exifr = await import('exifr')
  const metadata = await exifr.parse(file, {
    gps: true, exif: true, iptc: true, tiff: true, xmp: true, sanitize: true,
  })
  const latitude = metadata?.latitude ?? metadata?.lat ?? null
  const longitude = metadata?.longitude ?? metadata?.lon ?? null
  const keywords = Array.isArray(metadata?.Keywords)
    ? metadata.Keywords.map(String)
    : metadata?.Keywords ? [String(metadata.Keywords)] : []

  return {
    city: null, dbId: null, country: null, fullAddress: null,
    id: `${file.name}-${file.lastModified}-${file.size}`,
    imageUrl: null, latitude: null, longitude: null,
    previewUrl, province: null, storagePath: null, street: null,
    tags: [], typeOfPlace: [], zipCode: null,
    metadata: {
      altitude: metadata?.GPSAltitude ?? metadata?.altitude ?? null,
      aperture: metadata?.FNumber ?? metadata?.ApertureValue ?? null,
      captureDate:
        metadata?.DateTimeOriginal?.toISOString?.() ??
        metadata?.CreateDate?.toISOString?.() ??
        metadata?.ModifyDate?.toISOString?.() ?? null,
      description: metadata?.ImageDescription ?? metadata?.Description ?? null,
      deviceMake: metadata?.Make ?? null,
      deviceModel: metadata?.Model ?? null,
      exposureTime: metadata?.ExposureTime ? String(metadata.ExposureTime) : null,
      fileName: file.name, fileSize: file.size, fileType: file.type || 'Unknown',
      focalLength: metadata?.FocalLength ?? null, height: dimensions.height,
      iso: metadata?.ISO ?? null, keywords,
      lastModified: new Date(file.lastModified).toISOString(),
      latitude, lensModel: metadata?.LensModel ?? null, longitude, width: dimensions.width,
    },
    placeName: null, uploadError: null, uploadStatus: 'uploading',
  }
}

// ─── ChipInput ────────────────────────────────────────────────────────────────

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
  const filteredOptions = options.filter((o) => {
    if (values.includes(o.label)) return false
    if (!normalizedInput) return true
    return (
      o.label.toLowerCase().includes(normalizedInput) ||
      o.slug.toLowerCase().includes(normalizedInput)
    )
  })

  function selectOption(option: TaxonomyOption) {
    onChange(mergeChipValues(values, [option.label]))
    setInputValue('')
    setIsFocused(true)
  }

  function selectExactMatch() {
    const match = options.find(
      (o) =>
        o.label.toLowerCase() === normalizedInput ||
        o.slug.toLowerCase() === normalizedInput,
    )
    if (!match || values.includes(match.label)) return false
    selectOption(match)
    return true
  }

  return (
    <div className="relative rounded-2xl border border-border/70 bg-white px-4 py-3 shadow-sm focus-within:ring-2 focus-within:ring-slate-950">
      <div className="flex flex-wrap items-center gap-2">
        {values.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-3 py-1 text-sm font-medium text-white"
          >
            <span>{v}</span>
            <button
              aria-label={`Remove ${v}`}
              className="text-white/70 transition-colors hover:text-white"
              onClick={() => onChange(values.filter((x) => x !== v))}
              type="button"
            >
              ×
            </button>
          </span>
        ))}
        <input
          className="min-w-[10rem] flex-1 border-0 bg-transparent p-0 text-base text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
          disabled={disabled}
          id={id}
          onBlur={() => {
            window.setTimeout(() => {
              if (inputValue.trim()) selectExactMatch()
              setIsFocused(false)
            }, 100)
          }}
          onFocus={() => { if (!disabled) setIsFocused(true) }}
          onChange={(e) => {
            setInputValue(e.target.value)
            if (!disabled) setIsFocused(true)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              filteredOptions.length > 0 ? selectOption(filteredOptions[0]) : selectExactMatch()
            }
            if (e.key === 'Backspace' && !inputValue && values.length > 0) {
              e.preventDefault()
              onChange(values.slice(0, -1))
            }
            if (e.key === 'Escape') setIsFocused(false)
          }}
          placeholder={placeholder}
          type="text"
          value={inputValue}
        />
      </div>

      {isFocused && !disabled && filteredOptions.length > 0 ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-20 overflow-hidden rounded-2xl border border-border/70 bg-white shadow-xl">
          <div className="max-h-52 overflow-y-auto py-2">
            {filteredOptions.slice(0, 8).map((o) => (
              <button
                key={o.slug}
                className="flex w-full flex-col items-start px-4 py-2 text-left transition-colors hover:bg-muted/40"
                onMouseDown={(e) => { e.preventDefault(); selectOption(o) }}
                type="button"
              >
                <span className="text-sm font-medium text-foreground">{o.label}</span>
                {o.description ? (
                  <span className="text-xs text-muted-foreground">{o.description}</span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

// ─── SidebarNavItem ───────────────────────────────────────────────────────────

function SidebarNavItem({
  icon,
  label,
  active,
  badge,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  active: boolean
  badge?: number
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-full px-4 py-2.5 text-sm transition-colors text-left',
        active
          ? 'bg-[#c2e7ff] font-semibold text-[#001d35]'
          : 'font-medium text-gray-600 hover:bg-gray-100',
      )}
      type="button"
    >
      <span className={cn('shrink-0', active ? 'text-[#001d35]' : 'text-gray-500')}>
        {icon}
      </span>
      <span className="flex-1 truncate">{label}</span>
      {badge != null ? (
        <span className="ml-auto shrink-0 rounded-full bg-gray-200 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600">
          {badge}
        </span>
      ) : null}
    </button>
  )
}

// ─── Spinner ──────────────────────────────────────────────────────────────────

function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn('animate-spin', className)}
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-75" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" fill="currentColor" />
    </svg>
  )
}

// ─── DashboardClient ──────────────────────────────────────────────────────────

export default function DashboardClient({ user }: { user: DashboardUser }) {
  // Layout
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [activeView, setActiveView] = useState<DashboardView>('upload')
  const [searchQuery, setSearchQuery] = useState('')

  // Upload state
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([])
  const [analysisError, setAnalysisError] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [folders, setFolders] = useState<AlbumFolder[]>([])
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null)

  // New folder modal state
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false)
  const [folderName, setFolderName] = useState('')
  const [folderAddressQuery, setFolderAddressQuery] = useState('')
  const [folderTypeOfPlace, setFolderTypeOfPlace] = useState<string[]>([])
  const [folderTagValues, setFolderTagValues] = useState<string[]>([])
  const [folderLocationDetails, setFolderLocationDetails] = useState<TaggedLocationDetails>(EMPTY_LOCATION_DETAILS)
  const [folderStatusMessage, setFolderStatusMessage] = useState('')
  const [folderAddressSuggestions, setFolderAddressSuggestions] = useState<AddressSuggestion[]>([])
  const [isSearchingFolderAddress, setIsSearchingFolderAddress] = useState(false)
  const [isSavingFolder, setIsSavingFolder] = useState(false)

  // Tag modal state
  const [isTagModalOpen, setIsTagModalOpen] = useState(false)
  const [tagPlaceName, setTagPlaceName] = useState('')
  const [tagAddressQuery, setTagAddressQuery] = useState('')
  const [tagTypeOfPlace, setTagTypeOfPlace] = useState<string[]>([])
  const [tagValues, setTagValues] = useState<string[]>([])
  const [placeTypeOptions, setPlaceTypeOptions] = useState<TaxonomyOption[]>([])
  const [tagOptions, setTagOptions] = useState<TaxonomyOption[]>([])
  const [taxonomyError, setTaxonomyError] = useState('')
  const [tagLocationDetails, setTagLocationDetails] = useState<TaggedLocationDetails>(EMPTY_LOCATION_DETAILS)
  const [mapStatusMessage, setMapStatusMessage] = useState('')
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([])
  const [isSearchingAddress, setIsSearchingAddress] = useState(false)

  // My Photos state
  const [dbPhotos, setDbPhotos] = useState<DbPhoto[]>([])
  const [isLoadingPhotos, setIsLoadingPhotos] = useState(false)
  const [photosError, setPhotosError] = useState('')
  const [photosViewMode, setPhotosViewMode] = useState<'grid' | 'list'>('grid')
  const [folderPhotosViewMode, setFolderPhotosViewMode] = useState<'grid' | 'list'>('grid')
  const [deletingPhotoIds, setDeletingPhotoIds] = useState<Set<string>>(new Set())
  const [lightboxImages, setLightboxImages] = useState<LightboxImage[]>([])
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  // Refs
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const previewUrlsRef = useRef<string[]>([])
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<any>(null)
  const markerRef = useRef<any>(null)
  const debouncedSearchRef = useRef<((...args: Parameters<(q: string) => void>) => void) | null>(null)
  const folderMapContainerRef = useRef<HTMLDivElement | null>(null)
  const folderMapRef = useRef<any>(null)
  const folderMarkerRef = useRef<any>(null)
  const folderDebouncedSearchRef = useRef<((...args: Parameters<(q: string) => void>) => void) | null>(null)

  const initials = (user.firstName?.[0] ?? '?').toUpperCase()
  const authStorageKey = `homes-albums-auth:${user.code}`

  const [isAuthChecked, setIsAuthChecked] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [passwordInput, setPasswordInput] = useState('')
  const [authError, setAuthError] = useState('')
  const [isAuthenticating, setIsAuthenticating] = useState(false)

  async function handlePasswordLogin(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault()

    if (!passwordInput.trim()) {
      setAuthError('Please enter your password.')
      return
    }

    setIsAuthenticating(true)
    setAuthError('')

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: user.code,
          password: passwordInput,
        }),
      })

      const data = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(data?.error || 'Invalid password.')
      }

      localStorage.setItem(authStorageKey, '1')
      setIsAuthenticated(true)
      setPasswordInput('')
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Unable to log in right now.')
      setIsAuthenticated(false)
    } finally {
      setIsAuthenticating(false)
    }
  }

  // ─── Effects ────────────────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [])

  useEffect(() => {
    const isLoggedIn = localStorage.getItem(authStorageKey) === '1'
    setIsAuthenticated(isLoggedIn)
    setIsAuthChecked(true)
  }, [authStorageKey])

  useEffect(() => {
    let cancelled = false
    void fetch('/api/taxonomy')
      .then(async (r) => {
        const data = await r.json()
        if (!r.ok) throw new Error(data?.error || 'Unable to load taxonomy.')
        if (cancelled) return
        setPlaceTypeOptions(Array.isArray(data.placeTypes) ? data.placeTypes : [])
        setTagOptions(Array.isArray(data.tags) ? data.tags : [])
        setTaxonomyError('')
      })
      .catch((e) => {
        if (!cancelled) {
          setTaxonomyError(e instanceof Error ? e.message : 'Unable to load taxonomy.')
        }
      })
    return () => { cancelled = true }
  }, [])

  async function loadPhotos(options?: { silent?: boolean }) {
    const silent = options?.silent ?? false
    if (!silent) {
      setIsLoadingPhotos(true)
      setPhotosError('')
    }
    try {
      const r = await fetch(
        `/api/photos?uploader=${encodeURIComponent(user.fullName)}&uploaderCode=${encodeURIComponent(user.code)}`,
      )
      const data = await r.json()
      if (!r.ok) throw new Error(data?.error || 'Unable to load photos.')
      setDbPhotos(Array.isArray(data.photos) ? data.photos : [])
      if (!silent) setPhotosError('')
    } catch (error) {
      setPhotosError(error instanceof Error ? error.message : 'Unable to load photos.')
    } finally {
      if (!silent) setIsLoadingPhotos(false)
    }
  }

  useEffect(() => {
    if (!isAuthenticated) return
    void loadPhotos()
  }, [isAuthenticated, user.fullName, user.code])

  useEffect(() => {
    if (!isAuthenticated) return
    if (activeView !== 'my-photos') return
    void loadPhotos()
  }, [activeView, isAuthenticated])

  useEffect(() => {
    if (!isAuthenticated) return
    void loadFolders()
  }, [isAuthenticated, user.fullName, user.code])

  useEffect(() => {
    if (!isTagModalOpen) return
    if (!GOOGLE_MAPS_API_KEY) {
      setMapStatusMessage('Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to enable the map preview.')
      return
    }
    let cancelled = false
    setMapStatusMessage('Loading map...')
    void loadGoogleMapsApi()
      .then((google) => {
        if (cancelled) return
        const container = mapContainerRef.current
        if (!container) return
        mapRef.current = new google.maps.Map(container, {
          center: DEFAULT_MAP_CENTER,
          disableDefaultUI: true,
          gestureHandling: 'cooperative',
          zoom: 11,
          zoomControl: true,
        })
        markerRef.current = new google.maps.Marker({ map: mapRef.current, visible: false })
        mapRef.current.addListener('click', (event: any) => {
          const lat = event.latLng?.lat?.()
          const lng = event.latLng?.lng?.()
          if (lat == null || lng == null || !markerRef.current) return
          const position = { lat, lng }
          markerRef.current.setPosition(position)
          markerRef.current.setVisible(true)
          mapRef.current.panTo(position)
          setTagLocationDetails((c) => ({ ...c, latitude: lat, longitude: lng }))
          void reverseGeocodeCoordinates(lat, lng).then((suggestion) => {
            if (!suggestion) {
              setTagLocationDetails((c) => ({ ...c, latitude: lat, longitude: lng }))
              return
            }
            handleAddressSelect(suggestion)
          })
        })
        setMapStatusMessage('')
      })
      .catch((e) => {
        if (!cancelled) {
          setMapStatusMessage(e instanceof Error ? e.message : 'Unable to load Google Maps.')
        }
      })
    return () => { cancelled = true }
  }, [isTagModalOpen])

  useEffect(() => {
    if (!isFolderModalOpen) return
    if (!GOOGLE_MAPS_API_KEY) {
      setFolderStatusMessage('Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to enable the map preview.')
      return
    }
    let cancelled = false
    setFolderStatusMessage('Loading map...')
    void loadGoogleMapsApi()
      .then((google) => {
        if (cancelled) return
        const container = folderMapContainerRef.current
        if (!container) return
        folderMapRef.current = new google.maps.Map(container, {
          center: DEFAULT_MAP_CENTER,
          disableDefaultUI: true,
          gestureHandling: 'cooperative',
          zoom: 11,
          zoomControl: true,
        })
        folderMarkerRef.current = new google.maps.Marker({ map: folderMapRef.current, visible: false })
        folderMapRef.current.addListener('click', (event: any) => {
          const lat = event.latLng?.lat?.()
          const lng = event.latLng?.lng?.()
          if (lat == null || lng == null || !folderMarkerRef.current) return
          const position = { lat, lng }
          folderMarkerRef.current.setPosition(position)
          folderMarkerRef.current.setVisible(true)
          folderMapRef.current.panTo(position)
          setFolderLocationDetails((c) => ({ ...c, latitude: lat, longitude: lng }))
          void reverseGeocodeCoordinates(lat, lng).then((suggestion) => {
            if (!suggestion) {
              setFolderLocationDetails((c) => ({ ...c, latitude: lat, longitude: lng }))
              return
            }
            handleFolderAddressSelect(suggestion)
          })
        })
        setFolderStatusMessage('')
      })
      .catch((e) => {
        if (!cancelled) {
          setFolderStatusMessage(e instanceof Error ? e.message : 'Unable to load Google Maps.')
        }
      })
    return () => { cancelled = true }
  }, [isFolderModalOpen])

  useEffect(() => {
    debouncedSearchRef.current = debounce(async (q: string) => {
      await searchAddressSuggestions(q)
    }, 400)
  }, [])

  useEffect(() => {
    folderDebouncedSearchRef.current = debounce(async (q: string) => {
      await searchFolderAddressSuggestions(q)
    }, 400)
  }, [])

  // ─── Address helpers ─────────────────────────────────────────────────────────

  const activeFolder = folders.find((folder) => folder.id === activeFolderId) ?? null

  function openLightbox(images: LightboxImage[], index: number) {
    if (!images.length || index < 0 || index >= images.length) return
    setLightboxImages(images)
    setLightboxIndex(index)
  }

  function closeLightbox() {
    setLightboxIndex(null)
    setLightboxImages([])
  }

  function showNextLightboxImage() {
    setLightboxIndex((current) => {
      if (current == null || lightboxImages.length === 0) return current
      return (current + 1) % lightboxImages.length
    })
  }

  function showPreviousLightboxImage() {
    setLightboxIndex((current) => {
      if (current == null || lightboxImages.length === 0) return current
      return (current - 1 + lightboxImages.length) % lightboxImages.length
    })
  }

  async function loadFolders() {
    try {
      const r = await fetch(
        `/api/folders?uploader=${encodeURIComponent(user.fullName)}&uploaderCode=${encodeURIComponent(user.code)}`,
      )
      const data = await r.json()
      if (!r.ok) throw new Error(data?.error || 'Unable to load folders.')
      const nextFolders = Array.isArray(data.folders) ? (data.folders as AlbumFolder[]) : []
      setFolders(nextFolders)
      setActiveFolderId((current) => {
        if (!current) return null
        if (nextFolders.some((folder) => folder.id === current)) return current
        return null
      })
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : 'Unable to load folders.')
    }
  }

  async function searchAddressSuggestions(query: string) {
    const trimmed = query.trim()
    if (trimmed.length < 3) { setAddressSuggestions([]); return [] as AddressSuggestion[] }
    setIsSearchingAddress(true)
    try {
      const r = await fetch(`/api/geocode?q=${encodeURIComponent(trimmed)}`)
      const data = await r.json()
      if (!r.ok) {
        setAddressSuggestions([])
        setMapStatusMessage(data?.error || 'Unable to search address.')
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

  async function reverseGeocodeCoordinates(lat: number, lng: number) {
    setIsSearchingAddress(true)
    try {
      const r = await fetch(
        `/api/geocode?lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lng))}`,
      )
      const data = await r.json()
      if (!r.ok || !data?.suggestion) {
        setMapStatusMessage(data?.error || 'Unable to resolve location.')
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

  async function searchFolderAddressSuggestions(query: string) {
    const trimmed = query.trim()
    if (trimmed.length < 3) { setFolderAddressSuggestions([]); return [] as AddressSuggestion[] }
    setIsSearchingFolderAddress(true)
    try {
      const r = await fetch(`/api/geocode?q=${encodeURIComponent(trimmed)}`)
      const data = await r.json()
      if (!r.ok) {
        setFolderAddressSuggestions([])
        setFolderStatusMessage(data?.error || 'Unable to search address.')
        return []
      }
      const suggestions = Array.isArray(data.suggestions)
        ? (data.suggestions as AddressSuggestion[])
        : []
      setFolderAddressSuggestions(suggestions)
      setFolderStatusMessage(suggestions.length ? '' : 'No matching address found.')
      return suggestions
    } catch {
      setFolderAddressSuggestions([])
      setFolderStatusMessage('Unable to search this address right now.')
      return []
    } finally {
      setIsSearchingFolderAddress(false)
    }
  }

  function handleAddressSelect(suggestion: AddressSuggestion) {
    const details = getLocationDetailsFromSuggestion(suggestion)
    setTagAddressQuery(suggestion.displayName)
    setAddressSuggestions([])
    setTagLocationDetails(details)
    if (mapRef.current && markerRef.current) {
      const position = { lat: suggestion.lat, lng: suggestion.lon }
      markerRef.current.setPosition(position)
      markerRef.current.setVisible(true)
      mapRef.current.panTo(position)
      mapRef.current.setZoom(16)
    }
  }

  function handleFolderAddressSelect(suggestion: AddressSuggestion) {
    const details = getLocationDetailsFromSuggestion(suggestion)
    setFolderAddressQuery(suggestion.displayName)
    setFolderAddressSuggestions([])
    setFolderLocationDetails(details)
    if (folderMapRef.current && folderMarkerRef.current) {
      const position = { lat: suggestion.lat, lng: suggestion.lon }
      folderMarkerRef.current.setPosition(position)
      folderMarkerRef.current.setVisible(true)
      folderMapRef.current.panTo(position)
      folderMapRef.current.setZoom(16)
    }
  }

  async function handlePlaceNameSearch() {
    const trimmed = tagPlaceName.trim()
    if (!trimmed) return
    setTagAddressQuery(trimmed)
    const suggestions = await searchAddressSuggestions(trimmed)
    if (suggestions.length > 0) { handleAddressSelect(suggestions[0]); return }
    if (mapRef.current && markerRef.current) {
      markerRef.current.setVisible(false)
      mapRef.current.setCenter(DEFAULT_MAP_CENTER)
      mapRef.current.setZoom(11)
    }
  }

  async function handleFolderPlaceNameSearch() {
    const trimmed = folderName.trim()
    if (!trimmed) return
    setFolderAddressQuery(trimmed)
    const suggestions = await searchFolderAddressSuggestions(trimmed)
    if (suggestions.length > 0) { handleFolderAddressSelect(suggestions[0]); return }
    if (folderMapRef.current && folderMarkerRef.current) {
      folderMarkerRef.current.setVisible(false)
      folderMapRef.current.setCenter(DEFAULT_MAP_CENTER)
      folderMapRef.current.setZoom(11)
    }
  }

  // ─── Upload helpers ───────────────────────────────────────────────────────────

  function updateUploadedImage(imageId: string, updater: (image: UploadedImage) => UploadedImage) {
    setUploadedImages((imgs) => imgs.map((img) => (img.id === imageId ? updater(img) : img)))
  }

  async function uploadImageToStorage(file: File, image: UploadedImage) {
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('uploaderName', user.fullName)
      formData.append('uploaderCode', user.code)
      formData.append('metadata', JSON.stringify(image.metadata))
      if (activeFolderId) {
        formData.append('folderId', activeFolderId)
      }
      const r = await fetch('/api/photos', { method: 'POST', body: formData })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Unable to upload photo.')

      // Remove completed uploads from the queue immediately.
      URL.revokeObjectURL(image.previewUrl)
      previewUrlsRef.current = previewUrlsRef.current.filter((url) => url !== image.previewUrl)
      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.delete(image.id)
        return next
      })
      setUploadedImages((imgs) => imgs.filter((img) => img.id !== image.id))
    } catch (error) {
      updateUploadedImage(image.id, (img) => ({
        ...img,
        uploadError: error instanceof Error ? error.message : 'Unable to upload photo.',
        uploadStatus: 'error',
      }))
    }
  }

  async function handleDeleteImage(imageId: string) {
    const image = uploadedImages.find((img) => img.id === imageId)
    if (!image || image.uploadStatus === 'uploading' || image.uploadStatus === 'deleting') return
    updateUploadedImage(imageId, (img) => ({ ...img, uploadError: null, uploadStatus: 'deleting' }))
    try {
      if (image.dbId) {
        const r = await fetch(`/api/photos/${image.dbId}`, { method: 'DELETE' })
        const data = await r.json()
        if (!r.ok) throw new Error(data.error || 'Unable to delete photo.')
      }
      URL.revokeObjectURL(image.previewUrl)
      previewUrlsRef.current = previewUrlsRef.current.filter((url) => url !== image.previewUrl)
      setSelectedIds((prev) => { const next = new Set(prev); next.delete(imageId); return next })
      setUploadedImages((imgs) => imgs.filter((img) => img.id !== imageId))
    } catch (error) {
      updateUploadedImage(imageId, (img) => ({
        ...img,
        uploadError: error instanceof Error ? error.message : 'Unable to delete photo.',
        uploadStatus: image.dbId ? 'uploaded' : 'error',
      }))
    }
  }

  async function handleDeleteDbPhoto(photoId: string) {
    if (!photoId) return
    if (deletingPhotoIds.has(photoId)) return

    setDeletingPhotoIds((prev) => {
      const next = new Set(prev)
      next.add(photoId)
      return next
    })

    const previousPhotos = dbPhotos
    setDbPhotos((current) => current.filter((photo) => photo.id !== photoId))

    try {
      const r = await fetch(`/api/photos/${photoId}`, { method: 'DELETE' })
      const data = await r.json()
      if (!r.ok) throw new Error(data?.error || 'Unable to delete photo.')

      setAnalysisError('')
    } catch (error) {
      setDbPhotos(previousPhotos)
      setAnalysisError(error instanceof Error ? error.message : 'Unable to delete photo.')
    } finally {
      setDeletingPhotoIds((prev) => {
        const next = new Set(prev)
        next.delete(photoId)
        return next
      })
      await loadPhotos({ silent: true })
    }
  }

  async function handleIncomingFiles(fileList: FileList | File[]) {
    if (!activeFolderId) {
      setAnalysisError('Create or open a folder location before uploading photos.')
      return
    }
    const files = Array.from(fileList).filter((f) => f.type.startsWith('image/'))
    if (!files.length) { setAnalysisError('Please upload image files only.'); return }
    setAnalysisError('')
    setIsAnalyzing(true)
    try {
      const prepared = await Promise.all(
        files.map(async (f) => ({ file: f, image: await analyzeImage(f) })),
      )
      const existingIds = new Set(uploadedImages.map((img) => img.id))
      const next = prepared.filter(({ image }) => !existingIds.has(image.id))
      if (!next.length) return
      previewUrlsRef.current.push(...next.map(({ image }) => image.previewUrl))
      setUploadedImages((imgs) => [...imgs, ...next.map(({ image }) => image)])
      await Promise.all(next.map(({ file, image }) => uploadImageToStorage(file, image)))
      await loadPhotos({ silent: true })
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : 'Unable to analyze uploaded files.')
    } finally {
      setIsAnalyzing(false)
    }
  }

  function toggleImageSelection(imageId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(imageId) ? next.delete(imageId) : next.add(imageId)
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
    if (mapRef.current && markerRef.current) {
      markerRef.current.setVisible(false)
      mapRef.current.setCenter(DEFAULT_MAP_CENTER)
      mapRef.current.setZoom(11)
    }
  }

  function resetFolderModalState() {
    setFolderName('')
    setFolderAddressQuery('')
    setFolderTypeOfPlace([])
    setFolderTagValues([])
    setFolderLocationDetails(EMPTY_LOCATION_DETAILS)
    setFolderAddressSuggestions([])
    setIsSearchingFolderAddress(false)
    setFolderStatusMessage('')
    if (folderMapRef.current && folderMarkerRef.current) {
      folderMarkerRef.current.setVisible(false)
      folderMapRef.current.setCenter(DEFAULT_MAP_CENTER)
      folderMapRef.current.setZoom(11)
    }
  }

  async function handleCreateFolder() {
    const trimmedName = folderName.trim()
    if (!trimmedName) return
    setIsSavingFolder(true)
    setFolderStatusMessage('')
    try {
      const r = await fetch('/api/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uploaderName: user.fullName,
          uploaderCode: user.code,
          folderName: trimmedName,
          fullAddress: folderLocationDetails.fullAddress ?? (normalizeChipValue(folderAddressQuery) || null),
          street: folderLocationDetails.street,
          city: folderLocationDetails.city,
          province: folderLocationDetails.province,
          zipCode: folderLocationDetails.zipCode,
          country: folderLocationDetails.country,
          latitude: folderLocationDetails.latitude,
          longitude: folderLocationDetails.longitude,
          typeOfPlace: folderTypeOfPlace,
          tags: folderTagValues,
        }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data?.error || 'Unable to create folder.')

      const createdFolder = data.folder as AlbumFolder
      setFolders((current) => [createdFolder, ...current])
      setActiveFolderId(createdFolder.id)
      setIsFolderModalOpen(false)
      resetFolderModalState()
      setAnalysisError('')
    } catch (error) {
      setFolderStatusMessage(error instanceof Error ? error.message : 'Unable to create folder.')
    } finally {
      setIsSavingFolder(false)
    }
  }

  async function persistImageTags(
    imageId: string,
    payload: {
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
    },
  ) {
    const image = uploadedImages.find((img) => img.id === imageId)
    if (!image?.dbId) return
    const r = await fetch(`/api/photos/${image.dbId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!r.ok) {
      const data = await r.json().catch(() => null)
      throw new Error(data?.error || 'Unable to save photo tags.')
    }
  }

  function handleTagImages() {
    const trimmed = tagPlaceName.trim()
    if (!trimmed) return
    const trimmedAddress = normalizeChipValue(tagAddressQuery)
    const typeOfPlace = [...tagTypeOfPlace]
    const tags = [...tagValues]
    const locationDetails = {
      ...tagLocationDetails,
      fullAddress: tagLocationDetails.fullAddress ?? (trimmedAddress || null),
    }
    setUploadedImages((imgs) =>
      imgs.map((img) =>
        selectedIds.has(img.id)
          ? { ...img, ...locationDetails, placeName: trimmed, tags, typeOfPlace, uploadError: null }
          : img,
      ),
    )
    const selectedImageIds = [...selectedIds]
    void Promise.allSettled(
      selectedImageIds.map(async (id) => {
        try {
          await persistImageTags(id, {
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
          updateUploadedImage(id, (img) => ({
            ...img,
            uploadError: error instanceof Error ? error.message : 'Unable to save tags.',
          }))
        }
      }),
    )
    setSelectedIds(new Set())
    setIsTagModalOpen(false)
    resetTagModalState()
  }

  // ─── File handlers ───────────────────────────────────────────────────────────

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files?.length) return
    void handleIncomingFiles(e.target.files)
    e.target.value = ''
  }

  // ─── Computed ────────────────────────────────────────────────────────────────

  const uploadingCount = uploadedImages.filter((img) => img.uploadStatus === 'uploading').length
  const totalStorageBytes = dbPhotos.reduce((sum, p) => sum + (p.file_size_bytes ?? 0), 0)
  const photosWithGps = dbPhotos.filter((p) => p.latitude != null).length
  const currentLightboxImage = lightboxIndex != null ? lightboxImages[lightboxIndex] ?? null : null

  const filteredDbPhotos = searchQuery.trim()
    ? dbPhotos.filter(
        (p) =>
          p.original_file_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (p.place_name ?? '').toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase())),
      )
    : dbPhotos

  const openedFolderPhotos = activeFolderId
    ? filteredDbPhotos.filter((photo) => photo.folder_id === activeFolderId)
    : []

  const uploadedLightboxItems: LightboxImage[] = uploadedImages.map((image) => ({
    id: image.id,
    src: image.imageUrl || image.previewUrl,
    alt: image.metadata.fileName,
    subtitle: image.placeName || image.fullAddress || undefined,
  }))

  const dbLightboxItems: LightboxImage[] = filteredDbPhotos.map((photo) => ({
    id: photo.id,
    src: photo.image_url,
    alt: photo.original_file_name,
    subtitle: photo.place_name || undefined,
  }))

  const openedFolderLightboxItems: LightboxImage[] = openedFolderPhotos.map((photo) => ({
    id: photo.id,
    src: photo.image_url,
    alt: photo.original_file_name,
    subtitle: photo.place_name || undefined,
  }))

  function formatCaptureDate(isoString: string | null) {
    if (!isoString) return 'Unknown'
    const parsed = new Date(isoString)
    if (Number.isNaN(parsed.getTime())) return 'Unknown'
    return new Intl.DateTimeFormat('en-PH', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(parsed)
  }

  function formatDeviceLabel(photo: DbPhoto) {
    const make = photo.device_make?.trim() || ''
    const model = photo.device_model?.trim() || ''
    const combined = `${make} ${model}`.trim()
    return combined || 'Unknown device'
  }

  const folderPhotoCountById = dbPhotos.reduce<Record<string, number>>((acc, photo) => {
    if (!photo.folder_id) return acc
    acc[photo.folder_id] = (acc[photo.folder_id] ?? 0) + 1
    return acc
  }, {})

  useEffect(() => {
    if (lightboxIndex == null) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeLightbox()
      if (event.key === 'ArrowRight') showNextLightboxImage()
      if (event.key === 'ArrowLeft') showPreviousLightboxImage()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [lightboxIndex, lightboxImages.length])

  // ─── Render ──────────────────────────────────────────────────────────────────

  if (!isAuthChecked) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#f6f8fc] px-4">
        <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
          <Spinner className="h-5 w-5 text-blue-500" />
          <p className="text-sm font-medium text-gray-700">Checking your session...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#f6f8fc] px-4">
        <div className="w-full max-w-md rounded-3xl border border-gray-200 bg-white p-6 shadow-lg">
          <h1 className="text-xl font-semibold text-gray-800">Enter Password</h1>
          <p className="mt-1 text-sm text-gray-500">
            Welcome, {user.firstName}. Enter your password to continue.
          </p>
          <p className="mt-1 text-xs text-gray-400">Code: {user.code}</p>

          <form className="mt-5 space-y-3" onSubmit={(e) => void handlePasswordLogin(e)}>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700" htmlFor="code-password-input">
                Password
              </label>
              <input
                autoFocus
                className="h-11 w-full rounded-xl border border-gray-300 px-3 text-sm text-gray-800 shadow-sm outline-none transition-shadow focus:ring-2 focus:ring-slate-950"
                id="code-password-input"
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="Enter your password"
                type="password"
                value={passwordInput}
              />
            </div>

            {authError ? (
              <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {authError}
              </p>
            ) : null}

            <button
              className="w-full rounded-xl bg-slate-950 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              disabled={isAuthenticating || !passwordInput.trim()}
              type="submit"
            >
              {isAuthenticating ? 'Verifying...' : 'Continue'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#f6f8fc]">

      {/* Hidden file input */}
      <input
        accept="image/*"
        className="sr-only"
        multiple
        onChange={handleFileChange}
        ref={fileInputRef}
        type="file"
      />

      {/* Mobile sidebar backdrop */}
      {isSidebarOpen ? (
        <div
          className="fixed inset-0 z-20 bg-black/20 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      ) : null}

      {/* ─── Top Bar ─────────────────────────────────────────────────────────── */}
      <header className="relative z-30 flex h-16 shrink-0 items-center gap-2 border-b border-gray-200 bg-white px-2 sm:px-4 shadow-sm">
        {/* Left: hamburger + logo */}
        <div className="flex shrink-0 items-center gap-1">
          <button
            aria-label="Toggle sidebar"
            className="flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-gray-100"
            onClick={() => setIsSidebarOpen((s) => !s)}
            type="button"
          >
            <Menu className="h-5 w-5 text-gray-600" />
          </button>
          <div className="flex items-center gap-2 px-1 select-none">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt="Homes Albums"
              className="h-8 w-auto shrink-0"
              src="/logo.png"
            />
          </div>
        </div>

        {/* Center: search */}
        <div className="mx-2 flex flex-1 max-w-2xl items-center gap-2 rounded-full bg-[#eaf1fb] px-4 py-2.5 transition-all hover:bg-[#dce8f8] focus-within:bg-white focus-within:shadow-md focus-within:ring-1 focus-within:ring-blue-200">
          <Search className="h-4 w-4 shrink-0 text-gray-500" />
          <input
            className="flex-1 bg-transparent text-sm text-gray-800 outline-none placeholder:text-gray-500"
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search in Homes Albums"
            type="search"
            value={searchQuery}
          />
          {searchQuery ? (
            <button
              className="text-gray-400 transition-colors hover:text-gray-600"
              onClick={() => setSearchQuery('')}
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        {/* Right: user avatar */}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <div
            className="flex h-9 w-9 select-none items-center justify-center rounded-full bg-slate-950 text-sm font-bold text-white"
            title={user.fullName}
          >
            {initials}
          </div>
        </div>
      </header>

      {/* ─── Body ─────────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Sidebar */}
        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-20 flex w-64 flex-col bg-white pt-16 transition-transform duration-200',
            'md:relative md:inset-auto md:z-auto md:pt-0 md:translate-x-0',
            isSidebarOpen ? 'translate-x-0 shadow-xl' : '-translate-x-full',
          )}
        >
          <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-3 py-4">
            {/* New upload button */}
            <div className="mb-2">
              <button
                className="flex items-center gap-2.5 rounded-2xl border border-gray-200 bg-white px-5 py-3.5 text-sm font-medium text-gray-700 shadow-md transition-colors hover:bg-gray-50"
                onClick={() => {
                  setActiveView('upload')
                  setIsSidebarOpen(false)
                  resetFolderModalState()
                  setIsFolderModalOpen(true)
                }}
                type="button"
              >
                <CloudUpload className="h-5 w-5 text-gray-500" />
                <span>New upload</span>
              </button>
            </div>

            {/* Nav */}
            <nav className="space-y-0.5">
              <SidebarNavItem
                active={activeView === 'upload'}
                badge={uploadedImages.length > 0 ? uploadedImages.length : undefined}
                icon={<Upload className="h-5 w-5" />}
                label="Upload"
                onClick={() => { setActiveView('upload'); setIsSidebarOpen(false) }}
              />
              <SidebarNavItem
                active={activeView === 'my-photos'}
                badge={dbPhotos.length > 0 ? dbPhotos.length : undefined}
                icon={<ImageIcon className="h-5 w-5" />}
                label="My Photos"
                onClick={() => { setActiveView('my-photos'); setIsSidebarOpen(false) }}
              />
            </nav>

            <div className="my-2 border-t border-gray-100" />

            {/* User info card */}
            <div className="rounded-2xl bg-gradient-to-br from-slate-50 to-gray-100 p-4 space-y-2">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-950 text-sm font-bold text-white select-none">
                  {initials}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-800">{user.fullName}</p>
                  <p className="truncate text-xs text-gray-400">{user.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 pt-1">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-orange-500" />
                <span className="text-xs font-medium text-gray-600">{user.areaFocused}</span>
              </div>
            </div>
          </div>
        </aside>

        {/* ─── Main content ────────────────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto">

          {/* Upload view */}
          {activeView === 'upload' ? (
            <div className="space-y-6 px-5 py-8 lg:px-10">

              {/* Welcome header */}
              <div>
                <h1 className="text-2xl font-semibold text-gray-800">
                  Good day, {user.firstName}!
                </h1>
                <p className="mt-1 text-sm text-gray-500">
                  Upload your photos from {user.areaFocused}. They'll be stored and organized automatically.
                </p>
              </div>

              <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm lg:p-5">
                {!activeFolder ? (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h2 className="text-base font-semibold text-gray-800">Folder locations</h2>
                        <p className="text-xs text-gray-500">Open a folder to upload and browse photos inside that location.</p>
                      </div>
                      <button
                        className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50"
                        onClick={() => {
                          resetFolderModalState()
                          setIsFolderModalOpen(true)
                        }}
                        type="button"
                      >
                        <CloudUpload className="h-3.5 w-3.5" />
                        New Folder Location
                      </button>
                    </div>

                    {folders.length > 0 ? (
                      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {folders.map((folder) => (
                          <button
                            key={folder.id}
                            className="group rounded-2xl border border-gray-200 bg-white p-3 text-left text-gray-700 shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
                            onClick={() => setActiveFolderId(folder.id)}
                            type="button"
                          >
                            <div className="mb-3 flex items-center gap-2">
                              <div className="rounded-xl bg-amber-100 p-2 text-amber-700 transition-colors group-hover:bg-amber-200">
                                <Folder className="h-8 w-8" />
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-gray-800">{folder.folder_name}</p>
                                <p className="text-[11px] text-gray-500">
                                  {folderPhotoCountById[folder.id] ?? 0} photo{(folderPhotoCountById[folder.id] ?? 0) !== 1 ? 's' : ''}
                                </p>
                              </div>
                            </div>
                            <p className="line-clamp-2 text-xs text-gray-500">
                              {folder.full_address || folder.city || 'No address'}
                            </p>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-3 rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500">
                        No folder location yet. Click New Folder Location to start.
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="rounded-2xl bg-amber-100 p-3 text-amber-700">
                          <FolderOpen className="h-9 w-9" />
                        </div>
                        <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                          Folders / {activeFolder.folder_name}
                        </p>
                        <h2 className="mt-1 text-lg font-semibold text-gray-900">{activeFolder.folder_name}</h2>
                        <p className="mt-1 text-xs text-gray-500">
                          {activeFolder.full_address || 'No full address set for this folder.'}
                        </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          className="rounded-full border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50"
                          onClick={() => setActiveFolderId(null)}
                          type="button"
                        >
                          Back to folders
                        </button>
                        <button
                          className="rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800"
                          onClick={() => fileInputRef.current?.click()}
                          type="button"
                        >
                          Upload in Folder
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {activeFolder.type_of_place.map((value) => (
                        <span key={`type-${value}`} className="rounded-full bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700">
                          {value}
                        </span>
                      ))}
                      {activeFolder.tags.map((value) => (
                        <span key={`tag-${value}`} className="rounded-full bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-700">
                          {value}
                        </span>
                      ))}
                    </div>

                    <div className="mt-4">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Photos in this folder · {openedFolderPhotos.length}
                        </p>
                        <div className="flex items-center gap-1 rounded-full border border-gray-200 bg-white p-1">
                          <button
                            aria-label="Folder grid view"
                            className={cn(
                              'flex h-7 w-7 items-center justify-center rounded-full transition-colors',
                              folderPhotosViewMode === 'grid'
                                ? 'bg-[#c2e7ff] text-[#001d35]'
                                : 'text-gray-400 hover:bg-gray-100',
                            )}
                            onClick={() => setFolderPhotosViewMode('grid')}
                            type="button"
                          >
                            <Grid3X3 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            aria-label="Folder list view"
                            className={cn(
                              'flex h-7 w-7 items-center justify-center rounded-full transition-colors',
                              folderPhotosViewMode === 'list'
                                ? 'bg-[#c2e7ff] text-[#001d35]'
                                : 'text-gray-400 hover:bg-gray-100',
                            )}
                            onClick={() => setFolderPhotosViewMode('list')}
                            type="button"
                          >
                            <List className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {openedFolderPhotos.length > 0 && folderPhotosViewMode === 'grid' ? (
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                          {openedFolderPhotos.slice(0, 12).map((photo, index) => (
                            <div
                              key={photo.id}
                              className="relative overflow-hidden rounded-xl border border-gray-100 bg-white"
                            >
                              <button
                                aria-label={`Delete ${photo.original_file_name}`}
                                className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white transition-colors hover:bg-black/75"
                                disabled={deletingPhotoIds.has(photo.id)}
                                onClick={() => void handleDeleteDbPhoto(photo.id)}
                                type="button"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                className="w-full transition-all hover:opacity-95"
                                onClick={() => openLightbox(openedFolderLightboxItems.slice(0, 12), index)}
                                type="button"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  alt={photo.original_file_name}
                                  className="aspect-square w-full object-cover"
                                  src={photo.image_url}
                                />
                                {deletingPhotoIds.has(photo.id) ? (
                                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/45">
                                    <Spinner className="h-6 w-6 text-white" />
                                    <span className="text-[11px] font-semibold text-white">Deleting...</span>
                                  </div>
                                ) : null}
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {openedFolderPhotos.length > 0 && folderPhotosViewMode === 'list' ? (
                        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
                          <div className="grid grid-cols-[2.5rem_1.5fr_1fr_1fr_auto_auto] items-center gap-3 border-b border-gray-100 px-4 py-2.5">
                            <span />
                            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">File</span>
                            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Date taken</span>
                            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Device</span>
                            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Size</span>
                            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Action</span>
                          </div>
                          {openedFolderPhotos.map((photo, index) => (
                            <div
                              key={photo.id}
                              className="grid grid-cols-[2.5rem_1.5fr_1fr_1fr_auto_auto] items-center gap-3 border-b border-gray-50 px-4 py-3 transition-colors last:border-0 hover:bg-gray-50"
                            >
                              <button
                                aria-label={`View ${photo.original_file_name}`}
                                className="h-10 w-10 overflow-hidden rounded-lg bg-gray-100"
                                onClick={() => openLightbox(openedFolderLightboxItems, index)}
                                type="button"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  alt={photo.original_file_name}
                                  className="h-full w-full object-cover"
                                  loading="lazy"
                                  src={photo.image_url}
                                />
                              </button>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-gray-800">{photo.original_file_name}</p>
                                <p className="mt-0.5 truncate text-xs text-gray-400">
                                  Uploaded {formatRelativeDate(photo.created_at)}
                                </p>
                              </div>
                              <span className="truncate text-xs text-gray-500">{formatCaptureDate(photo.capture_date)}</span>
                              <span className="truncate text-xs text-gray-500">{formatDeviceLabel(photo)}</span>
                              <span className="shrink-0 text-xs text-gray-500">{formatBytes(photo.file_size_bytes)}</span>
                              <button
                                aria-label={`Delete ${photo.original_file_name}`}
                                className="flex h-8 w-8 items-center justify-center rounded-full text-red-500 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:text-gray-300"
                                disabled={deletingPhotoIds.has(photo.id)}
                                onClick={() => void handleDeleteDbPhoto(photo.id)}
                                type="button"
                              >
                                {deletingPhotoIds.has(photo.id) ? (
                                  <Spinner className="h-4 w-4" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {openedFolderPhotos.length > 0 ? (
                        null
                      ) : (
                        <p className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500">
                          No photos in this folder yet. Upload to start building this folder.
                        </p>
                      )}
                    </div>
                  </>
                )}
              </section>

              {isAnalyzing ? (
                <div className="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
                  <Spinner className="h-5 w-5 text-blue-500" />
                  <p className="text-sm font-medium text-blue-700">Reading and uploading photos…</p>
                </div>
              ) : null}

              {analysisError ? (
                <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {analysisError}
                </p>
              ) : null}

              {/* Session uploads grid */}
              {activeFolder && uploadedImages.length > 0 ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-gray-700">
                      Upload queue · {uploadingCount} uploading · {uploadedImages.length} total in queue
                    </h2>
                    <button
                      className="text-xs font-medium text-blue-600 underline-offset-2 hover:underline"
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
                      const isBusy =
                        image.uploadStatus === 'uploading' || image.uploadStatus === 'deleting'

                      return (
                        <div
                          key={image.id}
                          className={cn(
                            'overflow-hidden rounded-2xl border bg-white shadow-sm transition-all',
                            selectedIds.has(image.id)
                              ? 'border-slate-950 ring-2 ring-slate-950'
                              : 'border-gray-100 hover:shadow-md',
                          )}
                        >
                          <button
                            className="relative block w-full text-left transition-all hover:opacity-95 active:scale-[0.99]"
                            onClick={() => toggleImageSelection(image.id)}
                            type="button"
                          >
                            <button
                              aria-label={`View ${image.metadata.fileName}`}
                              className="absolute left-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70"
                              onClick={(e) => {
                                e.stopPropagation()
                                const index = uploadedLightboxItems.findIndex((item) => item.id === image.id)
                                if (index >= 0) openLightbox(uploadedLightboxItems, index)
                              }}
                              type="button"
                            >
                              <Maximize2 className="h-3.5 w-3.5" />
                            </button>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              alt={image.metadata.fileName}
                              className="aspect-square w-full object-cover"
                              src={image.imageUrl || image.previewUrl}
                            />
                            {isBusy ? (
                              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40">
                                <Spinner className="h-7 w-7 text-white" />
                                <span className="text-[11px] font-semibold text-white">
                                  {image.uploadStatus === 'uploading' ? 'Uploading…' : 'Deleting…'}
                                </span>
                              </div>
                            ) : null}
                            {selectedIds.has(image.id) && !isBusy ? (
                              <div className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-slate-950">
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
                          <div className="p-2.5">
                            <p
                              className="truncate text-xs font-medium text-gray-800"
                              title={image.metadata.fileName}
                            >
                              {image.metadata.fileName}
                            </p>
                            <div className="mt-1 flex items-center justify-between gap-1">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={cn(
                                    'text-[11px] font-medium',
                                    image.uploadStatus === 'uploaded' && 'text-emerald-600',
                                    image.uploadStatus === 'uploading' && 'text-amber-600',
                                    image.uploadStatus === 'deleting' && 'text-slate-400',
                                    image.uploadStatus === 'error' && 'text-red-500',
                                  )}
                                >
                                  {image.uploadStatus === 'uploaded' && '✓ Uploaded'}
                                  {image.uploadStatus === 'uploading' && 'Uploading…'}
                                  {image.uploadStatus === 'deleting' && 'Deleting…'}
                                  {image.uploadStatus === 'error' && 'Failed'}
                                </span>
                                {hasGps ? (
                                  <span className="flex items-center gap-0.5 text-[11px] font-medium text-emerald-600">
                                    <MapPin className="h-2.5 w-2.5" />
                                    GPS
                                  </span>
                                ) : null}
                              </div>
                              <button
                                className="text-[11px] font-medium text-red-400 transition-colors hover:text-red-600 disabled:cursor-not-allowed disabled:text-gray-300"
                                disabled={isBusy}
                                onClick={() => void handleDeleteImage(image.id)}
                                type="button"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                            {image.uploadError ? (
                              <p className="mt-1 text-[10px] leading-tight text-red-500">
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
          ) : null}

          {/* My Photos view */}
          {activeView === 'my-photos' ? (
            <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">

              {/* Header */}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-semibold text-gray-800">My Photos</h1>
                  <p className="mt-1 text-sm text-gray-500">
                    All photos uploaded by {user.fullName}
                  </p>
                </div>
                <div className="flex items-center gap-1 rounded-full border border-gray-200 bg-white p-1 shadow-sm">
                  <button
                    aria-label="Grid view"
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-full transition-colors',
                      photosViewMode === 'grid'
                        ? 'bg-[#c2e7ff] text-[#001d35]'
                        : 'text-gray-400 hover:bg-gray-100',
                    )}
                    onClick={() => setPhotosViewMode('grid')}
                    type="button"
                  >
                    <Grid3X3 className="h-4 w-4" />
                  </button>
                  <button
                    aria-label="List view"
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-full transition-colors',
                      photosViewMode === 'list'
                        ? 'bg-[#c2e7ff] text-[#001d35]'
                        : 'text-gray-400 hover:bg-gray-100',
                    )}
                    onClick={() => setPhotosViewMode('list')}
                    type="button"
                  >
                    <List className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Stats row */}
              {!isLoadingPhotos && !photosError && dbPhotos.length > 0 ? (
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Total photos', value: String(dbPhotos.length) },
                    { label: 'Storage used', value: formatBytes(totalStorageBytes) },
                    { label: 'With GPS', value: String(photosWithGps) },
                  ].map(({ label, value }) => (
                    <div
                      key={label}
                      className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"
                    >
                      <p className="text-2xl font-bold text-gray-800">{value}</p>
                      <p className="mt-0.5 text-xs text-gray-400">{label}</p>
                    </div>
                  ))}
                </div>
              ) : null}

              {/* Loading */}
              {isLoadingPhotos ? (
                <div className="flex flex-col items-center justify-center gap-3 py-24">
                  <Spinner className="h-8 w-8 text-blue-400" />
                  <p className="text-sm text-gray-400">Loading your photos…</p>
                </div>
              ) : null}

              {/* Error */}
              {photosError ? (
                <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
                  {photosError}
                </div>
              ) : null}

              {/* Empty */}
              {!isLoadingPhotos && !photosError && dbPhotos.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-5 py-24">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gray-100">
                    <ImageIcon className="h-10 w-10 text-gray-300" />
                  </div>
                  <div className="text-center">
                    <p className="text-base font-semibold text-gray-700">No photos yet</p>
                    <p className="mt-1 text-sm text-gray-400">
                      Upload your first photo to get started.
                    </p>
                  </div>
                  <button
                    className="rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
                    onClick={() => setActiveView('upload')}
                    type="button"
                  >
                    Upload photos
                  </button>
                </div>
              ) : null}

              {/* Grid view */}
              {!isLoadingPhotos && !photosError && filteredDbPhotos.length > 0 && photosViewMode === 'grid' ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {filteredDbPhotos.map((photo, index) => (
                    <div
                      key={photo.id}
                      className="group overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition-shadow hover:shadow-md"
                    >
                      <button
                        className="relative block aspect-square w-full overflow-hidden bg-gray-50 text-left"
                        onClick={() => openLightbox(dbLightboxItems, index)}
                        type="button"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          alt={photo.original_file_name}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                          loading="lazy"
                          src={photo.image_url}
                        />
                        {photo.latitude != null ? (
                          <span className="absolute bottom-2 left-2 flex items-center gap-0.5 rounded-full bg-black/50 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                            <MapPin className="h-2.5 w-2.5" />
                            GPS
                          </span>
                        ) : null}
                      </button>
                      <div className="p-2.5">
                        <p
                          className="truncate text-xs font-medium text-gray-800"
                          title={photo.original_file_name}
                        >
                          {photo.original_file_name}
                        </p>
                        <p className="mt-0.5 text-[11px] text-gray-400">
                          {formatRelativeDate(photo.created_at)}
                        </p>
                        {photo.place_name ? (
                          <p className="mt-1 flex items-center gap-1 truncate text-[11px] font-medium text-orange-600">
                            <MapPin className="h-2.5 w-2.5 shrink-0" />
                            {photo.place_name}
                          </p>
                        ) : null}
                        {photo.tags.length > 0 ? (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {photo.tags.slice(0, 2).map((tag) => (
                              <span
                                key={tag}
                                className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600"
                              >
                                {tag}
                              </span>
                            ))}
                            {photo.tags.length > 2 ? (
                              <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-400">
                                +{photo.tags.length - 2}
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              {/* List view */}
              {!isLoadingPhotos && !photosError && filteredDbPhotos.length > 0 && photosViewMode === 'list' ? (
                <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                  <div className="grid grid-cols-[2.5rem_1fr_auto_auto] items-center gap-3 border-b border-gray-100 px-4 py-2.5">
                    <span />
                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">File name</span>
                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Size</span>
                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Date</span>
                  </div>
                  {filteredDbPhotos.map((photo, index) => (
                    <div
                      key={photo.id}
                      className="grid grid-cols-[2.5rem_1fr_auto_auto] items-center gap-3 border-b border-gray-50 px-4 py-3 transition-colors last:border-0 hover:bg-gray-50"
                    >
                      <button
                        aria-label={`View ${photo.original_file_name}`}
                        className="h-10 w-10 overflow-hidden rounded-lg bg-gray-100"
                        onClick={() => openLightbox(dbLightboxItems, index)}
                        type="button"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          alt={photo.original_file_name}
                          className="h-full w-full object-cover"
                          loading="lazy"
                          src={photo.image_url}
                        />
                      </button>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-gray-800">
                          {photo.original_file_name}
                        </p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2">
                          {photo.place_name ? (
                            <span className="flex items-center gap-0.5 text-xs text-orange-500">
                              <MapPin className="h-3 w-3" />
                              {photo.place_name}
                            </span>
                          ) : null}
                          {photo.tags.slice(0, 2).map((tag) => (
                            <span
                              key={tag}
                              className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                      <span className="shrink-0 text-xs text-gray-400">
                        {formatBytes(photo.file_size_bytes)}
                      </span>
                      <span className="shrink-0 text-xs text-gray-400">
                        {formatRelativeDate(photo.created_at)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}

              {/* Search no-results */}
              {!isLoadingPhotos && !photosError && dbPhotos.length > 0 && filteredDbPhotos.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-20">
                  <Search className="h-10 w-10 text-gray-200" />
                  <p className="text-sm text-gray-400">
                    No photos match &ldquo;
                    <span className="font-medium text-gray-600">{searchQuery}</span>&rdquo;
                  </p>
                  <button
                    className="text-sm text-blue-600 hover:underline"
                    onClick={() => setSearchQuery('')}
                    type="button"
                  >
                    Clear search
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </main>
      </div>

      {/* ─── Floating selection bar ───────────────────────────────────────────── */}
      {selectedIds.size > 0 ? (
        <div className="pointer-events-none fixed bottom-6 left-0 right-0 z-50 flex justify-center px-4">
          <div className="pointer-events-auto flex items-center gap-3 rounded-2xl bg-slate-950 px-5 py-3 shadow-2xl">
            <span className="text-sm font-medium text-white">
              {selectedIds.size} photo{selectedIds.size !== 1 ? 's' : ''} selected
            </span>
            <div className="h-4 w-px bg-white/20" />
            <button
              className="rounded-xl bg-white px-4 py-1.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-white/90"
              onClick={() => { resetTagModalState(); setIsTagModalOpen(true) }}
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

      {/* ─── Folder modal ─────────────────────────────────────────────────────── */}
      <Dialog
        open={isFolderModalOpen}
        onOpenChange={(open) => {
          if (!open) { setIsFolderModalOpen(false); resetFolderModalState() }
        }}
      >
        <DialogContent
          className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden rounded-3xl p-0 sm:max-w-lg"
          showCloseButton={false}
        >
          <div className="flex items-center justify-between border-b border-border/60 bg-white px-6 py-4">
            <div>
              <DialogTitle className="text-lg font-semibold leading-tight">New Folder Location</DialogTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Create a location folder to group and auto-tag uploads
              </p>
            </div>
            <button
              aria-label="Close"
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
              onClick={() => { setIsFolderModalOpen(false); resetFolderModalState() }}
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="px-6 pb-4 pt-5">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Location
              </p>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground" htmlFor="folder-name-input">
                    Folder name <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      autoFocus
                      className="h-12 w-full rounded-xl border border-border/70 bg-white px-4 pr-11 text-sm text-foreground shadow-sm transition-shadow focus:outline-none focus:ring-2 focus:ring-slate-950"
                      id="folder-name-input"
                      onChange={(e) => setFolderName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') void handleCreateFolder() }}
                      placeholder="e.g. Lahug Condo Exterior"
                      type="text"
                      value={folderName}
                    />
                    <button
                      aria-label="Search on map"
                      className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={!folderName.trim() || isSearchingFolderAddress}
                      onClick={() => void handleFolderPlaceNameSearch()}
                      type="button"
                    >
                      <Search className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground" htmlFor="folder-address-search-input">
                    Search address
                  </label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      autoComplete="off"
                      className="h-12 w-full rounded-xl border border-border/70 bg-white py-0 pl-10 pr-9 text-sm text-foreground shadow-sm transition-shadow focus:outline-none focus:ring-2 focus:ring-slate-950"
                      id="folder-address-search-input"
                      onChange={(e) => {
                        const v = e.target.value
                        setFolderAddressQuery(v)
                        folderDebouncedSearchRef.current?.(v)
                      }}
                      onKeyDown={(e) => { if (e.key === 'Escape') setFolderAddressSuggestions([]) }}
                      placeholder="Type to search an address..."
                      type="text"
                      value={folderAddressQuery}
                    />
                    {isSearchingFolderAddress ? (
                      <Spinner className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    ) : null}
                  </div>

                  {folderAddressSuggestions.length > 0 ? (
                    <ul className="mt-1 overflow-hidden rounded-xl border border-border/70 bg-white shadow-md">
                      {folderAddressSuggestions.map((s, i) => (
                        <li key={i}>
                          <button
                            className="w-full px-4 py-2.5 text-left text-sm text-foreground transition-colors hover:bg-muted/40 focus:bg-muted/40 focus:outline-none"
                            onClick={() => handleFolderAddressSelect(s)}
                            type="button"
                          >
                            {s.displayName}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>

                <div className="overflow-hidden rounded-xl border border-border/60 shadow-sm">
                  <div className="h-52 w-full" ref={folderMapContainerRef} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {folderStatusMessage || 'Select a suggested address or click the map to pin this folder location.'}
                </p>
              </div>
            </div>

            <div className="mx-6 border-t border-border/40" />

            <div className="px-6 pb-5 pt-4">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Classification
              </p>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground" htmlFor="folder-type-of-place-input">
                    Type Of Place
                  </label>
                  <ChipInput
                    disabled={placeTypeOptions.length === 0}
                    id="folder-type-of-place-input"
                    onChange={setFolderTypeOfPlace}
                    options={placeTypeOptions}
                    placeholder={placeTypeOptions.length ? 'Search place types...' : 'Loading place types...'}
                    values={folderTypeOfPlace}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground" htmlFor="folder-tags-input">
                    Tags
                  </label>
                  <ChipInput
                    disabled={tagOptions.length === 0}
                    id="folder-tags-input"
                    onChange={setFolderTagValues}
                    options={tagOptions}
                    placeholder={tagOptions.length ? 'Search tags...' : 'Loading tags...'}
                    values={folderTagValues}
                  />
                </div>

                {taxonomyError ? (
                  <p className="text-xs text-red-600">{taxonomyError}</p>
                ) : null}
              </div>
            </div>
          </div>

          <div className="border-t border-border/60 bg-white px-6 py-4">
            <div className="flex gap-3">
              <button
                className="flex-1 rounded-xl border border-border/70 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted/30"
                onClick={() => { setIsFolderModalOpen(false); resetFolderModalState() }}
                type="button"
              >
                Cancel
              </button>
              <button
                className="flex-1 rounded-xl bg-slate-950 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                disabled={!folderName.trim() || isSavingFolder}
                onClick={() => void handleCreateFolder()}
                type="button"
              >
                {isSavingFolder ? 'Saving...' : 'Create folder'}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Tag modal ────────────────────────────────────────────────────────── */}
      <Dialog
        open={lightboxIndex != null && currentLightboxImage != null}
        onOpenChange={(open) => {
          if (!open) closeLightbox()
        }}
      >
        <DialogContent
          className="overflow-hidden border-0 bg-black p-0 sm:max-w-6xl"
          showCloseButton={false}
        >
          {currentLightboxImage ? (
            <div className="relative">
              <button
                aria-label="Close lightbox"
                className="absolute right-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70"
                onClick={closeLightbox}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>

              {lightboxImages.length > 1 ? (
                <>
                  <button
                    aria-label="Previous photo"
                    className="absolute left-3 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70"
                    onClick={showPreviousLightboxImage}
                    type="button"
                  >
                    <span className="text-lg">‹</span>
                  </button>
                  <button
                    aria-label="Next photo"
                    className="absolute right-3 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70"
                    onClick={showNextLightboxImage}
                    type="button"
                  >
                    <span className="text-lg">›</span>
                  </button>
                </>
              ) : null}

              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt={currentLightboxImage.alt}
                className="max-h-[85vh] w-full object-contain"
                src={currentLightboxImage.src}
              />

              <div className="flex items-center justify-between bg-black/70 px-4 py-3 text-white backdrop-blur-sm">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{currentLightboxImage.alt}</p>
                  {currentLightboxImage.subtitle ? (
                    <p className="truncate text-xs text-white/70">{currentLightboxImage.subtitle}</p>
                  ) : null}
                </div>
                <p className="shrink-0 text-xs text-white/70">
                  {(lightboxIndex ?? 0) + 1} / {lightboxImages.length}
                </p>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* ─── Tag modal ────────────────────────────────────────────────────────── */}
      <Dialog
        open={isTagModalOpen}
        onOpenChange={(open) => {
          if (!open) { setIsTagModalOpen(false); resetTagModalState() }
        }}
      >
        <DialogContent
          className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden rounded-3xl p-0 sm:max-w-lg"
          showCloseButton={false}
        >
          {/* Modal header */}
          <div className="flex items-center justify-between border-b border-border/60 bg-white px-6 py-4">
            <div>
              <DialogTitle className="text-lg font-semibold leading-tight">Tag photos</DialogTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Tagging {selectedIds.size} photo{selectedIds.size !== 1 ? 's' : ''}
              </p>
            </div>
            <button
              aria-label="Close"
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
              onClick={() => { setIsTagModalOpen(false); resetTagModalState() }}
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Modal body */}
          <div className="flex-1 overflow-y-auto">
            {/* Location section */}
            <div className="px-6 pb-4 pt-5">
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
                      onKeyDown={(e) => { if (e.key === 'Enter') handleTagImages() }}
                      placeholder="e.g. SM City Cebu"
                      type="text"
                      value={tagPlaceName}
                    />
                    <button
                      aria-label="Search on map"
                      className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={!tagPlaceName.trim() || isSearchingAddress}
                      onClick={() => void handlePlaceNameSearch()}
                      type="button"
                    >
                      <Search className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground" htmlFor="address-search-input">
                    Search address
                  </label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      autoComplete="off"
                      className="h-12 w-full rounded-xl border border-border/70 bg-white py-0 pl-10 pr-9 text-sm text-foreground shadow-sm transition-shadow focus:outline-none focus:ring-2 focus:ring-slate-950"
                      id="address-search-input"
                      onChange={(e) => {
                        const v = e.target.value
                        setTagAddressQuery(v)
                        debouncedSearchRef.current?.(v)
                      }}
                      onKeyDown={(e) => { if (e.key === 'Escape') setAddressSuggestions([]) }}
                      placeholder="Type to search an address…"
                      type="text"
                      value={tagAddressQuery}
                    />
                    {isSearchingAddress ? (
                      <Spinner className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    ) : null}
                  </div>

                  {addressSuggestions.length > 0 ? (
                    <ul className="mt-1 overflow-hidden rounded-xl border border-border/70 bg-white shadow-md">
                      {addressSuggestions.map((s, i) => (
                        <li key={i}>
                          <button
                            className="w-full px-4 py-2.5 text-left text-sm text-foreground transition-colors hover:bg-muted/40 focus:bg-muted/40 focus:outline-none"
                            onClick={() => handleAddressSelect(s)}
                            type="button"
                          >
                            {s.displayName}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>

                <div className="overflow-hidden rounded-xl border border-border/60 shadow-sm">
                  <div className="h-52 w-full" ref={mapContainerRef} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {mapStatusMessage || 'Select a suggested address or click the map to pin a location.'}
                </p>
              </div>
            </div>

            <div className="mx-6 border-t border-border/40" />

            {/* Classification section */}
            <div className="px-6 pb-5 pt-4">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Classification
              </p>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground" htmlFor="type-of-place-input">
                    Type Of Place
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Choose from the approved place types.
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
                    Choose from the approved internal tags.
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

          {/* Modal footer */}
          <div className="border-t border-border/60 bg-white px-6 py-4">
            <div className="flex gap-3">
              <button
                className="flex-1 rounded-xl border border-border/70 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted/30"
                onClick={() => { setIsTagModalOpen(false); resetTagModalState() }}
                type="button"
              >
                Cancel
              </button>
              <button
                className="flex-1 rounded-xl bg-slate-950 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                disabled={!tagPlaceName.trim()}
                onClick={handleTagImages}
                type="button"
              >
                Save tags
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
