/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['youtube-dl-exec', 'ffmpeg-static'],
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async rewrites() {
    return [
      {
        source: '/api/portals/:path*',
        destination: '/api/portal-api/:path*',
      },
    ]
  },
}

export default nextConfig
