export type PortalFolder = {
  id: string
  parent_folder_id: string | null
  uploader_code: string
  uploader_name: string
  folder_name: string
  created_at: string
  photo_count: number
  is_public_visible: boolean
  sort_order: number
  portal_event_id?: string | null
  portal_photographer_id?: string | null
  owner_name?: string | null
}

export type PortalEvent = {
  id: string
  name: string
  slug: string
  status: string
  cover_image_url: string | null
  qr_logo_url: string | null
  has_photographer_pin?: boolean
  photographer_pin_hash?: string | null
  created_at: string
  updated_at: string
}

export type PortalEventWithStats = PortalEvent & {
  folder_count: number
}

export type PortalPhoto = {
  id: string
  folder_id: string | null
  image_url: string
  original_file_name: string
  file_size_bytes: number
  created_at: string
  uploader_name?: string | null
  uploader_code?: string | null
  portal_photographer_id?: string | null
  owner_name?: string | null
}

export type PortalPhotoPreview = PortalPhoto & {
  subfolder_name: string | null
}

export type PortalFolderNode = PortalFolder & {
  children: PortalFolderNode[]
}
