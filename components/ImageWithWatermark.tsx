"use client";

import type { AlbumsMarketplacePhoto } from "@/lib/server/albums";
import { useAuth } from "@/hooks/useAuth";

type ImageWithWatermarkProps = {
  photo: AlbumsMarketplacePhoto;
  className?: string;
  loading?: "lazy" | "eager";
  style?: React.CSSProperties;
};

export function ImageWithWatermark({
  photo,
  className = "",
  loading = "lazy",
  style = {},
}: ImageWithWatermarkProps) {
  const { isLoggedIn, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div
        className={`bg-gray-200 animate-pulse ${className}`}
        aria-label="Loading image"
      />
    );
  }

  return (
    <div className="relative w-full h-auto" style={style}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        alt={photo.original_file_name}
        className={className}
        loading={loading}
        src={photo.image_url}
      />

      {!isLoggedIn && (
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{
            backgroundColor: "rgba(0, 0, 0, 0.05)",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/Homes%20Drive%20Logo%20Blue.png"
            alt="watermark"
            style={{
              width: "180px",
              height: "auto",
              opacity: 0.5,
              pointerEvents: "none",
              transform: "rotate(-45deg)",
            }}
          />
        </div>
      )}
    </div>
  );
}
