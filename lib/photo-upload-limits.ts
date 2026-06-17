/** Max size of each photo accepted by the upload API (50 MB). */
export const MAX_PHOTO_UPLOAD_BYTES = 50 * 1024 * 1024

/** Max size of each video accepted by the upload API (1 GB). */
export const MAX_VIDEO_UPLOAD_BYTES = 1024 * 1024 * 1024

/** Videos larger than this use S3 multipart upload (direct browser → S3). */
export const MULTIPART_VIDEO_THRESHOLD_BYTES = 500 * 1024 * 1024

/** Size of each multipart chunk (32 MB; S3 minimum is 5 MB except the last part). */
export const MULTIPART_PART_SIZE_BYTES = 32 * 1024 * 1024

/** Presigned URL lifetime for photo uploads (15 minutes). */
export const DEFAULT_PRESIGN_EXPIRY_SECONDS = 60 * 15

/** Presigned URL lifetime for video uploads (60 minutes). */
export const VIDEO_PRESIGN_EXPIRY_SECONDS = 60 * 60

/**
 * Longest edge in pixels for stored album photos. Images larger than this are
 * downscaled (aspect preserved) so storage stays practical; typical camera files stay untouched.
 * Photographer/public portal uploads skip this and store the original file bytes.
 */
export const ALBUM_MAX_STORED_EDGE_PX = 8192

/** Max avatar image upload before server resize (5 MB). */
export const MAX_AVATAR_UPLOAD_BYTES = 5 * 1024 * 1024

