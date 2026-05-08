/** Max size of each photo accepted by the upload API (25 MB). */
export const MAX_PHOTO_UPLOAD_BYTES = 25 * 1024 * 1024

/**
 * Longest edge in pixels for stored album photos. Images larger than this are
 * downscaled (aspect preserved) so storage stays practical; typical camera files stay untouched.
 */
export const ALBUM_MAX_STORED_EDGE_PX = 8192

/** Max avatar image upload before server resize (5 MB). */
export const MAX_AVATAR_UPLOAD_BYTES = 5 * 1024 * 1024

