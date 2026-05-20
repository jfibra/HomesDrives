'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  BedDouble,
  Camera,
  Church,
  Coffee,
  GraduationCap,
  Image as ImageIcon,
  Landmark,
  MapPin,
  Plus,
  Search,
  ShoppingBag,
  Sun,
  TreePine,
  Users,
  Utensils,
  Wine,
  X,
} from 'lucide-react'

declare global {
  interface Window {
    _adminMapReady?: () => void
  }
}

// Icon paths are drawn on a 38×48 viewport; pin head center ≈ (19,17).
// White icon directly on colored teardrop — matches Google Maps style.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getPlaceMarkerIcon(g: any, types: string[], hasPhotos: boolean) {
  const primary = (types?.[0] ?? '').toLowerCase().replace(/[-_]/g, ' ').trim()

  type IconDef = { pinColor: string; icon: string }
  const W = `fill="none" stroke="white" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"`

  const typeConfig: Record<string, IconDef> = {
    restaurant: {
      pinColor: '#F4511E',
      // Fork (left) + knife (right)
      icon: `<g ${W}>
        <line x1="14" y1="9" x2="14" y2="25"/>
        <path d="M12 9 L12 13 Q14 14.5 16 13 L16 9"/>
        <path d="M23 9 L25 9 Q26.5 12 24.5 16 L23 16 L23 25"/>
      </g>`,
    },
    cafe: {
      pinColor: '#E8A000',
      // Coffee cup with handle and steam
      icon: `<g ${W}>
        <path d="M12 14 L12 20 Q12 23 15 23 L21 23 Q24 23 24 20 L24 14 Z"/>
        <path d="M24 16 Q27 16 27 18.5 Q27 21 24 21"/>
        <path d="M15 12 Q15 10 16.5 10 Q16.5 8 18 8" stroke-width="1.5"/>
        <path d="M19.5 12 Q19.5 10.5 21 10.5" stroke-width="1.5"/>
      </g>`,
    },
    'coffee shop': {
      pinColor: '#E8A000',
      icon: `<g ${W}>
        <path d="M12 14 L12 20 Q12 23 15 23 L21 23 Q24 23 24 20 L24 14 Z"/>
        <path d="M24 16 Q27 16 27 18.5 Q27 21 24 21"/>
        <path d="M15 12 Q15 10 16.5 10 Q16.5 8 18 8" stroke-width="1.5"/>
      </g>`,
    },
    bakery: {
      pinColor: '#E65100',
      // Wheat / bread loaf
      icon: `<g ${W}>
        <path d="M13 19 Q13 13 19 12 Q25 13 25 19 Q25 24 19 25 Q13 24 13 19 Z"/>
        <path d="M14 16 Q19 14 24 16" stroke-width="1.5"/>
        <path d="M13 20 Q19 18 25 20" stroke-width="1.5"/>
      </g>`,
    },
    hotel: {
      pinColor: '#D81B60',
      // Bed with headboard and pillow
      icon: `<g ${W}>
        <line x1="11" y1="25" x2="11" y2="14"/>
        <line x1="27" y1="25" x2="27" y2="17"/>
        <line x1="11" y1="22" x2="27" y2="22"/>
        <path d="M11 17 Q19 13 27 17"/>
        <rect x="12.5" y="17" width="5.5" height="5" rx="1.2" fill="white"/>
      </g>`,
    },
    motel: {
      pinColor: '#AD1457',
      icon: `<g ${W}>
        <line x1="11" y1="25" x2="11" y2="14"/>
        <line x1="27" y1="25" x2="27" y2="17"/>
        <line x1="11" y1="22" x2="27" y2="22"/>
        <path d="M11 17 Q19 13 27 17"/>
        <rect x="12.5" y="17" width="5.5" height="5" rx="1.2" fill="white"/>
      </g>`,
    },
    inn: {
      pinColor: '#AD1457',
      icon: `<g ${W}>
        <line x1="11" y1="25" x2="11" y2="14"/>
        <line x1="27" y1="25" x2="27" y2="17"/>
        <line x1="11" y1="22" x2="27" y2="22"/>
        <path d="M11 17 Q19 13 27 17"/>
        <rect x="12.5" y="17" width="5.5" height="5" rx="1.2" fill="white"/>
      </g>`,
    },
    resort: {
      pinColor: '#00897B',
      // Palm tree
      icon: `<g ${W} stroke-width="1.8">
        <path d="M19 25 Q20 20 22 15"/>
        <path d="M22 15 Q18 13 15 10 Q16.5 13.5 20 15" fill="white" fill-opacity="0.75" stroke-width="1.3"/>
        <path d="M22 15 Q26.5 13 29 10 Q27 14 23 15" fill="white" fill-opacity="0.75" stroke-width="1.3"/>
        <path d="M22 15 Q21 10 20 8 Q23 11 22 15" fill="white" fill-opacity="0.75" stroke-width="1.3"/>
      </g>`,
    },
    bar: {
      pinColor: '#F57C00',
      // Beer mug
      icon: `<g ${W}>
        <path d="M12 10 L13 25 L23 25 L24 10 Z"/>
        <path d="M24 14 Q28 14 28 18 Q28 22 24 22"/>
        <line x1="12" y1="15" x2="24" y2="15"/>
      </g>`,
    },
    pub: {
      pinColor: '#E65100',
      icon: `<g ${W}>
        <path d="M12 10 L13 25 L23 25 L24 10 Z"/>
        <path d="M24 14 Q28 14 28 18 Q28 22 24 22"/>
        <line x1="12" y1="15" x2="24" y2="15"/>
      </g>`,
    },
    club: {
      pinColor: '#7B1FA2',
      // Music note
      icon: `<g ${W}>
        <path d="M16 21 Q16 17 22 15 L22 10 L16 12 Z" fill="white" fill-opacity="0.3"/>
        <circle cx="14.5" cy="22" r="3" fill="white" fill-opacity="0.85" stroke="none"/>
        <circle cx="21" cy="20" r="3" fill="white" fill-opacity="0.85" stroke="none"/>
        <line x1="16" y1="21" x2="16" y2="12"/>
        <line x1="22" y1="19" x2="22" y2="10"/>
        <line x1="16" y1="12" x2="22" y2="10"/>
      </g>`,
    },
    beach: {
      pinColor: '#039BE5',
      // Sun above waves
      icon: `<g ${W}>
        <circle cx="19" cy="12" r="4"/>
        <line x1="19" y1="7" x2="19" y2="5" stroke-width="1.5"/>
        <line x1="23.8" y1="8.2" x2="25.2" y2="6.8" stroke-width="1.5"/>
        <line x1="14.2" y1="8.2" x2="12.8" y2="6.8" stroke-width="1.5"/>
        <path d="M11 21 Q13.5 18 16 21 Q18.5 24 21 21 Q23.5 18 26 21"/>
      </g>`,
    },
    park: {
      pinColor: '#43A047',
      // Tree
      icon: `<g ${W}>
        <line x1="19" y1="25" x2="19" y2="18"/>
        <path d="M11 19 Q15 11 19 10 Q23 11 27 19 Z"/>
      </g>`,
    },
    garden: {
      pinColor: '#66BB6A',
      icon: `<g ${W}>
        <line x1="19" y1="25" x2="19" y2="18"/>
        <path d="M11 19 Q15 11 19 10 Q23 11 27 19 Z"/>
      </g>`,
    },
    church: {
      pinColor: '#78909C',
      // Cross
      icon: `<g fill="white" stroke="none">
        <rect x="17" y="8" width="4" height="18" rx="1.5"/>
        <rect x="11" y="13" width="16" height="4" rx="1.5"/>
      </g>`,
    },
    cathedral: {
      pinColor: '#78909C',
      icon: `<g fill="white" stroke="none">
        <rect x="17" y="8" width="4" height="18" rx="1.5"/>
        <rect x="11" y="13" width="16" height="4" rx="1.5"/>
      </g>`,
    },
    mosque: {
      pinColor: '#5D8A5E',
      // Crescent
      icon: `<g fill="white" stroke="none">
        <path d="M25 10 Q19 7 13 12 Q9 18 13 24 Q19 30 25 26 Q20 26 17 22 Q13 16 18 11 Q21 8 25 10 Z"/>
      </g>`,
    },
    temple: {
      pinColor: '#8D6E63',
      // Torii gate
      icon: `<g ${W}>
        <line x1="12" y1="25" x2="12" y2="14"/>
        <line x1="26" y1="25" x2="26" y2="14"/>
        <path d="M10 13 Q19 9 28 13"/>
        <line x1="11" y1="17" x2="27" y2="17"/>
      </g>`,
    },
    hospital: {
      pinColor: '#E53935',
      // Medical cross
      icon: `<g fill="white" stroke="none">
        <rect x="16.5" y="9" width="5" height="17" rx="1.5"/>
        <rect x="11" y="14.5" width="16" height="5" rx="1.5"/>
      </g>`,
    },
    clinic: {
      pinColor: '#E53935',
      icon: `<g fill="white" stroke="none">
        <rect x="16.5" y="9" width="5" height="17" rx="1.5"/>
        <rect x="11" y="14.5" width="16" height="5" rx="1.5"/>
      </g>`,
    },
    pharmacy: {
      pinColor: '#E53935',
      icon: `<g fill="white" stroke="none">
        <rect x="16.5" y="9" width="5" height="17" rx="1.5"/>
        <rect x="11" y="14.5" width="16" height="5" rx="1.5"/>
      </g>`,
    },
    museum: {
      pinColor: '#5E35B1',
      // Columned building
      icon: `<g ${W}>
        <path d="M10 15 L19 8 L28 15"/>
        <line x1="10" y1="15" x2="28" y2="15"/>
        <line x1="13" y1="15" x2="13" y2="23"/>
        <line x1="19" y1="15" x2="19" y2="23"/>
        <line x1="25" y1="15" x2="25" y2="23"/>
        <line x1="10" y1="23" x2="28" y2="23"/>
      </g>`,
    },
    gallery: {
      pinColor: '#7E57C2',
      // Picture frame
      icon: `<g ${W}>
        <rect x="11" y="10" width="16" height="14" rx="1.5"/>
        <path d="M13 20 L16 14 L19 18 L22 15 L25 20"/>
      </g>`,
    },
    mall: {
      pinColor: '#E91E63',
      // Shopping bag
      icon: `<g ${W}>
        <path d="M12 14 L12 24 Q12 25.5 13.5 25.5 L24.5 25.5 Q26 25.5 26 24 L26 14 Z"/>
        <path d="M15 14 Q15 10 19 10 Q23 10 23 14"/>
      </g>`,
    },
    store: {
      pinColor: '#F9A825',
      icon: `<g ${W}>
        <path d="M12 14 L12 24 Q12 25.5 13.5 25.5 L24.5 25.5 Q26 25.5 26 24 L26 14 Z"/>
        <path d="M15 14 Q15 10 19 10 Q23 10 23 14"/>
      </g>`,
    },
    shop: {
      pinColor: '#F9A825',
      icon: `<g ${W}>
        <path d="M12 14 L12 24 Q12 25.5 13.5 25.5 L24.5 25.5 Q26 25.5 26 24 L26 14 Z"/>
        <path d="M15 14 Q15 10 19 10 Q23 10 23 14"/>
      </g>`,
    },
    supermarket: {
      pinColor: '#7CB342',
      // Shopping cart
      icon: `<g ${W}>
        <path d="M10 11 L13 11 L16 22 L25 22 L27.5 14 L14 14"/>
        <circle cx="17" cy="24.5" r="1.8" fill="white" stroke="none"/>
        <circle cx="24" cy="24.5" r="1.8" fill="white" stroke="none"/>
      </g>`,
    },
    grocery: {
      pinColor: '#7CB342',
      icon: `<g ${W}>
        <path d="M10 11 L13 11 L16 22 L25 22 L27.5 14 L14 14"/>
        <circle cx="17" cy="24.5" r="1.8" fill="white" stroke="none"/>
        <circle cx="24" cy="24.5" r="1.8" fill="white" stroke="none"/>
      </g>`,
    },
    school: {
      pinColor: '#43A047',
      // School building with roof
      icon: `<g ${W}>
        <rect x="12" y="15" width="14" height="10" rx="1"/>
        <path d="M10 15 L19 9 L28 15"/>
        <rect x="16.5" y="18" width="5" height="7" rx="0.5"/>
      </g>`,
    },
    university: {
      pinColor: '#3949AB',
      icon: `<g ${W}>
        <path d="M10 18 L19 12 L28 18"/>
        <line x1="13" y1="18" x2="13" y2="24"/>
        <line x1="25" y1="18" x2="25" y2="24"/>
        <line x1="19" y1="18" x2="19" y2="24"/>
        <line x1="11" y1="24" x2="27" y2="24"/>
        <line x1="11" y1="18" x2="27" y2="18"/>
      </g>`,
    },
    college: {
      pinColor: '#3949AB',
      icon: `<g ${W}>
        <path d="M10 18 L19 12 L28 18"/>
        <line x1="13" y1="18" x2="13" y2="24"/>
        <line x1="25" y1="18" x2="25" y2="24"/>
        <line x1="19" y1="18" x2="19" y2="24"/>
        <line x1="11" y1="24" x2="27" y2="24"/>
        <line x1="11" y1="18" x2="27" y2="18"/>
      </g>`,
    },
    'gas station': {
      pinColor: '#F57C00',
      // Gas pump
      icon: `<g ${W}>
        <rect x="11" y="12" width="11" height="13" rx="1.5"/>
        <path d="M22 15.5 L25.5 14 Q27 14 27 16 L27 20.5 Q27 22 25.5 22"/>
        <line x1="11" y1="17" x2="22" y2="17"/>
      </g>`,
    },
    airport: {
      pinColor: '#039BE5',
      // Airplane (top-down)
      icon: `<g fill="white" stroke="none">
        <path d="M19 8 L21 15 L29 18 L29 20 L21 18 L20 24 L22 25 L22 26 L19 25 L16 26 L16 25 L18 24 L17 18 L9 20 L9 18 L17 15 Z"/>
      </g>`,
    },
    gym: {
      pinColor: '#E53935',
      // Dumbbell
      icon: `<g ${W}>
        <line x1="11" y1="17" x2="27" y2="17"/>
        <rect x="9" y="14" width="4" height="6" rx="2"/>
        <rect x="25" y="14" width="4" height="6" rx="2"/>
        <rect x="13" y="13" width="3" height="8" rx="1.5"/>
        <rect x="22" y="13" width="3" height="8" rx="1.5"/>
      </g>`,
    },
    spa: {
      pinColor: '#AB47BC',
      // Lotus petals
      icon: `<g ${W} stroke-width="1.8">
        <path d="M19 23 Q14 19 14 13 Q17 16 19 16 Q21 16 24 13 Q24 19 19 23" fill="white" fill-opacity="0.25"/>
        <path d="M13 21 Q9 16 11 10 Q13 14 15 17" fill="white" fill-opacity="0.25"/>
        <path d="M25 21 Q29 16 27 10 Q25 14 23 17" fill="white" fill-opacity="0.25"/>
      </g>`,
    },
    salon: {
      pinColor: '#F06292',
      // Scissors
      icon: `<g ${W}>
        <circle cx="13.5" cy="12.5" r="3"/>
        <circle cx="13.5" cy="23.5" r="3"/>
        <line x1="15.8" y1="10.5" x2="27" y2="25"/>
        <line x1="15.8" y1="25.5" x2="27" y2="11"/>
      </g>`,
    },
    'tourist spot': {
      pinColor: '#1E88E5',
      // Camera
      icon: `<g ${W}>
        <rect x="11" y="14" width="16" height="11" rx="2"/>
        <circle cx="19" cy="19.5" r="3.5"/>
        <path d="M15.5 14 L17 11 L21 11 L22.5 14"/>
        <circle cx="24.5" cy="15.5" r="1" fill="white" stroke="none"/>
      </g>`,
    },
    attraction: {
      pinColor: '#FFB300',
      // Star
      icon: `<polygon points="19,8 21,14 27.5,14 22.5,18.5 24.5,25 19,21 13.5,25 15.5,18.5 10.5,14 17,14" fill="white" stroke="none"/>`,
    },
    waterfall: {
      pinColor: '#0288D1',
      // Falling water lines with arc
      icon: `<g ${W} stroke-width="1.8">
        <path d="M13 9 Q11 13 13 17 Q15 21 13 25"/>
        <path d="M19 9 Q17 13 19 17 Q21 21 19 25"/>
        <path d="M25 9 Q23 13 25 17 Q27 21 25 25"/>
      </g>`,
    },
    mountain: {
      pinColor: '#78909C',
      // Two peaks with snow cap
      icon: `<g ${W}>
        <path d="M10 25 L17 11 L24 25"/>
        <path d="M18 25 L23 16 L28 25"/>
        <line x1="10" y1="25" x2="28" y2="25"/>
        <path d="M14.5 17 L17 11 L19.5 17" fill="white" fill-opacity="0.5" stroke="none"/>
      </g>`,
    },
    island: {
      pinColor: '#00ACC1',
      // Island with palm
      icon: `<g ${W} stroke-width="1.8">
        <path d="M12 23 Q19 20 26 23" fill="white" fill-opacity="0.3"/>
        <path d="M18 23 Q19 18 21 14"/>
        <path d="M21 14 Q17 12 14 9 Q16 13 19.5 14" fill="white" fill-opacity="0.75" stroke-width="1.2"/>
        <path d="M21 14 Q25 12 27 9 Q25 13 21.5 14" fill="white" fill-opacity="0.75" stroke-width="1.2"/>
        <path d="M21 14 Q20 10 19 8 Q22.5 10.5 21 14" fill="white" fill-opacity="0.75" stroke-width="1.2"/>
      </g>`,
    },
    lake: {
      pinColor: '#0277BD',
      icon: `<g ${W}>
        <path d="M11 15 Q14 12 17 15 Q20 18 23 15 Q26 12 28 15"/>
        <path d="M11 21 Q14 18 17 21 Q20 24 23 21 Q26 18 28 21"/>
      </g>`,
    },
    river: {
      pinColor: '#0288D1',
      icon: `<g ${W}>
        <path d="M11 15 Q14 12 17 15 Q20 18 23 15 Q26 12 28 15"/>
        <path d="M11 21 Q14 18 17 21 Q20 24 23 21 Q26 18 28 21"/>
      </g>`,
    },
    farm: {
      pinColor: '#8D6E63',
      // Barn / wheat stalk
      icon: `<g ${W}>
        <line x1="19" y1="25" x2="19" y2="12"/>
        <path d="M15 17 Q17 13 19 12 Q21 13 23 17"/>
        <line x1="16" y1="19" x2="22" y2="19"/>
        <path d="M16 14 Q14 16 13 20" stroke-width="1.5"/>
        <path d="M22 14 Q24 16 25 20" stroke-width="1.5"/>
      </g>`,
    },
    zoo: {
      pinColor: '#F57F17',
      // Paw print
      icon: `<g fill="white" stroke="none">
        <ellipse cx="15" cy="12" rx="2.5" ry="3"/>
        <ellipse cx="23" cy="12" rx="2.5" ry="3"/>
        <ellipse cx="11.5" cy="17" rx="2" ry="2.5"/>
        <ellipse cx="26.5" cy="17" rx="2" ry="2.5"/>
        <path d="M13.5 18.5 Q14 22.5 19 25 Q24 22.5 24.5 18.5 Q22.5 16 19 16 Q15.5 16 13.5 18.5 Z"/>
      </g>`,
    },
    cinema: {
      pinColor: '#5E35B1',
      // Film strip / clapboard
      icon: `<g ${W}>
        <rect x="11" y="13" width="16" height="12" rx="1.5"/>
        <line x1="11" y1="17" x2="27" y2="17"/>
        <line x1="14" y1="13" x2="12" y2="17"/>
        <line x1="18" y1="13" x2="16" y2="17"/>
        <line x1="22" y1="13" x2="20" y2="17"/>
        <line x1="26" y1="13" x2="24" y2="17"/>
      </g>`,
    },
    theater: {
      pinColor: '#6A1B9A',
      // Comedy mask (simplified smile circle)
      icon: `<g ${W}>
        <circle cx="19" cy="16" r="8"/>
        <path d="M14.5 18 Q19 23 23.5 18"/>
        <circle cx="16" cy="14" r="1.2" fill="white" stroke="none"/>
        <circle cx="22" cy="14" r="1.2" fill="white" stroke="none"/>
      </g>`,
    },
  }

  const config = typeConfig[primary]
  const pinColor = config ? config.pinColor : hasPhotos ? '#1a56db' : '#9ca3af'
  const iconContent = config
    ? config.icon
    : `<circle cx="19" cy="17" r="5.5" fill="white" opacity="0.9"/>`

  const opacity = hasPhotos ? '1' : '0.6'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="38" height="48" viewBox="0 0 38 48">
    <path d="M19 0C8.51 0 0 8.51 0 19c0 12.43 19 29 19 29S38 31.43 38 19C38 8.51 29.49 0 19 0z" fill="${pinColor}" opacity="${opacity}"/>
    ${iconContent}
  </svg>`

  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new g.maps.Size(38, 48),
    anchor: new g.maps.Point(19, 48),
  }
}

const CATEGORY_FILTER_GROUPS: Record<string, string[]> = {
  restaurant: ['restaurant'],
  cafe: ['cafe', 'coffee shop', 'bakery'],
  hotel: ['hotel', 'motel', 'inn', 'resort'],
  bar: ['bar', 'pub', 'club'],
  beach: ['beach'],
  park: ['park', 'garden', 'waterfall', 'mountain', 'island', 'lake', 'river', 'farm', 'zoo'],
  mall: ['mall', 'store', 'shop', 'supermarket', 'grocery'],
  museum: ['museum', 'gallery', 'cinema', 'theater'],
  hospital: ['hospital', 'clinic', 'pharmacy'],
  'tourist spot': ['tourist spot', 'attraction'],
  church: ['church', 'cathedral', 'mosque', 'temple'],
  school: ['school', 'university', 'college'],
}

const FILTER_CATEGORIES = [
  { key: 'restaurant', label: 'Restaurant', icon: Utensils, color: '#F4511E' },
  { key: 'cafe', label: 'Cafe', icon: Coffee, color: '#E8A000' },
  { key: 'hotel', label: 'Hotel', icon: BedDouble, color: '#D81B60' },
  { key: 'bar', label: 'Bar & Pub', icon: Wine, color: '#F57C00' },
  { key: 'beach', label: 'Beach', icon: Sun, color: '#039BE5' },
  { key: 'park', label: 'Park', icon: TreePine, color: '#43A047' },
  { key: 'mall', label: 'Shopping', icon: ShoppingBag, color: '#E91E63' },
  { key: 'museum', label: 'Museum', icon: Landmark, color: '#5E35B1' },
  { key: 'hospital', label: 'Hospital', icon: Plus, color: '#E53935' },
  { key: 'tourist spot', label: 'Tourist Spot', icon: Camera, color: '#1E88E5' },
  { key: 'church', label: 'Church / Temple', icon: Church, color: '#78909C' },
  { key: 'school', label: 'School', icon: GraduationCap, color: '#3949AB' },
]

export type MapFolder = {
  id: string
  folder_name: string
  full_address: string | null
  city: string | null
  province: string | null
  latitude: number | null
  longitude: number | null
  type_of_place: string[]
  tags: string[]
  notes: string | null
  status: string
  created_at: string
  photo_count: number
  cover_image_url: string | null
  owner_user_id: number | null
  owner_name: string
  owner_code: string
}

type MapPhoto = {
  id: string
  image_url: string
  original_file_name: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GMap = any

export default function AdminMapView({
  folders,
  adminCode,
  onOpenFolder,
}: {
  folders: MapFolder[]
  adminCode?: string
  onOpenFolder: (folder: MapFolder) => void
}) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<GMap>(null)
  const markersRef = useRef<GMap[]>([])
  const [isMapLoaded, setIsMapLoaded] = useState(false)
  const [selectedFolder, setSelectedFolder] = useState<MapFolder | null>(null)
  const [folderPhotos, setFolderPhotos] = useState<MapPhoto[]>([])
  const [isLoadingPhotos, setIsLoadingPhotos] = useState(false)
  const [lightboxPhoto, setLightboxPhoto] = useState<MapPhoto | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState<string | null>(null)

  const filteredFolders = useMemo(() => {
    let result = folders.filter((f) => f.latitude != null && f.longitude != null)

    if (activeFilter) {
      const matchTypes = CATEGORY_FILTER_GROUPS[activeFilter] ?? [activeFilter]
      result = result.filter((f) =>
        f.type_of_place.some((t) =>
          matchTypes.includes(t.toLowerCase().replace(/[-_]/g, ' ').trim()),
        ),
      )
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (f) =>
          f.folder_name.toLowerCase().includes(q) ||
          (f.full_address ?? '').toLowerCase().includes(q) ||
          (f.city ?? '').toLowerCase().includes(q) ||
          (f.province ?? '').toLowerCase().includes(q) ||
          f.type_of_place.some((t) => t.toLowerCase().includes(q)) ||
          f.tags.some((t) => t.toLowerCase().includes(q)),
      )
    }

    return result
  }, [folders, searchQuery, activeFilter])

  // Load Google Maps script dynamically
  useEffect(() => {
    if (typeof window === 'undefined') return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).google?.maps) {
      setIsMapLoaded(true)
      return
    }

    window._adminMapReady = () => setIsMapLoaded(true)

    if (!document.getElementById('gmap-admin-script')) {
      const script = document.createElement('script')
      script.id = 'gmap-admin-script'
      script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&callback=_adminMapReady`
      script.async = true
      document.head.appendChild(script)
    }
  }, [])

  // Initialize map once the script is ready
  useEffect(() => {
    if (!isMapLoaded || !mapRef.current) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = (window as any).google
    const map = new g.maps.Map(mapRef.current, {
      center: { lat: 12.8797, lng: 121.774 },
      zoom: 6,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
      zoomControlOptions: {
        position: g.maps.ControlPosition.RIGHT_CENTER,
      },
      styles: [
        { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
        { featureType: 'transit', elementType: 'labels', stylers: [{ visibility: 'off' }] },
      ],
    })

    mapInstanceRef.current = map
  }, [isMapLoaded])

  const loadPhotos = useCallback(
    async (folderId: string) => {
      setIsLoadingPhotos(true)
      setFolderPhotos([])
      try {
        const url = adminCode
          ? `/api/admin/folders/${folderId}/photos?adminCode=${encodeURIComponent(adminCode)}`
          : `/api/folders/${folderId}/photos`
        const r = await fetch(url)
        const data = await r.json().catch(() => null)
        if (!r.ok) throw new Error(data?.error ?? 'Unable to load photos.')
        setFolderPhotos(Array.isArray(data?.photos) ? data.photos : [])
      } catch {
        setFolderPhotos([])
      } finally {
        setIsLoadingPhotos(false)
      }
    },
    [adminCode],
  )

  // Close detail panel when the selected folder is filtered out
  useEffect(() => {
    if (selectedFolder && !filteredFolders.find((f) => f.id === selectedFolder.id)) {
      setSelectedFolder(null)
    }
  }, [filteredFolders, selectedFolder])

  // Place / update markers whenever filtered folders or map changes
  useEffect(() => {
    if (!mapInstanceRef.current || !isMapLoaded) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = (window as any).google

    // Remove old markers
    markersRef.current.forEach((m) => m.setMap(null))
    markersRef.current = []

    if (filteredFolders.length === 0) return

    const bounds = new g.maps.LatLngBounds()

    filteredFolders.forEach((folder) => {
      const pos = { lat: folder.latitude!, lng: folder.longitude! }
      bounds.extend(pos)

      const marker = new g.maps.Marker({
        position: pos,
        map: mapInstanceRef.current,
        title: folder.folder_name,
        icon: getPlaceMarkerIcon(g, folder.type_of_place, folder.photo_count > 0),
      })

      marker.addListener('click', () => {
        setSelectedFolder(folder)
        setFolderPhotos([])
        void loadPhotos(folder.id)
        mapInstanceRef.current.panTo(pos)
      })

      markersRef.current.push(marker)
    })

    if (filteredFolders.length === 1) {
      mapInstanceRef.current.setCenter(bounds.getCenter())
      mapInstanceRef.current.setZoom(14)
    } else {
      mapInstanceRef.current.fitBounds(bounds, { padding: 80 })
    }
  }, [filteredFolders, isMapLoaded, loadPhotos])

  const allWithCoords = folders.filter((f) => f.latitude != null && f.longitude != null)
  const foldersWithoutCoords = folders.length - allWithCoords.length
  const isFiltered = activeFilter !== null || searchQuery.trim() !== ''

  const categoryCounts = useMemo(
    () =>
      FILTER_CATEGORIES.map(({ key, label, icon, color }) => {
        const matchTypes = CATEGORY_FILTER_GROUPS[key] ?? [key]
        const count = folders.filter((f) =>
          f.type_of_place.some((t) =>
            matchTypes.includes(t.toLowerCase().replace(/[-_]/g, ' ').trim()),
          ),
        ).length
        return { key, label, icon, color, count }
      }).filter(({ count }) => count > 0),
    [folders],
  )

  return (
    <div className="relative h-full w-full">
      {/* Map canvas fills the container */}
      <div ref={mapRef} className="absolute inset-0" />

      {/* Loading overlay */}
      {!isMapLoaded && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ backgroundColor: 'var(--ds-surface-container-low)' }}
        >
          <span className="text-sm" style={{ color: 'var(--ds-on-surface-variant)' }}>
            Loading map…
          </span>
        </div>
      )}

      {/* Stats badge — top-left */}
      {isMapLoaded && (
        <div
          className="absolute left-3 top-3 z-10 rounded-xl border bg-white/95 px-3 py-2 text-xs shadow-md backdrop-blur"
          style={{ borderColor: 'var(--ds-outline-variant)' }}
        >
          <div className="font-semibold" style={{ color: 'var(--ds-on-surface)' }}>
            {isFiltered ? (
              <>
                {filteredFolders.length}{' '}
                <span style={{ color: 'var(--ds-on-surface-variant)', fontWeight: 400 }}>
                  of {allWithCoords.length}
                </span>{' '}
                shown
              </>
            ) : (
              <>
                {allWithCoords.length} pinned location
                {allWithCoords.length !== 1 ? 's' : ''}
              </>
            )}
          </div>
          {foldersWithoutCoords > 0 && (
            <div className="mt-0.5" style={{ color: 'var(--ds-on-surface-variant)' }}>
              {foldersWithoutCoords} without coordinates
            </div>
          )}
          <div className="mt-1.5" style={{ color: 'var(--ds-on-surface-variant)' }}>
            Pin icon = place type
          </div>
        </div>
      )}

      {/* Search bar — top center */}
      {isMapLoaded && (
        <div className="absolute left-1/2 top-3 z-10 -translate-x-1/2">
          <div
            className="flex items-center gap-2 rounded-xl border bg-white/95 px-3 py-2 shadow-md backdrop-blur"
            style={{ borderColor: 'var(--ds-outline-variant)' }}
          >
            <Search className="h-4 w-4 shrink-0 text-gray-400" />
            <input
              className="w-56 bg-transparent text-sm outline-none placeholder:text-gray-400"
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search places, cities, types…"
              style={{ color: 'var(--ds-on-surface)' }}
              type="text"
              value={searchQuery}
            />
            {searchQuery && (
              <button
                aria-label="Clear search"
                className="shrink-0 text-gray-400 hover:text-gray-600"
                onClick={() => setSearchQuery('')}
                type="button"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Category count summary — below search bar */}
      {isMapLoaded && categoryCounts.length > 0 && (
        <div className="absolute left-1/2 top-14 z-10 -translate-x-1/2">
          <div
            className="flex max-w-[80vw] gap-1.5 overflow-x-auto rounded-2xl border bg-white/95 p-1.5 shadow-md backdrop-blur"
            style={{ borderColor: 'var(--ds-outline-variant)', scrollbarWidth: 'none' }}
          >
            {categoryCounts.map(({ key, label, icon: Icon, color, count }) => (
              <button
                aria-label={`Filter by ${label}`}
                className={`flex shrink-0 items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-medium transition-all ${
                  activeFilter === key
                    ? 'text-white shadow-sm'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-800'
                }`}
                key={key}
                onClick={() => setActiveFilter(activeFilter === key ? null : key)}
                style={activeFilter === key ? { backgroundColor: color } : undefined}
                title={`${count} ${label}${count !== 1 ? 's' : ''} captured`}
                type="button"
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span>{label}</span>
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                    activeFilter === key ? 'bg-white/25 text-white' : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {count}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Category filter strip — right side (hidden when detail panel is open) */}
      {isMapLoaded && !selectedFolder && (
        <div
          className="absolute right-14 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-1 rounded-2xl border bg-white/95 p-1.5 shadow-lg backdrop-blur"
          style={{ borderColor: 'var(--ds-outline-variant)' }}
        >
          {FILTER_CATEGORIES.map(({ key, label, icon: Icon, color }) => (
            <button
              aria-label={label}
              className={`flex h-9 w-9 items-center justify-center rounded-xl transition-all ${
                activeFilter === key
                  ? 'shadow-sm'
                  : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
              }`}
              key={key}
              onClick={() => setActiveFilter(activeFilter === key ? null : key)}
              style={activeFilter === key ? { backgroundColor: color, color: 'white' } : undefined}
              title={label}
              type="button"
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
          {activeFilter && (
            <button
              aria-label="Show all categories"
              className="flex h-8 w-9 items-center justify-center rounded-xl bg-gray-100 text-gray-500 transition-all hover:bg-gray-200"
              onClick={() => setActiveFilter(null)}
              title="Show all"
              type="button"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {/* ── Side panel ── */}
      {selectedFolder && (
        <div
          className="absolute right-0 top-0 z-10 flex h-full w-80 flex-col overflow-hidden border-l bg-white shadow-2xl"
          style={{ borderColor: 'var(--ds-outline-variant)' }}
        >
          {/* Panel header */}
          <header
            className="flex shrink-0 items-center gap-2 border-b px-4 py-3"
            style={{ borderColor: 'var(--ds-outline-variant)' }}
          >
            <button
              aria-label="Close panel"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-slate-100"
              onClick={() => setSelectedFolder(null)}
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="min-w-0 flex-1">
              <div
                className="truncate text-sm font-semibold"
                style={{ color: 'var(--ds-on-surface)' }}
              >
                {selectedFolder.folder_name}
              </div>
              {(selectedFolder.city ?? selectedFolder.province) && (
                <div
                  className="truncate text-[11px]"
                  style={{ color: 'var(--ds-on-surface-variant)' }}
                >
                  {[selectedFolder.city, selectedFolder.province].filter(Boolean).join(', ')}
                </div>
              )}
            </div>
          </header>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto">
            {/* Cover photo */}
            {selectedFolder.cover_image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt={selectedFolder.folder_name}
                className="h-44 w-full object-cover"
                src={selectedFolder.cover_image_url}
              />
            ) : (
              <div
                className="flex h-32 w-full items-center justify-center"
                style={{ backgroundColor: 'var(--ds-surface-container)' }}
              >
                <ImageIcon
                  className="h-10 w-10 opacity-20"
                  style={{ color: 'var(--ds-on-surface-variant)' }}
                />
              </div>
            )}

            {/* Detail fields */}
            <div className="flex flex-col gap-3 p-4">
              {/* Address */}
              {selectedFolder.full_address && (
                <div
                  className="flex items-start gap-1.5 text-xs"
                  style={{ color: 'var(--ds-on-surface-variant)' }}
                >
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{selectedFolder.full_address}</span>
                </div>
              )}

              {/* Owner */}
              <div
                className="flex items-center gap-1.5 text-xs"
                style={{ color: 'var(--ds-on-surface-variant)' }}
              >
                <Users className="h-3.5 w-3.5 shrink-0" />
                <span>
                  Captured by{' '}
                  <span className="font-semibold" style={{ color: 'var(--ds-on-surface)' }}>
                    {selectedFolder.owner_name}
                  </span>{' '}
                  <span className="font-mono text-[10px]">{selectedFolder.owner_code}</span>
                </span>
              </div>

              {/* Place types */}
              {selectedFolder.type_of_place?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {selectedFolder.type_of_place.map((t) => (
                    <span
                      key={t}
                      className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700"
                    >
                      {t.replace(/-/g, ' ')}
                    </span>
                  ))}
                </div>
              )}

              {/* Tags */}
              {selectedFolder.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {selectedFolder.tags.map((t) => (
                    <span
                      key={t}
                      className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600"
                    >
                      {t.replace(/-/g, ' ')}
                    </span>
                  ))}
                </div>
              )}

              {/* Photo count + status */}
              <div
                className="flex items-center gap-3 text-xs"
                style={{ color: 'var(--ds-on-surface-variant)' }}
              >
                <span className="flex items-center gap-1">
                  <ImageIcon className="h-3.5 w-3.5" />
                  {selectedFolder.photo_count}{' '}
                  {selectedFolder.photo_count === 1 ? 'photo' : 'photos'}
                </span>
                {selectedFolder.status === 'archived' && (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 font-semibold text-gray-500">
                    Archived
                  </span>
                )}
              </div>

              {/* CTA */}
              <button
                className="w-full rounded-lg py-2 text-sm font-semibold transition-all hover:opacity-90 active:scale-95"
                onClick={() => onOpenFolder(selectedFolder)}
                style={{
                  backgroundColor: 'var(--ds-primary)',
                  color: 'var(--ds-on-primary)',
                }}
                type="button"
              >
                Browse All Photos
              </button>
            </div>

            {/* Photo grid */}
            <div className="border-t px-4 pb-6 pt-3" style={{ borderColor: 'var(--ds-outline-variant)' }}>
              <div
                className="mb-2 text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: 'var(--ds-on-surface-variant)' }}
              >
                Photos in this location
              </div>

              {isLoadingPhotos ? (
                <div className="grid grid-cols-3 gap-1">
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="aspect-square animate-pulse rounded-lg bg-gray-100" />
                  ))}
                </div>
              ) : folderPhotos.length === 0 ? (
                <div
                  className="flex h-16 items-center justify-center rounded-lg border border-dashed text-xs"
                  style={{
                    borderColor: 'var(--ds-outline-variant)',
                    color: 'var(--ds-on-surface-variant)',
                  }}
                >
                  No photos yet
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-1">
                  {folderPhotos.map((photo) => (
                    <button
                      key={photo.id}
                      className="aspect-square overflow-hidden rounded-lg"
                      onClick={() => setLightboxPhoto(photo)}
                      type="button"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        alt={photo.original_file_name}
                        className="h-full w-full object-cover transition-transform hover:scale-105"
                        src={photo.image_url}
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightboxPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          onClick={() => setLightboxPhoto(null)}
        >
          <button
            aria-label="Close lightbox"
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
            onClick={() => setLightboxPhoto(null)}
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt={lightboxPhoto.original_file_name}
            className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            src={lightboxPhoto.image_url}
          />
        </div>
      )}
    </div>
  )
}
