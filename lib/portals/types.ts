export type PortalFolder = {
  id: string
  parent_folder_id: string | null
  uploader_code: string
  uploader_name: string
  folder_name: string
  created_at: string
  photo_count: number
}

export type PortalPhoto = {
  id: string
  folder_id: string | null
  image_url: string
  original_file_name: string
  file_size_bytes: number
  created_at: string
}

export type PortalPhotoPreview = PortalPhoto & {
  subfolder_name: string | null
}

export type PortalFolderNode = PortalFolder & {
  children: PortalFolderNode[]
}
