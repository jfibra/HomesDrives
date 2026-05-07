'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  ArrowRight,
  Check,
  CheckCircle2,
  CheckSquare,
  CloudUpload,
  Copy,
  Download,
  Filter,
  Folder,
  FolderOpen,
  Grid3X3,
  ImageIcon,
  List,
  LogOut,
  MapPin,
  Maximize2,
  Menu,
  MoreHorizontal,
  Pencil,
  Search,
  Share2,
  StickyNote,
  Trash2,
  Upload,
  X,
} from 'lucide-react'

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import {
  MAX_AVATAR_UPLOAD_BYTES,
  MAX_PHOTO_UPLOAD_BYTES,
  TARGET_STORED_PHOTO_BYTES,
} from '@/lib/photo-upload-limits'
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
  lastName: string
  phoneNumber: string
  areaFocused: string
  email: string
  code: string
  avatarUrl?: string | null
  role: 'media' | 'customer'
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
  notes?: string | null
  status?: string
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
  let metadata: Record<string, unknown> | null = null
  try {
    metadata = (await exifr.parse(file, {
      gps: true, exif: true, iptc: true, tiff: true, xmp: true, sanitize: true,
    })) as Record<string, unknown> | null
  } catch {
    // Some images contain malformed EXIF/XMP blocks; keep upload working without metadata.
    metadata = null
  }
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
        'flex w-full items-center gap-3 py-3 px-6 text-sm transition-all text-left',
        active
          ? 'font-semibold border-r-4'
          : 'font-medium hover:opacity-80',
      )}
      style={active ? {
        backgroundColor: 'var(--ds-surface-container)',
        color: 'var(--ds-primary)',
        borderRightColor: 'var(--ds-primary)',
      } : {
        color: 'var(--ds-on-surface-variant)',
      }}
      type="button"
    >
      <span className="shrink-0">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {badge != null ? (
        <span
          className="ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
          style={{
            backgroundColor: 'var(--ds-surface-container-high)',
            color: 'var(--ds-on-surface-variant)',
          }}
        >
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

function ProfileAvatarBubble({
  avatarUrl,
  initials,
  sizeClasses,
}: {
  avatarUrl?: string | null
  initials: string
  sizeClasses: string
}) {
  if (avatarUrl) {
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt=""
          className={cn('shrink-0 rounded-full object-cover', sizeClasses)}
          src={avatarUrl}
        />
      </>
    )
  }
  return (
    <div
      className={cn(
        'flex shrink-0 select-none items-center justify-center rounded-full font-bold text-white',
        sizeClasses,
      )}
      style={{ backgroundColor: 'var(--ds-primary)' }}
    >
      {initials}
    </div>
  )
}

// ─── DashboardClient ──────────────────────────────────────────────────────────

export default function DashboardClient({ user }: { user: DashboardUser }) {
  const router = useRouter()
  const [liveUser, setLiveUser] = useState<DashboardUser>(user)
  useEffect(() => {
    setLiveUser(user)
  }, [user])

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

  // Folder modal mode (create vs edit)
  const [folderModalMode, setFolderModalMode] = useState<'create' | 'edit'>('create')
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null)

  // Folder delete confirm
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<AlbumFolder | null>(null)
  const [deleteFolderOption, setDeleteFolderOption] = useState<'unfile' | 'delete-all'>('unfile')
  const [isDeletingFolder, setIsDeletingFolder] = useState(false)
  const [deleteFolderError, setDeleteFolderError] = useState('')

  // Folder notes
  const [isFolderNotesOpen, setIsFolderNotesOpen] = useState(false)
  const [editingNotesValue, setEditingNotesValue] = useState('')
  const [isSavingNotes, setIsSavingNotes] = useState(false)
  const [notesStatusMsg, setNotesStatusMsg] = useState('')

  // Folder archive
  const [updatingFolderStatusId, setUpdatingFolderStatusId] = useState<string | null>(null)
  const [showArchivedFolders, setShowArchivedFolders] = useState(false)

  // My Photos — bulk select
  const [isBulkMode, setIsBulkMode] = useState(false)
  const [selectedDbPhotoIds, setSelectedDbPhotoIds] = useState<Set<string>>(new Set())
  const [isBulkDeleting, setIsBulkDeleting] = useState(false)

  // Move photo to folder
  const [moveModalTargetIds, setMoveModalTargetIds] = useState<string[]>([])
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false)
  const [moveTargetFolderId, setMoveTargetFolderId] = useState<string>('')
  const [movingPhotoIds, setMovingPhotoIds] = useState<Set<string>>(new Set())
  const [isMoveSubmitting, setIsMoveSubmitting] = useState(false)
  const [moveSearchQuery, setMoveSearchQuery] = useState('')

  // Opened folder - bulk select / move
  const [isFolderBulkMode, setIsFolderBulkMode] = useState(false)
  const [selectedFolderPhotoIds, setSelectedFolderPhotoIds] = useState<Set<string>>(new Set())

  // My Photos — filters
  const [photosFilterFolderId, setPhotosFilterFolderId] = useState<string>('')
  const [photosFilterGpsOnly, setPhotosFilterGpsOnly] = useState(false)
  const [photosFilterUntagged, setPhotosFilterUntagged] = useState(false)

  // Duplicate detection (filenames already in the active folder)
  const [duplicateWarnings, setDuplicateWarnings] = useState<string[]>([])

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
  const rearCameraInputRef = useRef<HTMLInputElement | null>(null)
  const frontCameraInputRef = useRef<HTMLInputElement | null>(null)
  const previewUrlsRef = useRef<string[]>([])
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<any>(null)
  const markerRef = useRef<any>(null)
  const debouncedSearchRef = useRef<((...args: Parameters<(q: string) => void>) => void) | null>(null)
  const folderMapContainerRef = useRef<HTMLDivElement | null>(null)
  const folderMapRef = useRef<any>(null)
  const folderMarkerRef = useRef<any>(null)
  const folderDebouncedSearchRef = useRef<((...args: Parameters<(q: string) => void>) => void) | null>(null)
  const profileAvatarInputRef = useRef<HTMLInputElement | null>(null)

  const initialsRaw = `${liveUser.firstName?.[0] ?? ''}${liveUser.lastName?.[0] ?? ''}`.trim()
  const initials = (initialsRaw || '?').toUpperCase()
  const authStorageKey = `homes-albums-auth:${user.code}`

  const [isAuthChecked, setIsAuthChecked] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [emailInput, setEmailInput] = useState('')
  const [passwordInput, setPasswordInput] = useState('')
  const [authError, setAuthError] = useState('')
  const [isAuthenticating, setIsAuthenticating] = useState(false)

  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [profileFirstName, setProfileFirstName] = useState('')
  const [profileLastName, setProfileLastName] = useState('')
  const [profilePhone, setProfilePhone] = useState('')
  const [profileArea, setProfileArea] = useState('')
  const [profileError, setProfileError] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)
  const [avatarUploading, setAvatarUploading] = useState(false)

  async function handlePasswordLogin(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault()

    if (!emailInput.trim()) {
      setAuthError('Please enter your email address.')
      return
    }

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
          email: emailInput.trim().toLowerCase(),
          password: passwordInput,
          code: user.code,
        }),
      })

      const data = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(data?.error || 'Invalid email or password.')
      }

      localStorage.setItem(authStorageKey, '1')
      setIsAuthenticated(true)
      setEmailInput('')
      setPasswordInput('')
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Unable to log in right now.')
      setIsAuthenticated(false)
    } finally {
      setIsAuthenticating(false)
    }
  }

  function handleLogout() {
    localStorage.removeItem(authStorageKey)
    localStorage.removeItem('homes-admin-context')
    setIsAuthenticated(false)
    setIsSidebarOpen(false)
  }

  function openProfileModal() {
    setProfileFirstName(liveUser.firstName)
    setProfileLastName(liveUser.lastName)
    setProfilePhone(liveUser.phoneNumber)
    setProfileArea(liveUser.areaFocused)
    setProfileError('')
    setIsProfileOpen(true)
  }

  async function handleSaveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setProfileSaving(true)
    setProfileError('')
    try {
      const response = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uploaderCode: user.code,
          firstName: profileFirstName,
          lastName: profileLastName,
          phoneNumber: profilePhone,
          areaFocused: profileArea,
        }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(data?.error || 'Could not save profile.')
      }
      const u = data.user as {
        fullName: string
        firstName: string
        lastName: string
        phoneNumber: string
        areaFocused: string
        avatarUrl?: string | null
      }
      setLiveUser((prev) => ({
        ...prev,
        fullName: u.fullName,
        firstName: u.firstName,
        lastName: u.lastName,
        phoneNumber: u.phoneNumber,
        areaFocused: u.areaFocused,
        avatarUrl: u.avatarUrl ?? prev.avatarUrl,
      }))
      setIsProfileOpen(false)
      router.refresh()
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : 'Could not save profile.')
    } finally {
      setProfileSaving(false)
    }
  }

  async function handleProfileAvatarPick(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setProfileError('Please choose an image file.')
      return
    }
    if (file.size > MAX_AVATAR_UPLOAD_BYTES) {
      setProfileError(
        `Avatar must be ${MAX_AVATAR_UPLOAD_BYTES / (1024 * 1024)} MB or smaller.`,
      )
      return
    }
    setAvatarUploading(true)
    setProfileError('')
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('uploaderCode', user.code)
      const response = await fetch('/api/user/avatar', { method: 'POST', body: formData })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(data?.error || 'Could not upload avatar.')
      }
      setLiveUser((prev) => ({ ...prev, avatarUrl: data.avatarUrl as string }))
      router.refresh()
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : 'Could not upload avatar.')
    } finally {
      setAvatarUploading(false)
      if (profileAvatarInputRef.current) profileAvatarInputRef.current.value = ''
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
        `/api/photos?uploader=${encodeURIComponent(liveUser.fullName)}&uploaderCode=${encodeURIComponent(user.code)}`,
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
  }, [isAuthenticated, liveUser.fullName, user.code])

  useEffect(() => {
    if (!isAuthenticated) return
    if (activeView !== 'my-photos') return
    void loadPhotos()
  }, [activeView, isAuthenticated])

  useEffect(() => {
    if (!isAuthenticated) return
    void loadFolders()
  }, [isAuthenticated, liveUser.fullName, user.code])

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
        // Pre-populate marker when in edit mode
        if (editingFolderId) {
          const editTarget = folders.find((f) => f.id === editingFolderId)
          if (editTarget?.latitude && editTarget?.longitude) {
            const pos = { lat: editTarget.latitude, lng: editTarget.longitude }
            folderMarkerRef.current.setPosition(pos)
            folderMarkerRef.current.setVisible(true)
            folderMapRef.current.setCenter(pos)
            folderMapRef.current.setZoom(15)
          }
        }
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
        `/api/folders?uploader=${encodeURIComponent(liveUser.fullName)}&uploaderCode=${encodeURIComponent(user.code)}`,
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

  async function handleUseCurrentLocationForFolder() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setFolderStatusMessage('Geolocation is not supported on this device/browser.')
      return
    }
    setIsSearchingFolderAddress(true)
    setFolderStatusMessage('Getting your current location...')

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude
        const lng = position.coords.longitude

        setFolderLocationDetails((current) => ({
          ...current,
          latitude: lat,
          longitude: lng,
        }))

        if (folderMapRef.current && folderMarkerRef.current) {
          const pin = { lat, lng }
          folderMarkerRef.current.setPosition(pin)
          folderMarkerRef.current.setVisible(true)
          folderMapRef.current.panTo(pin)
          folderMapRef.current.setZoom(16)
        }

        try {
          const r = await fetch(
            `/api/geocode?lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lng))}`,
          )
          const data = await r.json()
          if (r.ok && data?.suggestion) {
            handleFolderAddressSelect(data.suggestion as AddressSuggestion)
            setFolderStatusMessage('Using your current location.')
          } else {
            setFolderAddressQuery(`${lat.toFixed(6)}, ${lng.toFixed(6)}`)
            setFolderStatusMessage(data?.error || 'Pinned your current location on the map.')
          }
        } catch {
          setFolderAddressQuery(`${lat.toFixed(6)}, ${lng.toFixed(6)}`)
          setFolderStatusMessage('Pinned your current location on the map.')
        } finally {
          setIsSearchingFolderAddress(false)
        }
      },
      (error) => {
        setIsSearchingFolderAddress(false)
        if (error.code === error.PERMISSION_DENIED) {
          setFolderStatusMessage('Location permission was denied. Please allow it in your browser settings.')
          return
        }
        setFolderStatusMessage('Unable to get your current location.')
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  // ─── Upload helpers ───────────────────────────────────────────────────────────

  function updateUploadedImage(imageId: string, updater: (image: UploadedImage) => UploadedImage) {
    setUploadedImages((imgs) => imgs.map((img) => (img.id === imageId ? updater(img) : img)))
  }

  async function uploadImageToStorage(file: File, image: UploadedImage) {
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('uploaderName', liveUser.fullName)
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

    const oversize = files.filter((f) => f.size > MAX_PHOTO_UPLOAD_BYTES)
    if (oversize.length > 0) {
      const mb = MAX_PHOTO_UPLOAD_BYTES / (1024 * 1024)
      const detail = oversize.map((f) => `${f.name} (${formatBytes(f.size)})`).join(', ')
      setAnalysisError(`Each photo must be at most ${mb} MB. Too large: ${detail}`)
      return
    }

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
    setFolderModalMode('create')
    setEditingFolderId(null)
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
          uploaderName: liveUser.fullName,
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

  // ─── Open edit folder modal ───────────────────────────────────────────────

  function openEditFolderModal(folder: AlbumFolder) {
    setFolderModalMode('edit')
    setEditingFolderId(folder.id)
    setFolderName(folder.folder_name)
    setFolderAddressQuery(folder.full_address ?? '')
    setFolderTypeOfPlace([...folder.type_of_place])
    setFolderTagValues([...folder.tags])
    setFolderLocationDetails({
      city: folder.city,
      country: folder.country,
      fullAddress: folder.full_address,
      latitude: folder.latitude,
      longitude: folder.longitude,
      province: folder.province,
      street: folder.street,
      zipCode: folder.zip_code,
    })
    setIsFolderModalOpen(true)
  }

  async function handleUpdateFolder() {
    const trimmedName = folderName.trim()
    if (!trimmedName || !editingFolderId) return
    setIsSavingFolder(true)
    setFolderStatusMessage('')
    try {
      const r = await fetch(`/api/folders/${editingFolderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
      if (!r.ok) throw new Error(data?.error || 'Unable to update folder.')
      const updated = data.folder as AlbumFolder
      setFolders((current) =>
        current.map((f) => (f.id === updated.id ? { ...f, ...updated } : f)),
      )
      setIsFolderModalOpen(false)
      resetFolderModalState()
    } catch (error) {
      setFolderStatusMessage(error instanceof Error ? error.message : 'Unable to update folder.')
    } finally {
      setIsSavingFolder(false)
    }
  }

  // ─── Folder delete ────────────────────────────────────────────────────────

  async function handleDeleteFolder() {
    if (!deleteFolderTarget) return
    setIsDeletingFolder(true)
    setDeleteFolderError('')
    try {
      const withPhotos = deleteFolderOption === 'delete-all'
      const r = await fetch(
        `/api/folders/${deleteFolderTarget.id}?uploaderCode=${encodeURIComponent(user.code)}&withPhotos=${withPhotos}`,
        { method: 'DELETE' },
      )
      const data = await r.json()
      if (!r.ok) throw new Error(data?.error || 'Unable to delete folder.')
      setFolders((current) => current.filter((f) => f.id !== deleteFolderTarget.id))
      if (activeFolderId === deleteFolderTarget.id) setActiveFolderId(null)
      if (withPhotos) {
        setDbPhotos((current) =>
          current.filter((p) => p.folder_id !== deleteFolderTarget.id),
        )
      } else {
        setDbPhotos((current) =>
          current.map((p) =>
            p.folder_id === deleteFolderTarget.id ? { ...p, folder_id: null } : p,
          ),
        )
      }
      setDeleteFolderTarget(null)
    } catch (error) {
      setDeleteFolderError(error instanceof Error ? error.message : 'Unable to delete folder.')
    } finally {
      setIsDeletingFolder(false)
    }
  }

  // ─── Folder archive toggle ────────────────────────────────────────────────

  async function handleArchiveToggle(folder: AlbumFolder) {
    if (updatingFolderStatusId) return
    const newStatus = (folder.status ?? 'active') === 'active' ? 'archived' : 'active'
    setUpdatingFolderStatusId(folder.id)
    // Optimistic update
    setFolders((current) =>
      current.map((f) => (f.id === folder.id ? { ...f, status: newStatus } : f)),
    )
    try {
      const r = await fetch(`/api/folders/${folder.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploaderCode: user.code, status: newStatus }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data?.error || 'Unable to update folder status.')
      setFolders((current) =>
        current.map((f) => (f.id === folder.id ? { ...f, ...data.folder } : f)),
      )
    } catch {
      // Rollback
      setFolders((current) =>
        current.map((f) =>
          f.id === folder.id ? { ...f, status: folder.status ?? 'active' } : f,
        ),
      )
    } finally {
      setUpdatingFolderStatusId(null)
    }
  }

  // ─── Folder notes ─────────────────────────────────────────────────────────

  async function handleSaveFolderNotes() {
    if (!activeFolderId || isSavingNotes) return
    setIsSavingNotes(true)
    setNotesStatusMsg('')
    try {
      const r = await fetch(`/api/folders/${activeFolderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploaderCode: user.code, notes: editingNotesValue }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data?.error || 'Unable to save notes.')
      setFolders((current) =>
        current.map((f) => (f.id === activeFolderId ? { ...f, notes: editingNotesValue } : f)),
      )
      setNotesStatusMsg('Saved')
      window.setTimeout(() => setNotesStatusMsg(''), 2000)
    } catch (error) {
      setNotesStatusMsg(error instanceof Error ? error.message : 'Unable to save notes.')
    } finally {
      setIsSavingNotes(false)
    }
  }

  // ─── My Photos bulk select ────────────────────────────────────────────────

  function toggleDbPhotoSelection(photoId: string) {
    setSelectedDbPhotoIds((prev) => {
      const next = new Set(prev)
      next.has(photoId) ? next.delete(photoId) : next.add(photoId)
      return next
    })
  }

  async function handleBulkDeleteDbPhotos() {
    if (!selectedDbPhotoIds.size || isBulkDeleting) return
    setIsBulkDeleting(true)
    const ids = [...selectedDbPhotoIds]
    const previousPhotos = dbPhotos
    setDbPhotos((current) => current.filter((p) => !ids.includes(p.id)))
    setSelectedDbPhotoIds(new Set())
    try {
      await Promise.all(
        ids.map(async (id) => {
          const r = await fetch(`/api/photos/${id}`, { method: 'DELETE' })
          const data = await r.json()
          if (!r.ok) throw new Error(data?.error || `Unable to delete photo ${id}.`)
        }),
      )
      await loadPhotos({ silent: true })
    } catch {
      setDbPhotos(previousPhotos)
      setSelectedDbPhotoIds(new Set(ids))
    } finally {
      setIsBulkDeleting(false)
    }
  }

  // ─── Move photo to folder ─────────────────────────────────────────────────

  function openMoveModal(photoIds: string[]) {
    setMoveModalTargetIds(photoIds)
    setMoveTargetFolderId('')
    setIsMoveModalOpen(true)
  }

  async function handleMovePhotos() {
    if (!moveTargetFolderId || !moveModalTargetIds.length || isMoveSubmitting) return
    setIsMoveSubmitting(true)
    const ids = [...moveModalTargetIds]
    setMovingPhotoIds(new Set(ids))
    try {
      await Promise.all(
        ids.map(async (photoId) => {
          const r = await fetch(`/api/photos/${photoId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'move',
              targetFolderId: moveTargetFolderId === '__unfile__' ? null : moveTargetFolderId,
              uploaderCode: user.code,
            }),
          })
          const data = await r.json()
          if (!r.ok) throw new Error(data?.error || 'Unable to move photo.')
        }),
      )
      await loadPhotos({ silent: true })
      setSelectedDbPhotoIds(new Set())
      setIsBulkMode(false)
      setSelectedFolderPhotoIds(new Set())
      setIsFolderBulkMode(false)
      setIsMoveModalOpen(false)
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : 'Unable to move photos.')
    } finally {
      setMovingPhotoIds(new Set())
      setIsMoveSubmitting(false)
    }
  }

  // ─── Download photo ───────────────────────────────────────────────────────

  async function downloadPhoto(url: string, fileName: string) {
    try {
      const response = await fetch(url)
      const blob = await response.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(blobUrl)
    } catch {
      window.open(url, '_blank')
    }
  }

  // ─── Copy folder share link ───────────────────────────────────────────────

  function copyFolderShareLink(folder: AlbumFolder) {
    const base = typeof window !== 'undefined' ? window.location.origin : ''
    const q = folder.city || folder.folder_name
    const url = `${base}/?q=${encodeURIComponent(q)}`
    void navigator.clipboard.writeText(url).catch(() => null)
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

  function handleCameraFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files?.length) return
    void handleIncomingFiles(e.target.files)
    e.target.value = ''
  }

  function toggleFolderPhotoSelection(photoId: string) {
    setSelectedFolderPhotoIds((prev) => {
      const next = new Set(prev)
      next.has(photoId) ? next.delete(photoId) : next.add(photoId)
      return next
    })
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

  const filteredDbPhotosWithFilters = filteredDbPhotos.filter((p) => {
    if (photosFilterFolderId === '__unassigned__' && p.folder_id != null) return false
    if (photosFilterFolderId && photosFilterFolderId !== '__unassigned__' && p.folder_id !== photosFilterFolderId) return false
    if (photosFilterGpsOnly && (p.latitude == null || p.longitude == null)) return false
    if (photosFilterUntagged && p.tags.length > 0) return false
    return true
  })

  const activeFolders = folders.filter((f) => (f.status ?? 'active') !== 'archived')
  const archivedFolders = folders.filter((f) => (f.status ?? 'active') === 'archived')
  const displayedFolders = showArchivedFolders ? archivedFolders : activeFolders
  const hasPhotosFilters = !!(photosFilterFolderId || photosFilterGpsOnly || photosFilterUntagged)

  const openedFolderPhotos = activeFolderId
    ? dbPhotos.filter((photo) => photo.folder_id === activeFolderId)
    : []

  const uploadedLightboxItems: LightboxImage[] = uploadedImages.map((image) => ({
    id: image.id,
    src: image.imageUrl || image.previewUrl,
    alt: image.metadata.fileName,
    subtitle: image.placeName || image.fullAddress || undefined,
  }))

  const dbLightboxItems: LightboxImage[] = filteredDbPhotosWithFilters.map((photo) => ({
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
    setSelectedFolderPhotoIds(new Set())
    setIsFolderBulkMode(false)
  }, [activeFolderId])

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
      <div
        className="flex h-screen flex-col items-center justify-center gap-6 px-4"
        style={{ backgroundColor: 'var(--ds-surface-container-low)' }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt="Homes.ph Drive"
          className="h-20 w-auto object-contain"
          src="/HomesPH.gif"
        />
        <p className="text-label-caps" style={{ color: 'var(--ds-on-surface-variant)', letterSpacing: '0.12em' }}>
          Checking your session...
        </p>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div
        className="relative flex min-h-screen w-full items-center justify-center overflow-hidden p-8"
        style={{ backgroundColor: 'var(--ds-surface)' }}
      >
        {/* Hero background */}
        <div className="absolute inset-0 z-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt="Architectural interior background"
            className="h-full w-full object-cover"
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuDpxTS0DczftdlIjSqE_KkPp0ZGAAI6Y9i3e1q1I8Cwu85L2s9JgnTSiSLn10J-qhaSGvT8BWz__PkS_tbosdTJl0t0lke7QNSFCmIuL4FU0fLJsZnt2hAqJKy1SxChfwry1pHEuZxqPIOipTWTU1R075I-lnB8bH9LeJFZV5OD8RoK1kavZAAv5nBpFAJUJuCwGqxehKYx3sSd9BxHgzTT0FqVbOsG2c06MH2oZpkMMPZ-RzDkrZNMz8Rc3Q8kiVqIQLypd7fRqBw"
          />
          <div
            className="absolute inset-0"
            style={{ background: 'linear-gradient(rgba(255,255,255,0.4), rgba(255,255,255,0.6))', backdropFilter: 'blur(4px)' }}
          />
        </div>

        {/* Top logo */}
        <header className="fixed inset-x-0 top-0 z-50 flex justify-center py-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt="Homes.ph Drive"
            className="h-14 w-auto object-contain"
            src="/HomesPH.gif"
          />
        </header>

        {/* Login card */}
        <main className="relative z-10 w-full max-w-[480px]">
          <div
            className="flex flex-col gap-8 rounded-xl border p-10"
            style={{
              backgroundColor: 'rgba(255,255,255,0.9)',
              backdropFilter: 'blur(12px)',
              borderColor: 'rgba(196,198,207,0.3)',
              boxShadow: '0 32px 64px -12px rgba(0,32,69,0.15)',
            }}
          >
            {/* Header */}
            <div className="space-y-3 text-center">
              <h1
                className="text-headline-lg"
                style={{ color: 'var(--ds-on-surface)' }}
              >
                Welcome back
              </h1>
              <p
                className="text-label-caps"
                style={{ color: 'var(--ds-on-surface-variant)', fontSize: '11px', letterSpacing: '0.08em' }}
              >
                Sign in to access your dashboard
              </p>
            </div>

            {/* Form */}
            <form className="flex flex-col gap-6" onSubmit={(e) => void handlePasswordLogin(e)}>
              {/* Email */}
              <div className="space-y-2">
                <label
                  className="text-label-caps ml-1 block"
                  htmlFor="auth-email-input"
                  style={{ color: 'var(--ds-on-surface-variant)', fontSize: '11px' }}
                >
                  EMAIL ADDRESS
                </label>
                <div className="relative">
                  <span
                    className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2"
                    style={{ color: 'var(--ds-outline)' }}
                  >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                    </svg>
                  </span>
                  <input
                    autoFocus
                    autoComplete="email"
                    className="w-full rounded-lg border py-4 pl-12 pr-4 text-sm transition-all outline-none"
                    id="auth-email-input"
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="you@example.com"
                    style={{
                      backgroundColor: 'var(--ds-surface-container-low)',
                      borderColor: 'var(--ds-outline-variant)',
                      color: 'var(--ds-on-surface)',
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = 'var(--ds-primary)'
                      e.currentTarget.style.boxShadow = '0 0 0 1px var(--ds-primary)'
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = 'var(--ds-outline-variant)'
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                    type="email"
                    value={emailInput}
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-2">
                <label
                  className="text-label-caps ml-1 block"
                  htmlFor="auth-password-input"
                  style={{ color: 'var(--ds-on-surface-variant)', fontSize: '11px' }}
                >
                  PASSWORD
                </label>
                <div className="relative">
                  <span
                    className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2"
                    style={{ color: 'var(--ds-outline)' }}
                  >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                    </svg>
                  </span>
                  <input
                    autoComplete="current-password"
                    className="w-full rounded-lg border py-4 pl-12 pr-4 text-sm transition-all outline-none"
                    id="auth-password-input"
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder="••••••••••••"
                    style={{
                      backgroundColor: 'var(--ds-surface-container-low)',
                      borderColor: 'var(--ds-outline-variant)',
                      color: 'var(--ds-on-surface)',
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = 'var(--ds-primary)'
                      e.currentTarget.style.boxShadow = '0 0 0 1px var(--ds-primary)'
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = 'var(--ds-outline-variant)'
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                    type="password"
                    value={passwordInput}
                  />
                </div>
              </div>

              {authError ? (
                <p
                  className="rounded-lg border px-3 py-2 text-xs"
                  style={{
                    backgroundColor: 'var(--ds-error-container)',
                    borderColor: 'rgba(186,26,26,0.2)',
                    color: 'var(--ds-error)',
                  }}
                >
                  {authError}
                </p>
              ) : null}

              <button
                className="text-label-caps flex items-center justify-center gap-3 rounded-lg py-4 transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isAuthenticating || !emailInput.trim() || !passwordInput.trim()}
                style={{
                  backgroundColor: 'var(--ds-primary)',
                  color: 'var(--ds-on-primary)',
                  boxShadow: '0 4px 16px rgba(0,32,69,0.2)',
                }}
                type="submit"
              >
                {isAuthenticating ? 'VERIFYING...' : 'ACCESS DASHBOARD'}
                {!isAuthenticating && (
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                )}
              </button>
            </form>

            {/* Help */}
            <div className="text-center">
              <a
                className="text-label-caps transition-colors hover:opacity-70"
                href="#"
                style={{ fontSize: '10px', color: 'var(--ds-on-surface-variant)' }}
              >
                Forgot your password? Contact your manager.
              </a>
            </div>
          </div>

          {/* Return link */}
          <div className="mt-8 text-center">
            <a
              className="text-label-caps inline-flex items-center gap-2 transition-colors hover:opacity-70"
              href="/"
              style={{ color: 'var(--ds-on-surface-variant)', fontSize: '12px' }}
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
              Return to Marketplace
            </a>
          </div>
        </main>

        {/* Footer */}
        <footer
          className="fixed inset-x-0 bottom-0 flex justify-between p-8 text-label-caps"
          style={{ fontSize: '10px', color: 'rgba(67,71,78,0.4)', letterSpacing: '0.4em' }}
        >
          <div>© 2024 HOMES ALBUMS STUDIO</div>
          <div className="hidden md:block">SECURE UPLOADER PORTAL v2.4</div>
        </footer>
      </div>
    )
  }

  return (
    <div
      className="flex h-screen flex-col overflow-hidden"
      style={{ backgroundColor: 'var(--ds-surface)', color: 'var(--ds-on-surface)' }}
    >
      {/* Hidden file input */}
      <input
        accept="image/*"
        className="sr-only"
        multiple
        onChange={handleFileChange}
        ref={fileInputRef}
        type="file"
      />
      <input
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={handleCameraFileChange}
        ref={rearCameraInputRef}
        type="file"
      />
      <input
        accept="image/*"
        capture="user"
        className="sr-only"
        onChange={handleCameraFileChange}
        ref={frontCameraInputRef}
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
      <header
        className="relative z-30 flex h-20 min-w-0 shrink-0 items-center gap-2 border-b px-4 sm:px-16"
        style={{
          backgroundColor: 'rgba(255,255,255,0.9)',
          backdropFilter: 'blur(12px)',
          borderColor: 'rgba(196,198,207,0.3)',
          boxShadow: '0 1px 4px rgba(0,32,69,0.06)',
        }}
      >
        {/* Left: hamburger + logo */}
        <div className="flex shrink-0 items-center gap-1">
          <button
            aria-label="Toggle sidebar"
            className="flex h-10 w-10 items-center justify-center rounded-lg transition-colors hover:bg-gray-100 md:hidden"
            onClick={() => setIsSidebarOpen((s) => !s)}
            type="button"
          >
            <Menu className="h-5 w-5" style={{ color: 'var(--ds-on-surface-variant)' }} />
          </button>
          <div className="flex items-center gap-2 px-1 select-none">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt="Homes Albums"
              className="h-8 w-auto shrink-0"
              src="/Homes%20Drive%20Logo%20Blue.png"
            />
          </div>
        </div>

        {/* Center: search */}
        <div
          className="mx-2 flex min-w-0 flex-1 max-w-2xl items-center gap-2 rounded-lg border px-4 py-2.5 transition-all"
          style={{
            backgroundColor: 'var(--ds-surface-container)',
            borderColor: 'var(--ds-outline-variant)',
          }}
          onFocus={(e) => {
            const el = e.currentTarget
            el.style.backgroundColor = 'var(--ds-surface-container-lowest)'
            el.style.boxShadow = '0 0 0 1px var(--ds-primary)'
            el.style.borderColor = 'var(--ds-primary)'
          }}
          onBlur={(e) => {
            const el = e.currentTarget
            el.style.backgroundColor = 'var(--ds-surface-container)'
            el.style.boxShadow = 'none'
            el.style.borderColor = 'var(--ds-outline-variant)'
          }}
        >
          <Search className="h-4 w-4 shrink-0" style={{ color: 'var(--ds-outline)' }} />
          <input
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400"
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search in Homes Albums"
            style={{ color: 'var(--ds-on-surface)' }}
            type="search"
            value={searchQuery}
          />
          {searchQuery ? (
            <button
              className="transition-colors hover:opacity-60"
              onClick={() => setSearchQuery('')}
              style={{ color: 'var(--ds-outline)' }}
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        {/* Right: user avatar */}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <button
            className="rounded-full transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-primary)] focus-visible:ring-offset-2"
            onClick={openProfileModal}
            title={`Edit profile · ${liveUser.fullName}`}
            type="button"
          >
            <ProfileAvatarBubble
              avatarUrl={liveUser.avatarUrl}
              initials={initials}
              sizeClasses="h-9 w-9 text-sm"
            />
          </button>
        </div>
      </header>

      {/* ─── Body ─────────────────────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 overflow-hidden">

        {/* Sidebar */}
        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-20 flex w-64 flex-col pt-20 transition-transform duration-200',
            'md:relative md:inset-auto md:z-auto md:pt-0 md:translate-x-0',
            isSidebarOpen ? 'translate-x-0 shadow-xl' : '-translate-x-full',
          )}
          style={{
            backgroundColor: 'var(--ds-surface-container-low)',
            borderRight: '1px solid rgba(196,198,207,0.3)',
          }}
        >
          <div className="flex flex-1 flex-col overflow-y-auto py-4">
            {/* Workspace header */}
            <div className="px-6 mb-6">
              <h2
                className="font-headline text-lg font-semibold"
                style={{ color: 'var(--ds-primary)' }}
              >
                Studio Workspace
              </h2>
              <p className="text-xs font-ui mt-0.5" style={{ color: 'var(--ds-on-surface-variant)' }}>
                Professional Mode
              </p>
            </div>

            {/* New upload button */}
            <div className="px-6 mb-6">
              <button
                className="flex items-center gap-2.5 rounded-lg border px-5 py-3.5 text-sm font-medium transition-all hover:opacity-80 w-full"
                style={{
                  backgroundColor: 'var(--ds-surface-container-lowest)',
                  borderColor: 'rgba(0,32,69,0.2)',
                  color: 'var(--ds-primary)',
                }}
                onClick={() => {
                  setActiveView('upload')
                  setIsSidebarOpen(false)
                  resetFolderModalState()
                  setIsFolderModalOpen(true)
                }}
                type="button"
              >
                <CloudUpload className="h-5 w-5" />
                <span>New Upload</span>
              </button>
              <p className="mt-2 text-[10px] leading-snug" style={{ color: 'var(--ds-on-surface-variant)' }}>
                Max {MAX_PHOTO_UPLOAD_BYTES / (1024 * 1024)} MB per photo · Compressed to ~{TARGET_STORED_PHOTO_BYTES / 1024}{' '}
                KB when saved
              </p>
            </div>

            {/* Nav */}
            <nav>
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

            <div className="my-4 mx-6 border-t" style={{ borderColor: 'var(--ds-outline-variant)' }} />

            {/* User info card */}
            <div
              className="mx-6 rounded-lg p-4 space-y-3"
              style={{
                backgroundColor: 'var(--ds-surface-container)',
                border: '1px solid rgba(196,198,207,0.3)',
              }}
            >
              <div className="flex items-center gap-3">
                <ProfileAvatarBubble
                  avatarUrl={liveUser.avatarUrl}
                  initials={initials}
                  sizeClasses="h-10 w-10 text-sm"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold" style={{ color: 'var(--ds-on-surface)' }}>{liveUser.fullName}</p>
                  <p className="truncate text-xs" style={{ color: 'var(--ds-outline)' }}>{liveUser.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--ds-secondary)' }} />
                <span className="text-xs font-medium" style={{ color: 'var(--ds-on-surface-variant)' }}>{liveUser.areaFocused}</span>
              </div>
              <button
                className="flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors hover:bg-white"
                onClick={openProfileModal}
                style={{
                  borderColor: 'var(--ds-outline-variant)',
                  color: 'var(--ds-primary)',
                  backgroundColor: 'var(--ds-surface-container-lowest)',
                }}
                type="button"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit profile
              </button>
            </div>

            {/* Logout button — pinned to the bottom */}
            <div className="mt-auto px-6 pt-6">
              <button
                className="flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-white"
                onClick={handleLogout}
                style={{
                  borderColor: 'var(--ds-outline-variant)',
                  color: 'var(--ds-error)',
                  backgroundColor: 'var(--ds-surface-container-lowest)',
                }}
                type="button"
              >
                <LogOut className="h-4 w-4" />
                <span>Sign out</span>
              </button>
            </div>
          </div>
        </aside>

        {/* ─── Main content ────────────────────────────────────────────────────── */}
        <main className="flex-1 min-w-0 overflow-y-auto">

          {/* Upload view */}
          {activeView === 'upload' ? (
            <div className="space-y-12 px-8 py-12 lg:px-16">

              {/* ── Dashboard header ─────────────────────────────────── */}
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
                <div>
                  <h1
                    className="text-display-xl font-headline mb-3"
                    style={{ color: 'var(--ds-primary)' }}
                  >
                    Upload Studio
                  </h1>
                  <p className="max-w-2xl text-base" style={{ color: 'var(--ds-on-surface-variant)' }}>
                    Manage your professional architectural portfolios. Organise assets by project, client, or location to maintain a curated high-end editorial workflow.
                  </p>
                </div>
                <button
                  className="shrink-0 inline-flex items-center gap-2 rounded-lg px-6 py-3 text-label-caps font-bold text-white transition-all hover:opacity-90 active:scale-95"
                  style={{ backgroundColor: 'var(--ds-primary)', boxShadow: '0 4px 12px rgba(0,32,69,0.2)' }}
                  onClick={() => { resetFolderModalState(); setIsFolderModalOpen(true) }}
                  type="button"
                >
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/>
                  </svg>
                  Create New Folder
                </button>
              </div>

              {!activeFolder ? (
                  <>
                    {/* Archive toggle */}
                    {archivedFolders.length > 0 ? (
                      <div className="mb-6">
                        <button
                          className="text-label-caps flex items-center gap-1.5 transition-colors hover:opacity-70"
                          style={{ color: 'var(--ds-outline)', fontSize: '11px' }}
                          onClick={() => setShowArchivedFolders((v) => !v)}
                          type="button"
                        >
                          <Archive className="h-3.5 w-3.5" />
                          {showArchivedFolders
                            ? `Hide archived (${archivedFolders.length})`
                            : `Show archived (${archivedFolders.length})`}
                        </button>
                      </div>
                    ) : null}

                    {/* ── Folder card grid ─────────────────────────────── */}
                    {displayedFolders.length > 0 ? (
                      <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {displayedFolders.map((folder) => {
                          const isArchived = (folder.status ?? 'active') === 'archived'
                          const photoCount = folderPhotoCountById[folder.id] ?? 0
                          // Use the most recent photo in this folder as the cover
                          const coverPhoto = dbPhotos.find((p) => p.folder_id === folder.id && p.image_url)
                          return (
                            <div
                              key={folder.id}
                              className="group relative overflow-hidden rounded-xl border transition-all hover:shadow-xl"
                              style={{
                                backgroundColor: isArchived ? 'var(--ds-surface-container-low)' : 'white',
                                borderColor: 'var(--ds-outline-variant)',
                              }}
                            >
                              {/* Cover image */}
                              <button
                                className="w-full text-left"
                                onClick={() => setActiveFolderId(folder.id)}
                                type="button"
                              >
                                <div
                                  className="relative aspect-[4/3] w-full overflow-hidden"
                                  style={{ backgroundColor: 'var(--ds-surface-dim)' }}
                                >
                                  {coverPhoto ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      alt={folder.folder_name}
                                      className={cn(
                                        'h-full w-full object-cover transition-transform duration-500 group-hover:scale-105',
                                        isArchived ? 'opacity-50 grayscale' : 'opacity-90',
                                      )}
                                      src={coverPhoto.image_url}
                                    />
                                  ) : (
                                    <div
                                      className="flex h-full w-full items-center justify-center"
                                      style={{ color: 'var(--ds-outline-variant)' }}
                                    >
                                      <Folder className="h-16 w-16" />
                                    </div>
                                  )}
                                  {/* Gradient overlay */}
                                  <div
                                    className="absolute inset-0"
                                    style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.45) 0%, transparent 60%)' }}
                                  />
                                  {/* Status badge */}
                                  <div className="absolute left-3 top-3">
                                    <span
                                      className="text-label-caps rounded px-2 py-1 text-white"
                                      style={{
                                        backgroundColor: isArchived ? 'var(--ds-outline)' : 'var(--ds-primary)',
                                        fontSize: '10px',
                                      }}
                                    >
                                      {isArchived ? 'Archived' : 'Active'}
                                    </span>
                                  </div>
                                  {/* Folder name on image */}
                                  <div className="absolute bottom-3 left-4 right-4">
                                    <p
                                      className="font-headline truncate text-lg text-white"
                                      style={{ textShadow: '0 1px 3px rgba(0,0,0,0.4)' }}
                                    >
                                      {folder.folder_name}
                                    </p>
                                  </div>
                                </div>
                              </button>

                              {/* Card footer */}
                              <div className="p-4 flex flex-col gap-3">
                                <div className="flex justify-between items-center text-xs font-medium">
                                  <span style={{ color: isArchived ? 'var(--ds-outline)' : 'var(--ds-on-surface-variant)' }}>
                                    {photoCount} Photo{photoCount !== 1 ? 's' : ''}
                                  </span>
                                  <span style={{ color: isArchived ? 'var(--ds-outline)' : 'var(--ds-on-surface-variant)' }}>
                                    {folder.city || folder.full_address || 'No location'}
                                  </span>
                                </div>
                                <div
                                  className="flex items-center justify-between pt-2 border-t"
                                  style={{ borderColor: 'var(--ds-outline-variant)' }}
                                >
                                  {!isArchived ? (
                                    <div className="flex gap-1">
                                      <button
                                        className="rounded-full p-2 transition-colors hover:bg-surface-container"
                                        style={{ color: 'var(--ds-on-surface-variant)' }}
                                        title="Edit folder"
                                        onClick={() => openEditFolderModal(folder)}
                                        type="button"
                                      >
                                        <Pencil className="h-4 w-4" />
                                      </button>
                                      <button
                                        className="rounded-full p-2 transition-colors"
                                        style={{ color: 'var(--ds-on-surface-variant)' }}
                                        title="Copy share link"
                                        onClick={() => copyFolderShareLink(folder)}
                                        type="button"
                                      >
                                        <Share2 className="h-4 w-4" />
                                      </button>
                                      <button
                                        className="rounded-full p-2 transition-colors"
                                        style={{ color: 'var(--ds-on-surface-variant)' }}
                                        title="Archive folder"
                                        disabled={updatingFolderStatusId === folder.id}
                                        onClick={() => void handleArchiveToggle(folder)}
                                        type="button"
                                      >
                                        <Archive className="h-4 w-4" />
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="flex gap-1">
                                      <button
                                        className="rounded-full p-2 transition-colors"
                                        style={{ color: 'var(--ds-outline)' }}
                                        title="Restore folder"
                                        disabled={updatingFolderStatusId === folder.id}
                                        onClick={() => void handleArchiveToggle(folder)}
                                        type="button"
                                      >
                                        <ArchiveRestore className="h-4 w-4" />
                                      </button>
                                    </div>
                                  )}
                                  <button
                                    className="rounded-full p-2 transition-all"
                                    style={{ color: 'var(--ds-on-surface-variant)' }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.backgroundColor = 'var(--ds-error-container)'
                                      e.currentTarget.style.color = 'var(--ds-error)'
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.backgroundColor = 'transparent'
                                      e.currentTarget.style.color = 'var(--ds-on-surface-variant)'
                                    }}
                                    title="Delete folder"
                                    onClick={() => { setDeleteFolderOption('unfile'); setDeleteFolderTarget(folder) }}
                                    type="button"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          )
                        })}

                        {/* New folder placeholder card */}
                        <button
                          className="group flex aspect-[4/3] flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed transition-all"
                          style={{
                            backgroundColor: 'var(--ds-surface-container-low)',
                            borderColor: 'var(--ds-outline-variant)',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = 'var(--ds-surface-container)'
                            e.currentTarget.style.borderColor = 'var(--ds-primary)'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'var(--ds-surface-container-low)'
                            e.currentTarget.style.borderColor = 'var(--ds-outline-variant)'
                          }}
                          onClick={() => { resetFolderModalState(); setIsFolderModalOpen(true) }}
                          type="button"
                        >
                          <div
                            className="flex h-12 w-12 items-center justify-center rounded-full bg-white transition-transform group-hover:scale-110"
                            style={{
                              color: 'var(--ds-primary)',
                              boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
                            }}
                          >
                            <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                            </svg>
                          </div>
                          <span className="text-sm font-bold transition-colors group-hover:text-primary" style={{ color: 'var(--ds-on-surface-variant)' }}>
                            Create New Project
                          </span>
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-4 py-20 text-center">
                        <div
                          className="flex h-20 w-20 items-center justify-center rounded-xl"
                          style={{ backgroundColor: 'var(--ds-surface-container)', color: 'var(--ds-on-surface-variant)' }}
                        >
                          <FolderOpen className="h-10 w-10" />
                        </div>
                        <div>
                          <p className="font-headline text-lg font-semibold" style={{ color: 'var(--ds-on-surface)' }}>No folders yet</p>
                          <p className="mt-1 text-sm" style={{ color: 'var(--ds-on-surface-variant)' }}>Create a folder to start organizing and uploading photos by location.</p>
                        </div>
                        <button
                          className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:opacity-90"
                          style={{ backgroundColor: 'var(--ds-primary)' }}
                          onClick={() => { resetFolderModalState(); setIsFolderModalOpen(true) }}
                          type="button"
                        >
                          <CloudUpload className="h-4 w-4" />
                          Create first folder
                        </button>
                      </div>
                    )}

                    {/* ── Activity + Storage bento ───────────────────── */}
                    {(activeFolders.length > 0 || dbPhotos.length > 0) ? (
                      <div className="mt-12 grid grid-cols-1 gap-8 lg:grid-cols-12">
                        {/* Recent Upload Activity */}
                        <div
                          className="lg:col-span-8 rounded-xl p-8"
                          style={{
                            backgroundColor: 'white',
                            border: '1px solid var(--ds-outline-variant)',
                          }}
                        >
                          <h3
                            className="font-headline text-xl font-semibold mb-6"
                            style={{ color: 'var(--ds-primary)' }}
                          >
                            Recent Upload Activity
                          </h3>
                          <div className="space-y-4">
                            {dbPhotos.slice(0, 5).map((photo) => {
                              const folder = folders.find((f) => f.id === photo.folder_id)
                              return (
                                <div
                                  key={photo.id}
                                  className="flex items-center justify-between py-3 border-b"
                                  style={{ borderColor: 'var(--ds-outline-variant)' }}
                                >
                                  <div className="flex items-center gap-4">
                                    <div
                                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded"
                                      style={{ backgroundColor: 'var(--ds-primary-fixed)', color: 'var(--ds-primary)' }}
                                    >
                                      <CloudUpload className="h-5 w-5" />
                                    </div>
                                    <div>
                                      <p className="text-sm font-bold" style={{ color: 'var(--ds-on-surface)' }}>
                                        {photo.original_file_name}
                                      </p>
                                      <p className="text-xs" style={{ color: 'var(--ds-on-surface-variant)' }}>
                                        {folder ? folder.folder_name : 'Unfiled'}{photo.city ? ` · ${photo.city}` : ''}
                                      </p>
                                    </div>
                                  </div>
                                  <span className="text-xs font-medium shrink-0" style={{ color: 'var(--ds-outline)' }}>
                                    {formatRelativeDate(photo.created_at)}
                                  </span>
                                </div>
                              )
                            })}
                            {dbPhotos.length === 0 ? (
                              <p className="text-sm" style={{ color: 'var(--ds-on-surface-variant)' }}>No uploads yet.</p>
                            ) : null}
                          </div>
                        </div>

                        {/* Storage Usage */}
                        <div
                          className="lg:col-span-4 rounded-xl p-8 flex flex-col justify-between"
                          style={{
                            backgroundColor: 'var(--ds-surface-container)',
                            border: '1px solid var(--ds-outline-variant)',
                          }}
                        >
                          <div>
                            <h3
                              className="font-headline text-xl font-semibold mb-1"
                              style={{ color: 'var(--ds-primary)' }}
                            >
                              Photo Summary
                            </h3>
                            <p
                              className="text-label-caps mb-6"
                              style={{ color: 'var(--ds-on-surface-variant)', fontSize: '10px', letterSpacing: '0.15em' }}
                            >
                              YOUR ACCOUNT
                            </p>
                            <div className="space-y-3">
                              <div className="flex justify-between text-sm">
                                <span style={{ color: 'var(--ds-on-surface-variant)' }}>Total photos</span>
                                <span className="font-bold" style={{ color: 'var(--ds-on-surface)' }}>{dbPhotos.length}</span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span style={{ color: 'var(--ds-on-surface-variant)' }}>Active folders</span>
                                <span className="font-bold" style={{ color: 'var(--ds-on-surface)' }}>{activeFolders.length}</span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span style={{ color: 'var(--ds-on-surface-variant)' }}>GPS tagged</span>
                                <span className="font-bold" style={{ color: 'var(--ds-on-surface)' }}>
                                  {dbPhotos.filter((p) => p.latitude != null).length}
                                </span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span style={{ color: 'var(--ds-on-surface-variant)' }}>Storage</span>
                                <span className="font-bold" style={{ color: 'var(--ds-on-surface)' }}>
                                  {formatBytes(dbPhotos.reduce((s, p) => s + (p.file_size_bytes ?? 0), 0))}
                                </span>
                              </div>
                            </div>
                          </div>
                          <button
                            className="mt-8 w-full rounded-lg border-2 py-3 text-sm font-bold transition-all hover:opacity-80"
                            style={{ borderColor: 'var(--ds-primary)', color: 'var(--ds-primary)' }}
                            onClick={() => setActiveView('my-photos')}
                            type="button"
                          >
                            View All Photos
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <>
                    {/* Opened folder header */}
                    <div className="border-b border-gray-100">
                      {/* Breadcrumb */}
                      <div className="flex items-center gap-1.5 px-6 pt-4 text-xs text-gray-400">
                        <button
                          className="font-medium transition-colors hover:text-gray-700"
                          onClick={() => setActiveFolderId(null)}
                          type="button"
                        >
                          My Folders
                        </button>
                        <span>/</span>
                        <span className="font-semibold text-gray-700">{activeFolder.folder_name}</span>
                        {(activeFolder.status ?? 'active') === 'archived' ? (
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">Archived</span>
                        ) : null}
                      </div>

                      {/* Folder identity + actions */}
                      <div className="flex flex-wrap items-start justify-between gap-4 px-6 pb-5 pt-3">
                        <div className="flex items-center gap-4">
                          <div className="rounded-2xl bg-amber-50 p-3 text-amber-600">
                            <FolderOpen className="h-10 w-10" />
                          </div>
                          <div>
                            <h2 className="text-xl font-bold text-gray-900 leading-tight">{activeFolder.folder_name}</h2>
                            <p className="mt-0.5 text-sm text-gray-400">
                              {activeFolder.full_address || activeFolder.city || 'No address set'}
                            </p>
                            {/* Type + tag chips */}
                            {(activeFolder.type_of_place.length > 0 || activeFolder.tags.length > 0) ? (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {activeFolder.type_of_place.map((v) => (
                                  <span key={v} className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-700">
                                    {v}
                                  </span>
                                ))}
                                {activeFolder.tags.map((v) => (
                                  <span key={v} className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-medium text-gray-600">
                                    {v}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex flex-wrap items-center gap-2">
                          {/* Icon actions */}
                          <div className="flex items-center gap-1 rounded-2xl border border-gray-200 bg-white p-1 shadow-sm">
                            <button
                              aria-label="Edit folder"
                              className="flex h-9 w-9 items-center justify-center rounded-xl text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
                              onClick={() => openEditFolderModal(activeFolder)}
                              title="Edit folder"
                              type="button"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              aria-label={(activeFolder.status ?? 'active') === 'archived' ? 'Unarchive' : 'Archive'}
                              className="flex h-9 w-9 items-center justify-center rounded-xl text-gray-500 transition-colors hover:bg-amber-50 hover:text-amber-600"
                              disabled={updatingFolderStatusId === activeFolder.id}
                              onClick={() => void handleArchiveToggle(activeFolder)}
                              title={(activeFolder.status ?? 'active') === 'archived' ? 'Unarchive folder' : 'Archive folder'}
                              type="button"
                            >
                              {(activeFolder.status ?? 'active') === 'archived'
                                ? <ArchiveRestore className="h-4 w-4" />
                                : <Archive className="h-4 w-4" />}
                            </button>
                            <button
                              aria-label="Copy share link"
                              className="flex h-9 w-9 items-center justify-center rounded-xl text-gray-500 transition-colors hover:bg-blue-50 hover:text-blue-600"
                              onClick={() => copyFolderShareLink(activeFolder)}
                              title="Copy marketplace link"
                              type="button"
                            >
                              <Share2 className="h-4 w-4" />
                            </button>
                            <button
                              aria-label="Folder notes"
                              className={cn(
                                'flex h-9 w-9 items-center justify-center rounded-xl transition-colors',
                                isFolderNotesOpen
                                  ? 'bg-yellow-100 text-yellow-700'
                                  : 'text-gray-500 hover:bg-yellow-50 hover:text-yellow-600',
                              )}
                              onClick={() => {
                                if (!isFolderNotesOpen) {
                                  setEditingNotesValue(activeFolder.notes ?? '')
                                  setNotesStatusMsg('')
                                }
                                setIsFolderNotesOpen((v) => !v)
                              }}
                              title="Folder notes"
                              type="button"
                            >
                              <StickyNote className="h-4 w-4" />
                            </button>
                          </div>

                          {/* Camera buttons */}
                          <button
                            className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
                            onClick={() => rearCameraInputRef.current?.click()}
                            type="button"
                          >
                            Rear camera
                          </button>
                          <button
                            className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
                            onClick={() => frontCameraInputRef.current?.click()}
                            type="button"
                          >
                            Selfie
                          </button>

                          {/* Primary upload */}
                          <button
                            className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-800"
                            onClick={() => fileInputRef.current?.click()}
                            type="button"
                          >
                            <Upload className="h-4 w-4" />
                            Upload
                          </button>
                        </div>
                        <p className="mt-2 basis-full text-[11px] leading-snug text-gray-500">
                          Up to {MAX_PHOTO_UPLOAD_BYTES / (1024 * 1024)} MB per photo. After upload, each file is stored at about{' '}
                          {TARGET_STORED_PHOTO_BYTES / 1024} KB (compressed JPEG).
                        </p>
                      </div>

                      {/* Stats strip */}
                      <div className="grid grid-cols-2 border-t border-gray-100 sm:grid-cols-4">
                        {[
                          { label: 'Photos', value: String(openedFolderPhotos.length) },
                          {
                            label: 'Storage',
                            value: formatBytes(openedFolderPhotos.reduce((s, p) => s + (p.file_size_bytes ?? 0), 0)),
                          },
                          {
                            label: 'GPS tagged',
                            value: `${openedFolderPhotos.filter((p) => p.latitude != null).length} / ${openedFolderPhotos.length}`,
                          },
                          {
                            label: 'Tagged',
                            value: `${openedFolderPhotos.filter((p) => p.tags.length > 0).length} / ${openedFolderPhotos.length}`,
                          },
                        ].map(({ label, value }, i) => (
                          <div
                            key={label}
                            className={cn(
                              'px-4 py-3 sm:px-6',
                              // Borders that work cleanly on a 2-col mobile / 4-col desktop grid
                              i % 2 === 1 && 'border-l border-gray-100',
                              i >= 2 && 'border-t border-gray-100 sm:border-t-0',
                              i === 2 && 'sm:border-l',
                              i === 3 && 'sm:border-l',
                            )}
                          >
                            <p className="text-[11px] font-medium text-gray-400">{label}</p>
                            <p className="text-sm font-bold text-gray-800">{value}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Notes panel (outside border-b strip) */}
                    {isFolderNotesOpen ? (
                      <div className="border-b border-yellow-200 bg-yellow-50 px-6 py-4">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-yellow-700">Internal notes</p>
                        <textarea
                          className="w-full resize-none rounded-xl border border-yellow-200 bg-white px-4 py-2.5 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-yellow-300"
                          onChange={(e) => setEditingNotesValue(e.target.value)}
                          placeholder="Add shoot instructions, property details, retake reminders…"
                          rows={3}
                          value={editingNotesValue}
                        />
                        <div className="mt-2 flex items-center gap-3">
                          <button
                            className="rounded-xl bg-yellow-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-yellow-700 disabled:opacity-50"
                            disabled={isSavingNotes}
                            onClick={() => void handleSaveFolderNotes()}
                            type="button"
                          >
                            {isSavingNotes ? 'Saving…' : 'Save notes'}
                          </button>
                          {notesStatusMsg ? (
                            <span className={cn(
                              'text-xs font-medium',
                              notesStatusMsg === 'Saved' ? 'text-green-600' : 'text-red-600',
                            )}>
                              {notesStatusMsg}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ) : null}

                    <div className="p-6">
                      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-gray-700">
                          {openedFolderPhotos.length} photo{openedFolderPhotos.length !== 1 ? 's' : ''} in this folder
                        </p>
                        <div className="flex items-center gap-2">
                          {isFolderBulkMode ? (
                            <>
                              <button
                                className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
                                disabled={selectedFolderPhotoIds.size === 0}
                                onClick={() => openMoveModal([...selectedFolderPhotoIds])}
                                type="button"
                              >
                                Move selected ({selectedFolderPhotoIds.size})
                              </button>
                              <button
                                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-50"
                                onClick={() => {
                                  setSelectedFolderPhotoIds(new Set())
                                  setIsFolderBulkMode(false)
                                }}
                                type="button"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <button
                              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50"
                              onClick={() => setIsFolderBulkMode(true)}
                              type="button"
                            >
                              <CheckSquare className="h-3.5 w-3.5" />
                              Select
                            </button>
                          )}
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
                      </div>

                      {openedFolderPhotos.length > 0 && folderPhotosViewMode === 'grid' ? (
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                          {openedFolderPhotos.map((photo, index) => {
                            const isSelected = selectedFolderPhotoIds.has(photo.id)
                            return (
                              <div
                                key={photo.id}
                                className={cn(
                                  'relative overflow-hidden rounded-xl border bg-white transition-all',
                                  isFolderBulkMode && isSelected ? 'border-slate-900 ring-2 ring-slate-900' : 'border-gray-100',
                                )}
                              >
                                {isFolderBulkMode ? (
                                  <button
                                    aria-label={`Select ${photo.original_file_name}`}
                                    className={cn(
                                      'absolute left-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full border-2',
                                      isSelected ? 'border-slate-950 bg-slate-950 text-white' : 'border-white bg-black/35 text-transparent',
                                    )}
                                    onClick={() => toggleFolderPhotoSelection(photo.id)}
                                    type="button"
                                  >
                                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                                      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                  </button>
                                ) : (
                                  <div className="absolute right-2 top-2 z-10 flex items-center gap-1">
                                    <button
                                      aria-label="Move photo to another folder"
                                      className="flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white transition-colors hover:bg-black/75"
                                      onClick={() => openMoveModal([photo.id])}
                                      type="button"
                                    >
                                      <ArrowRight className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      aria-label={`Delete ${photo.original_file_name}`}
                                      className="flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white transition-colors hover:bg-black/75"
                                      disabled={deletingPhotoIds.has(photo.id)}
                                      onClick={() => void handleDeleteDbPhoto(photo.id)}
                                      type="button"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                )}
                                <button
                                  className="w-full transition-all hover:opacity-95"
                                  onClick={() => {
                                    if (isFolderBulkMode) {
                                      toggleFolderPhotoSelection(photo.id)
                                      return
                                    }
                                    openLightbox(openedFolderLightboxItems, index)
                                  }}
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
                            )
                          })}
                        </div>
                      ) : null}

                      {openedFolderPhotos.length > 0 && folderPhotosViewMode === 'list' ? (
                        <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white">
                          <div className="min-w-[640px]">
                          <div className="grid grid-cols-[2rem_2.5rem_1.5fr_1fr_1fr_auto_auto] items-center gap-3 border-b border-gray-100 px-4 py-2.5">
                            {isFolderBulkMode ? <span className="text-xs text-gray-400">✓</span> : <span />}
                            <span />
                            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">File</span>
                            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Date taken</span>
                            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Device</span>
                            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Size</span>
                            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Actions</span>
                          </div>
                          {openedFolderPhotos.map((photo, index) => {
                            const isSelected = selectedFolderPhotoIds.has(photo.id)
                            return (
                              <div
                                key={photo.id}
                                className={cn(
                                  'grid grid-cols-[2rem_2.5rem_1.5fr_1fr_1fr_auto_auto] items-center gap-3 border-b border-gray-50 px-4 py-3 transition-colors last:border-0',
                                  isFolderBulkMode && isSelected ? 'bg-blue-50' : 'hover:bg-gray-50',
                                )}
                              >
                                {isFolderBulkMode ? (
                                  <button
                                    className={cn(
                                      'flex h-5 w-5 items-center justify-center rounded border-2 transition-colors',
                                      isSelected ? 'border-slate-950 bg-slate-950 text-white' : 'border-gray-300',
                                    )}
                                    onClick={() => toggleFolderPhotoSelection(photo.id)}
                                    type="button"
                                  >
                                    {isSelected ? (
                                      <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                                        <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                                      </svg>
                                    ) : null}
                                  </button>
                                ) : <span />}
                                <button
                                  aria-label={`View ${photo.original_file_name}`}
                                  className="h-10 w-10 overflow-hidden rounded-lg bg-gray-100"
                                  onClick={() => {
                                    if (isFolderBulkMode) {
                                      toggleFolderPhotoSelection(photo.id)
                                      return
                                    }
                                    openLightbox(openedFolderLightboxItems, index)
                                  }}
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
                                <div className="flex items-center gap-1">
                                  {!isFolderBulkMode ? (
                                    <button
                                      aria-label="Move to another folder"
                                      className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100"
                                      onClick={() => openMoveModal([photo.id])}
                                      type="button"
                                    >
                                      <ArrowRight className="h-4 w-4" />
                                    </button>
                                  ) : null}
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
                              </div>
                            )
                          })}
                          </div>
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

              {isAnalyzing ? (
                <div
                  className="flex items-center gap-3 rounded-lg border px-4 py-3"
                  style={{ backgroundColor: 'var(--ds-surface-container)', borderColor: 'var(--ds-outline-variant)' }}
                >
                  <span style={{ color: 'var(--ds-primary)' }}><Spinner className="h-5 w-5" /></span>
                  <p className="text-sm font-medium" style={{ color: 'var(--ds-on-surface-variant)' }}>Reading and uploading photos…</p>
                </div>
              ) : null}

              {analysisError ? (
                <p
                  className="rounded-lg border px-4 py-3 text-sm"
                  style={{ backgroundColor: 'var(--ds-error-container)', borderColor: 'rgba(186,26,26,0.2)', color: 'var(--ds-error)' }}
                >
                  {analysisError}
                </p>
              ) : null}

              {/* Session uploads grid */}
              {activeFolder && uploadedImages.length > 0 ? (
                <div
                  className="overflow-hidden rounded-xl"
                  style={{ border: '1px solid var(--ds-outline-variant)', backgroundColor: 'white' }}
                >
                  <div
                    className="flex items-center justify-between border-b px-6 py-4"
                    style={{ borderColor: 'var(--ds-outline-variant)' }}
                  >
                    <div>
                      <h2 className="font-headline text-base font-semibold" style={{ color: 'var(--ds-on-surface)' }}>Upload queue</h2>
                      <p className="mt-0.5 text-xs" style={{ color: 'var(--ds-on-surface-variant)' }}>
                        {uploadedImages.length} file{uploadedImages.length !== 1 ? 's' : ''}
                        {uploadingCount > 0 ? ` · ${uploadingCount} uploading` : ''}
                      </p>
                    </div>
                    <button
                      className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold text-white transition-colors hover:opacity-90"
                      style={{ backgroundColor: 'var(--ds-primary)' }}
                      onClick={() => fileInputRef.current?.click()}
                      type="button"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      Add more
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-px bg-gray-100 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    {uploadedImages.map((image) => {
                      const hasGps =
                        image.metadata.latitude != null && image.metadata.longitude != null
                      const isBusy =
                        image.uploadStatus === 'uploading' || image.uploadStatus === 'deleting'

                      return (
                        <div
                          key={image.id}
                          className={cn(
                            'overflow-hidden bg-white transition-all',
                            selectedIds.has(image.id)
                              ? 'ring-2 ring-inset ring-slate-950'
                              : '',
                          )}
                        >
                          <div
                            className="relative block w-full cursor-pointer text-left transition-all hover:opacity-95 active:scale-[0.99]"
                            onClick={() => toggleImageSelection(image.id)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleImageSelection(image.id) }}
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
                          </div>
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
                    All photos uploaded by {liveUser.fullName}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {/* Bulk mode toggle */}
                  <button
                    className={cn(
                      'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                      isBulkMode
                        ? 'border-slate-950 bg-slate-950 text-white'
                        : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50',
                    )}
                    onClick={() => {
                      setIsBulkMode((v) => !v)
                      setSelectedDbPhotoIds(new Set())
                    }}
                    type="button"
                  >
                    <CheckSquare className="h-3.5 w-3.5" />
                    {isBulkMode ? 'Done' : 'Select'}
                  </button>
                  {/* View mode */}
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
              </div>

              {/* Filter bar */}
              {!isLoadingPhotos && dbPhotos.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
                  <Filter className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                  <span className="text-xs font-semibold text-gray-500">Filter:</span>

                  {/* By folder */}
                  <select
                    className="h-8 rounded-lg border border-gray-200 bg-white px-2 text-xs text-gray-700 outline-none focus:ring-2 focus:ring-slate-300"
                    onChange={(e) => setPhotosFilterFolderId(e.target.value)}
                    value={photosFilterFolderId}
                  >
                    <option value="">All folders</option>
                    <option value="__unassigned__">Unassigned</option>
                    {folders.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.folder_name}
                      </option>
                    ))}
                  </select>

                  {/* GPS only */}
                  <button
                    className={cn(
                      'flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors',
                      photosFilterGpsOnly
                        ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50',
                    )}
                    onClick={() => setPhotosFilterGpsOnly((v) => !v)}
                    type="button"
                  >
                    <MapPin className="h-3 w-3" />
                    GPS only
                  </button>

                  {/* Untagged */}
                  <button
                    className={cn(
                      'rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors',
                      photosFilterUntagged
                        ? 'border-orange-400 bg-orange-50 text-orange-700'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50',
                    )}
                    onClick={() => setPhotosFilterUntagged((v) => !v)}
                    type="button"
                  >
                    Untagged
                  </button>

                  {hasPhotosFilters ? (
                    <button
                      className="ml-auto text-xs text-gray-400 hover:text-gray-600 transition-colors"
                      onClick={() => {
                        setPhotosFilterFolderId('')
                        setPhotosFilterGpsOnly(false)
                        setPhotosFilterUntagged(false)
                      }}
                      type="button"
                    >
                      Clear filters
                    </button>
                  ) : null}

                  <span className="ml-auto text-xs text-gray-400">
                    {filteredDbPhotosWithFilters.length} of {dbPhotos.length}
                  </span>
                </div>
              ) : null}

              {/* Stats row */}
              {!isLoadingPhotos && !photosError && dbPhotos.length > 0 ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {[
                    { label: 'Total photos', value: String(dbPhotos.length) },
                    { label: 'Storage used', value: formatBytes(totalStorageBytes) },
                    { label: 'With GPS', value: String(photosWithGps) },
                  ].map(({ label, value }) => (
                    <div
                      key={label}
                      className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"
                    >
                      <p className="text-xl font-bold text-gray-800 sm:text-2xl">{value}</p>
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
              {!isLoadingPhotos && !photosError && filteredDbPhotosWithFilters.length > 0 && photosViewMode === 'grid' ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {filteredDbPhotosWithFilters.map((photo, index) => {
                    const isSelected = selectedDbPhotoIds.has(photo.id)
                    return (
                      <div
                        key={photo.id}
                        className={cn(
                          'group relative overflow-hidden rounded-2xl border bg-white shadow-sm transition-all',
                          isSelected ? 'border-slate-950 ring-2 ring-slate-950' : 'border-gray-100 hover:shadow-md',
                        )}
                      >
                        <button
                          className="relative block aspect-square w-full overflow-hidden bg-gray-50 text-left"
                          onClick={() => {
                            if (isBulkMode) { toggleDbPhotoSelection(photo.id) } else {
                              openLightbox(dbLightboxItems, index)
                            }
                          }}
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
                          {isBulkMode ? (
                            <div className={cn(
                              'absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full border-2',
                              isSelected ? 'border-slate-950 bg-slate-950' : 'border-white bg-black/30',
                            )}>
                              {isSelected ? (
                                <svg className="h-3 w-3 text-white" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                                  <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              ) : null}
                            </div>
                          ) : null}
                        </button>
                        <div className="p-2.5">
                          <p className="truncate text-xs font-medium text-gray-800" title={photo.original_file_name}>
                            {photo.original_file_name}
                          </p>
                          <p className="mt-0.5 text-[11px] text-gray-400">{formatRelativeDate(photo.created_at)}</p>
                          {photo.place_name ? (
                            <p className="mt-1 flex items-center gap-1 truncate text-[11px] font-medium text-orange-600">
                              <MapPin className="h-2.5 w-2.5 shrink-0" />
                              {photo.place_name}
                            </p>
                          ) : null}
                          {photo.tags.length > 0 ? (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {photo.tags.slice(0, 2).map((tag) => (
                                <span key={tag} className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">{tag}</span>
                              ))}
                              {photo.tags.length > 2 ? (
                                <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-400">+{photo.tags.length - 2}</span>
                              ) : null}
                            </div>
                          ) : null}
                          {/* Per-photo actions */}
                          {!isBulkMode ? (
                            <div className="mt-2 flex items-center justify-end gap-1">
                              <button
                                aria-label="Move to folder"
                                className="flex h-6 w-6 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                                onClick={() => openMoveModal([photo.id])}
                                title="Move to folder"
                                type="button"
                              >
                                <ArrowRight className="h-3 w-3" />
                              </button>
                              <button
                                aria-label="Download"
                                className="flex h-6 w-6 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                                onClick={() => void downloadPhoto(photo.image_url, photo.original_file_name)}
                                title="Download photo"
                                type="button"
                              >
                                <Download className="h-3 w-3" />
                              </button>
                              <button
                                aria-label={`Delete ${photo.original_file_name}`}
                                className="flex h-6 w-6 items-center justify-center rounded-full text-red-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:text-gray-200"
                                disabled={deletingPhotoIds.has(photo.id)}
                                onClick={() => void handleDeleteDbPhoto(photo.id)}
                                title="Delete"
                                type="button"
                              >
                                {deletingPhotoIds.has(photo.id) ? <Spinner className="h-3 w-3" /> : <Trash2 className="h-3 w-3" />}
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : null}

              {/* List view */}
              {!isLoadingPhotos && !photosError && filteredDbPhotosWithFilters.length > 0 && photosViewMode === 'list' ? (
                <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
                  <div className="min-w-[640px]">
                  <div className="grid grid-cols-[2rem_2.5rem_1fr_auto_auto_auto] items-center gap-3 border-b border-gray-100 px-4 py-2.5">
                    {isBulkMode ? <span className="text-xs text-gray-400">✓</span> : <span />}
                    <span />
                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">File name</span>
                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Size</span>
                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Date</span>
                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Actions</span>
                  </div>
                  {filteredDbPhotosWithFilters.map((photo, index) => {
                    const isSelected = selectedDbPhotoIds.has(photo.id)
                    return (
                      <div
                        key={photo.id}
                        className={cn(
                          'grid grid-cols-[2rem_2.5rem_1fr_auto_auto_auto] items-center gap-3 border-b border-gray-50 px-4 py-3 transition-colors last:border-0',
                          isBulkMode && isSelected ? 'bg-blue-50' : 'hover:bg-gray-50',
                        )}
                      >
                        {/* Select checkbox */}
                        {isBulkMode ? (
                          <button
                            className={cn(
                              'flex h-5 w-5 items-center justify-center rounded border-2 transition-colors',
                              isSelected ? 'border-slate-950 bg-slate-950' : 'border-gray-300',
                            )}
                            onClick={() => toggleDbPhotoSelection(photo.id)}
                            type="button"
                          >
                            {isSelected ? (
                              <svg className="h-3 w-3 text-white" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                                <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            ) : null}
                          </button>
                        ) : <span />}

                        <button
                          aria-label={`View ${photo.original_file_name}`}
                          className="h-10 w-10 overflow-hidden rounded-lg bg-gray-100"
                          onClick={() => openLightbox(dbLightboxItems, index)}
                          type="button"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img alt={photo.original_file_name} className="h-full w-full object-cover" loading="lazy" src={photo.image_url} />
                        </button>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-gray-800">{photo.original_file_name}</p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-2">
                            {photo.place_name ? (
                              <span className="flex items-center gap-0.5 text-xs text-orange-500">
                                <MapPin className="h-3 w-3" />
                                {photo.place_name}
                              </span>
                            ) : null}
                            {photo.tags.slice(0, 2).map((tag) => (
                              <span key={tag} className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">{tag}</span>
                            ))}
                          </div>
                        </div>
                        <span className="shrink-0 text-xs text-gray-400">{formatBytes(photo.file_size_bytes)}</span>
                        <span className="shrink-0 text-xs text-gray-400">{formatRelativeDate(photo.created_at)}</span>
                        <div className="flex items-center gap-1">
                          <button
                            aria-label="Move to folder"
                            className="flex h-7 w-7 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                            onClick={() => openMoveModal([photo.id])}
                            title="Move to folder"
                            type="button"
                          >
                            <ArrowRight className="h-3.5 w-3.5" />
                          </button>
                          <button
                            aria-label="Download"
                            className="flex h-7 w-7 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                            onClick={() => void downloadPhoto(photo.image_url, photo.original_file_name)}
                            title="Download"
                            type="button"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </button>
                          <button
                            aria-label={`Delete ${photo.original_file_name}`}
                            className="flex h-7 w-7 items-center justify-center rounded-full text-red-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:text-gray-200"
                            disabled={deletingPhotoIds.has(photo.id)}
                            onClick={() => void handleDeleteDbPhoto(photo.id)}
                            type="button"
                          >
                            {deletingPhotoIds.has(photo.id) ? <Spinner className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                  </div>
                </div>
              ) : null}

              {/* Search / filter no-results */}
              {!isLoadingPhotos && !photosError && dbPhotos.length > 0 && filteredDbPhotosWithFilters.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-20">
                  <Search className="h-10 w-10 text-gray-200" />
                  <p className="text-sm text-gray-400">
                    No photos match the current search or filters.
                  </p>
                  <button
                    className="text-sm text-blue-600 hover:underline"
                    onClick={() => {
                      setSearchQuery('')
                      setPhotosFilterFolderId('')
                      setPhotosFilterGpsOnly(false)
                      setPhotosFilterUntagged(false)
                    }}
                    type="button"
                  >
                    Clear all filters
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </main>
      </div>

      {/* ─── Floating selection bar (upload queue) ───────────────────────────── */}
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

      {/* ─── Floating bulk bar (My Photos) ───────────────────────────────────── */}
      {isBulkMode && selectedDbPhotoIds.size > 0 ? (
        <div className="pointer-events-none fixed bottom-6 left-0 right-0 z-50 flex justify-center px-4">
          <div className="pointer-events-auto flex items-center gap-3 rounded-2xl bg-slate-950 px-5 py-3 shadow-2xl">
            <span className="text-sm font-medium text-white">
              {selectedDbPhotoIds.size} selected
            </span>
            <div className="h-4 w-px bg-white/20" />
            <button
              className="flex items-center gap-1.5 rounded-xl bg-white px-4 py-1.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-white/90"
              onClick={() => openMoveModal([...selectedDbPhotoIds])}
              type="button"
            >
              <ArrowRight className="h-3.5 w-3.5" />
              Move to folder
            </button>
            <button
              className="flex items-center gap-1.5 rounded-xl bg-red-500 px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-50"
              disabled={isBulkDeleting}
              onClick={() => void handleBulkDeleteDbPhotos()}
              type="button"
            >
              {isBulkDeleting ? <Spinner className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
              Delete selected
            </button>
            <button
              className="text-sm font-medium text-white/60 transition-colors hover:text-white"
              onClick={() => { setSelectedDbPhotoIds(new Set()); setIsBulkMode(false) }}
              type="button"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {/* ─── Profile modal ────────────────────────────────────────────────────── */}
      <Dialog
        open={isProfileOpen}
        onOpenChange={(open) => {
          setIsProfileOpen(open)
          if (!open) setProfileError('')
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-3xl sm:max-w-md">
          <DialogTitle className="text-lg font-semibold">Your profile</DialogTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Names sync across folders and photos you uploaded. Avatar upload limit{' '}
            {MAX_AVATAR_UPLOAD_BYTES / (1024 * 1024)} MB — JPEG preview stored about 512×512.
          </p>
          <form className="mt-4 space-y-4" onSubmit={handleSaveProfile}>
            <div className="flex flex-col items-center gap-3">
              <ProfileAvatarBubble
                avatarUrl={liveUser.avatarUrl}
                initials={initials}
                sizeClasses="h-20 w-20 text-xl"
              />
              <input
                accept="image/*"
                className="hidden"
                onChange={(e) => void handleProfileAvatarPick(e.target.files)}
                ref={profileAvatarInputRef}
                type="file"
              />
              <button
                className="text-sm font-semibold transition-opacity hover:opacity-80 disabled:opacity-50"
                disabled={avatarUploading}
                onClick={() => profileAvatarInputRef.current?.click()}
                style={{ color: 'var(--ds-primary)' }}
                type="button"
              >
                {avatarUploading ? 'Uploading…' : 'Change photo'}
              </button>
            </div>
            {profileError ? (
              <p className="text-center text-sm text-red-600">{profileError}</p>
            ) : null}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground" htmlFor="profile-first">
                First name
              </label>
              <input
                className="h-11 w-full rounded-xl border border-border/70 bg-white px-4 text-sm text-foreground shadow-sm transition-shadow focus:outline-none focus:ring-2 focus:ring-slate-950"
                id="profile-first"
                onChange={(e) => setProfileFirstName(e.target.value)}
                required
                value={profileFirstName}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground" htmlFor="profile-last">
                Last name
              </label>
              <input
                className="h-11 w-full rounded-xl border border-border/70 bg-white px-4 text-sm text-foreground shadow-sm transition-shadow focus:outline-none focus:ring-2 focus:ring-slate-950"
                id="profile-last"
                onChange={(e) => setProfileLastName(e.target.value)}
                required
                value={profileLastName}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground" htmlFor="profile-phone">
                Phone
              </label>
              <input
                className="h-11 w-full rounded-xl border border-border/70 bg-white px-4 text-sm text-foreground shadow-sm transition-shadow focus:outline-none focus:ring-2 focus:ring-slate-950"
                id="profile-phone"
                onChange={(e) => setProfilePhone(e.target.value)}
                required
                value={profilePhone}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground" htmlFor="profile-area">
                Area focused
              </label>
              <input
                className="h-11 w-full rounded-xl border border-border/70 bg-white px-4 text-sm text-foreground shadow-sm transition-shadow focus:outline-none focus:ring-2 focus:ring-slate-950"
                id="profile-area"
                onChange={(e) => setProfileArea(e.target.value)}
                required
                value={profileArea}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                className="rounded-xl border border-border/70 px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted/40"
                onClick={() => setIsProfileOpen(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="rounded-xl px-5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                disabled={profileSaving || avatarUploading}
                style={{ backgroundColor: 'var(--ds-primary)' }}
                type="submit"
              >
                {profileSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

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
              <DialogTitle className="text-lg font-semibold leading-tight">
                {folderModalMode === 'edit' ? 'Edit Folder Location' : 'New Folder Location'}
              </DialogTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {folderModalMode === 'edit'
                  ? 'Update this folder’s name, address, and classification'
                  : 'Create a location folder to group and auto-tag uploads'}
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
                      onKeyDown={(e) => { if (e.key === 'Enter') { folderModalMode === 'edit' ? void handleUpdateFolder() : void handleCreateFolder() } }}
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

                  <button
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-white px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted/30 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={isSearchingFolderAddress}
                    onClick={() => void handleUseCurrentLocationForFolder()}
                    type="button"
                  >
                    <MapPin className="h-3.5 w-3.5" />
                    Use my location
                  </button>

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
                onClick={() => folderModalMode === 'edit' ? void handleUpdateFolder() : void handleCreateFolder()}
                type="button"
              >
                {isSavingFolder
                  ? (folderModalMode === 'edit' ? 'Saving…' : 'Creating…')
                  : (folderModalMode === 'edit' ? 'Save changes' : 'Create folder')}
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
          <DialogTitle className="sr-only">Photo Lightbox</DialogTitle>
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
                <div className="flex items-center gap-3">
                  <button
                    className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-white/20"
                    onClick={() => void downloadPhoto(currentLightboxImage.src, currentLightboxImage.alt)}
                    type="button"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download
                  </button>
                  <p className="shrink-0 text-xs text-white/70">
                    {(lightboxIndex ?? 0) + 1} / {lightboxImages.length}
                  </p>
                </div>
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

      {/* ─── Folder delete confirm modal ─────────────────────────────────────── */}
      <Dialog
        open={deleteFolderTarget != null}
        onOpenChange={(open) => {
          if (!open) { setDeleteFolderTarget(null); setDeleteFolderError('') }
        }}
      >
        <DialogContent
          className="rounded-3xl p-0 sm:max-w-md"
          showCloseButton={false}
        >
          {/* Warning header */}
          <div className="flex items-start gap-4 border-b border-gray-100 px-6 py-5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-100">
              <AlertTriangle className="h-6 w-6 text-red-600" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-gray-900">
                Delete &ldquo;{deleteFolderTarget?.folder_name}&rdquo;?
              </DialogTitle>
              <p className="mt-1 text-sm text-gray-500">
                This action cannot be undone. Choose what happens to the photos inside.
              </p>
            </div>
          </div>

          <div className="px-6 py-5 space-y-3">
            <label className={cn(
              'flex cursor-pointer items-start gap-4 rounded-2xl border-2 p-4 transition-colors',
              deleteFolderOption === 'unfile' ? 'border-slate-950 bg-slate-50' : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50',
            )}>
              <input
                checked={deleteFolderOption === 'unfile'}
                className="mt-1"
                onChange={() => setDeleteFolderOption('unfile')}
                type="radio"
              />
              <div>
                <p className="text-sm font-bold text-gray-800">Keep photos (unassign)</p>
                <p className="mt-0.5 text-xs text-gray-500">
                  Photos stay in My Photos but are no longer grouped under this folder.
                </p>
              </div>
            </label>

            <label className={cn(
              'flex cursor-pointer items-start gap-4 rounded-2xl border-2 p-4 transition-colors',
              deleteFolderOption === 'delete-all' ? 'border-red-500 bg-red-50' : 'border-gray-100 hover:border-gray-200 hover:bg-red-50/30',
            )}>
              <input
                checked={deleteFolderOption === 'delete-all'}
                className="mt-1"
                onChange={() => setDeleteFolderOption('delete-all')}
                type="radio"
              />
              <div>
                <p className="text-sm font-bold text-red-700">Delete folder + all photos</p>
                <p className="mt-0.5 text-xs text-gray-500">
                  Permanently deletes {deleteFolderTarget ? (folderPhotoCountById[deleteFolderTarget.id] ?? 0) : 0} photo(s) and their storage files. Cannot be undone.
                </p>
              </div>
            </label>

            {deleteFolderError ? (
              <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-700">
                {deleteFolderError}
              </p>
            ) : null}
          </div>

          <div className="flex gap-3 border-t border-gray-100 px-6 py-4">
            <button
              className="flex-1 rounded-2xl border border-gray-200 py-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
              onClick={() => { setDeleteFolderTarget(null); setDeleteFolderError('') }}
              type="button"
            >
              Cancel
            </button>
            <button
              className={cn(
                'flex-1 rounded-2xl py-3 text-sm font-semibold text-white transition-colors disabled:opacity-40',
                deleteFolderOption === 'delete-all' ? 'bg-red-600 hover:bg-red-700' : 'bg-slate-950 hover:bg-slate-800',
              )}
              disabled={isDeletingFolder}
              onClick={() => void handleDeleteFolder()}
              type="button"
            >
              {isDeletingFolder ? 'Deleting…' : deleteFolderOption === 'delete-all' ? 'Delete folder & photos' : 'Delete folder'}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Move photo(s) to folder modal ────────────────────────────────────── */}
      <Dialog
        open={isMoveModalOpen}
        onOpenChange={(open) => {
          if (!open) { setIsMoveModalOpen(false); setMoveModalTargetIds([]); setMoveTargetFolderId(''); setMoveSearchQuery('') }
        }}
      >
        <DialogContent
          className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
          showCloseButton={false}
          style={{ borderRadius: '0.5rem', borderColor: 'var(--ds-outline-variant)' }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-6 py-5"
            style={{ borderBottom: '1px solid var(--ds-outline-variant)', backgroundColor: 'var(--ds-surface-container-lowest)' }}
          >
            <DialogTitle className="font-headline text-headline-md" style={{ color: 'var(--ds-on-surface)' }}>
              Move {moveModalTargetIds.length} Selected Photo{moveModalTargetIds.length !== 1 ? 's' : ''}
            </DialogTitle>
            <button
              aria-label="Close"
              className="flex h-8 w-8 items-center justify-center transition-colors hover:opacity-70"
              onClick={() => { setIsMoveModalOpen(false); setMoveModalTargetIds([]); setMoveTargetFolderId(''); setMoveSearchQuery('') }}
              style={{ color: 'var(--ds-outline)' }}
              type="button"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Quick Action */}
          <div className="px-6 py-4" style={{ backgroundColor: 'var(--ds-surface-container-low)' }}>
            <button
              className="text-label-caps flex w-full items-center justify-center gap-2 px-4 py-3 transition-all hover:opacity-80"
              onClick={() => setMoveTargetFolderId('__unfile__')}
              style={{
                border: moveTargetFolderId === '__unfile__' ? '1px solid var(--ds-secondary)' : '1px dashed rgba(181,36,38,0.3)',
                backgroundColor: moveTargetFolderId === '__unfile__' ? 'rgba(181,36,38,0.08)' : 'rgba(181,36,38,0.04)',
                color: 'var(--ds-secondary)',
              }}
              type="button"
            >
              <FolderOpen className="h-4 w-4" />
              REMOVE FROM CURRENT FOLDER
            </button>
          </div>

          {/* Search */}
          <div className="px-6 py-4">
            <label className="text-label-caps mb-2 block" style={{ color: 'var(--ds-outline)' }}>
              Find Destination Folder
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--ds-outline)' }} />
              <input
                className="w-full py-2 pl-10 pr-4 text-sm outline-none transition-colors"
                onChange={(e) => setMoveSearchQuery(e.target.value)}
                placeholder="Search folders..."
                style={{
                  border: '1px solid var(--ds-outline-variant)',
                  backgroundColor: 'var(--ds-surface-container-lowest)',
                  color: 'var(--ds-on-surface)',
                }}
                type="text"
                value={moveSearchQuery}
              />
            </div>
          </div>

          {/* Folder list */}
          <div className="flex-1 space-y-2 overflow-y-auto px-6 pb-6">
            {activeFolders
              .filter(f => !moveSearchQuery || f.folder_name.toLowerCase().includes(moveSearchQuery.toLowerCase()))
              .map((folder) => {
                const selected = moveTargetFolderId === folder.id
                const count = folderPhotoCountById[folder.id] ?? 0
                return (
                  <button
                    key={folder.id}
                    className="flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:opacity-90"
                    onClick={() => setMoveTargetFolderId(folder.id)}
                    style={{
                      border: selected ? '1px solid var(--ds-primary-container)' : '1px solid var(--ds-outline-variant)',
                      backgroundColor: selected ? 'var(--ds-primary)' : 'var(--ds-surface-container-lowest)',
                    }}
                    type="button"
                  >
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center"
                      style={{ backgroundColor: selected ? 'rgba(255,255,255,0.15)' : 'var(--ds-surface-container-low)' }}
                    >
                      <Folder className="h-5 w-5" style={{ color: selected ? 'white' : 'var(--ds-primary)' }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold" style={{ color: selected ? 'white' : 'var(--ds-on-surface)' }}>
                        {folder.folder_name}
                      </p>
                      <p className="truncate text-xs" style={{ color: selected ? 'rgba(255,255,255,0.7)' : 'var(--ds-on-surface-variant)' }}>
                        {folder.city ?? 'No location'}
                      </p>
                    </div>
                    <span className="ml-auto shrink-0 text-xs font-semibold" style={{ color: selected ? 'rgba(255,255,255,0.7)' : 'var(--ds-on-surface-variant)' }}>
                      {count} Photos
                    </span>
                    {selected ? (
                      <CheckCircle2 className="h-5 w-5 shrink-0 text-white" />
                    ) : null}
                  </button>
                )
              })}
            {activeFolders.length === 0 ? (
              <p className="py-6 text-center text-sm" style={{ color: 'var(--ds-outline)' }}>No active folders available.</p>
            ) : null}
          </div>

          {/* Footer */}
          <div
            className="flex items-center justify-end gap-4 px-6 py-4"
            style={{ borderTop: '1px solid var(--ds-outline-variant)', backgroundColor: 'var(--ds-surface-container-lowest)' }}
          >
            <button
              className="text-label-caps px-6 py-3 text-sm transition-colors hover:opacity-70"
              onClick={() => { setIsMoveModalOpen(false); setMoveModalTargetIds([]); setMoveTargetFolderId(''); setMoveSearchQuery('') }}
              style={{ color: 'var(--ds-on-surface-variant)' }}
              type="button"
            >
              Cancel
            </button>
            <button
              className="text-label-caps px-8 py-3 text-sm text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!moveTargetFolderId || isMoveSubmitting}
              onClick={() => void handleMovePhotos()}
              style={{ backgroundColor: 'var(--ds-primary)' }}
              type="button"
            >
              {isMoveSubmitting ? 'MOVING…' : 'MOVE PHOTOS'}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Floating Action Button ───────────────────────────────────────────── */}
      {activeView === 'upload' && activeFolder ? (
        <button
          className="fixed bottom-10 right-10 z-50 flex h-16 w-16 items-center justify-center rounded-full text-white shadow-2xl transition-transform hover:scale-110 active:scale-95"
          style={{ backgroundColor: 'var(--ds-primary)' }}
          onClick={() => fileInputRef.current?.click()}
          title="Upload photos"
          type="button"
        >
          <Upload className="h-7 w-7" />
        </button>
      ) : null}
    </div>
  )
}
