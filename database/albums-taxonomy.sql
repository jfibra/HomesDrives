create table if not exists public.albums_place_types (
  id bigint generated always as identity primary key,
  slug text not null unique,
  label text not null unique,
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.albums_tags (
  id bigint generated always as identity primary key,
  slug text not null unique,
  label text not null unique,
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists albums_place_types_active_sort_idx
  on public.albums_place_types (is_active, sort_order, label);

create index if not exists albums_tags_active_sort_idx
  on public.albums_tags (is_active, sort_order, label);

insert into public.albums_place_types (slug, label, description, sort_order)
values
  ('restaurant', 'Restaurant', 'Dining spaces, eateries, and food service venues.', 10),
  ('cafe', 'Cafe', 'Coffee shops, pastry bars, and casual cafe interiors.', 20),
  ('bar', 'Bar', 'Bars, lounges, pubs, and nightlife beverage spaces.', 30),
  ('bakery', 'Bakery', 'Bake shops, pastry counters, and bread-focused venues.', 40),
  ('food-court', 'Food Court', 'Shared dining halls and food-court stalls.', 50),
  ('hotel', 'Hotel', 'Hotels, inns, lobbies, and hospitality spaces.', 60),
  ('resort', 'Resort', 'Resorts, leisure accommodations, and getaway properties.', 70),
  ('beach', 'Beach', 'Beachfronts, shorelines, and coastal leisure areas.', 80),
  ('pool', 'Pool', 'Swimming pools, pool decks, and poolside scenes.', 90),
  ('park', 'Park', 'Parks, public greens, and landscaped outdoor spaces.', 100),
  ('garden', 'Garden', 'Gardens, courtyards, and ornamental outdoor areas.', 110),
  ('mountain', 'Mountain', 'Mountain views, trails, and elevated nature scenes.', 120),
  ('river', 'River', 'Riverbanks, streams, and waterway scenes.', 130),
  ('lake', 'Lake', 'Lakesides, lagoons, and calm freshwater views.', 140),
  ('waterfall', 'Waterfall', 'Waterfalls and cascading nature features.', 150),
  ('forest', 'Forest', 'Tree-covered landscapes and wooded environments.', 160),
  ('farm', 'Farm', 'Agricultural land, farm facilities, and rural production areas.', 170),
  ('residential-home', 'Residential Home', 'Detached houses, model homes, and dwellings.', 180),
  ('apartment', 'Apartment', 'Apartment buildings and residential unit exteriors/interiors.', 190),
  ('condominium', 'Condominium', 'Condo buildings, units, and shared amenities.', 200),
  ('subdivision', 'Subdivision', 'Residential developments, subdivisions, and village streets.', 210),
  ('clubhouse', 'Clubhouse', 'Subdivision clubhouses and community amenity halls.', 220),
  ('mall', 'Mall', 'Shopping malls and large retail complexes.', 230),
  ('retail-store', 'Retail Store', 'Shops, boutiques, and store interiors.', 240),
  ('market', 'Market', 'Public markets, bazaars, and vendor stalls.', 250),
  ('office', 'Office', 'Office floors, corporate interiors, and workplaces.', 260),
  ('coworking-space', 'Coworking Space', 'Shared workspaces and collaborative office hubs.', 270),
  ('warehouse', 'Warehouse', 'Storage facilities and logistics spaces.', 280),
  ('factory', 'Factory', 'Industrial plants and manufacturing facilities.', 290),
  ('school', 'School', 'Primary and secondary school campuses or rooms.', 300),
  ('university', 'University', 'College campuses, lecture halls, and academic facilities.', 310),
  ('hospital', 'Hospital', 'Hospitals and larger medical institutions.', 320),
  ('clinic', 'Clinic', 'Clinics, dental offices, and smaller medical practices.', 330),
  ('gym', 'Gym', 'Fitness centers, workout rooms, and sports training spaces.', 340),
  ('spa', 'Spa', 'Spa, wellness, and relaxation-focused venues.', 350),
  ('salon', 'Salon', 'Hair, grooming, and beauty service spaces.', 360),
  ('museum', 'Museum', 'Museums, galleries, and curated exhibit spaces.', 370),
  ('church', 'Church', 'Churches, chapels, and worship spaces.', 380),
  ('event-venue', 'Event Venue', 'Ballrooms, halls, and private event venues.', 390),
  ('conference-hall', 'Conference Hall', 'Meeting halls and conference rooms.', 400),
  ('tourist-attraction', 'Tourist Attraction', 'Tourism-driven landmarks and leisure destinations.', 410),
  ('landmark', 'Landmark', 'Recognizable landmarks and notable built features.', 420),
  ('street', 'Street', 'Road scenes, streetscapes, and urban corridors.', 430),
  ('transportation-hub', 'Transportation Hub', 'Stations, terminals, ports, and transit points.', 440),
  ('airport', 'Airport', 'Airports, terminals, and aviation-related spaces.', 450),
  ('port', 'Port', 'Seaports, piers, and harbor areas.', 460)
on conflict (slug) do update
set
  label = excluded.label,
  description = excluded.description,
  sort_order = excluded.sort_order,
  is_active = true;

insert into public.albums_tags (slug, label, description, sort_order)
values
  ('architecture', 'Architecture', 'Strong architectural composition or structure focus.', 10),
  ('exterior', 'Exterior', 'Exterior building or venue presentation.', 20),
  ('interior', 'Interior', 'Interior design, fit-out, or indoor space coverage.', 30),
  ('facade', 'Facade', 'Front-facing exterior perspective.', 40),
  ('lobby', 'Lobby', 'Reception and lobby spaces.', 50),
  ('living-room', 'Living Room', 'Residential living room scenes.', 60),
  ('bedroom', 'Bedroom', 'Bedroom spaces and sleep areas.', 70),
  ('kitchen', 'Kitchen', 'Kitchen and cooking-area scenes.', 80),
  ('bathroom', 'Bathroom', 'Bathrooms, washrooms, and vanity areas.', 90),
  ('dining-area', 'Dining Area', 'Dining tables, dining rooms, and meal spaces.', 100),
  ('workspace', 'Workspace', 'Work desks, offices, and productivity setups.', 110),
  ('storefront', 'Storefront', 'Commercial storefront or retail frontage.', 120),
  ('signage', 'Signage', 'Wayfinding, branding, or signage elements.', 130),
  ('amenity', 'Amenity', 'Amenities and supporting property features.', 140),
  ('parking', 'Parking', 'Parking lots, garages, and vehicle access.', 150),
  ('poolside', 'Poolside', 'Pool deck and leisure-by-the-pool scenes.', 160),
  ('beachfront', 'Beachfront', 'Direct coastal or beachfront vantage.', 170),
  ('waterfront', 'Waterfront', 'Riverfront, lakeside, or waterside perspective.', 180),
  ('city-view', 'City View', 'Urban skyline or city-facing vantage.', 190),
  ('mountain-view', 'Mountain View', 'Mountain-facing or elevated scenic view.', 200),
  ('skyline', 'Skyline', 'Skyline-heavy composition.', 210),
  ('aerial', 'Aerial', 'Aerial or elevated viewpoint.', 220),
  ('drone', 'Drone', 'Captured from drone perspective.', 230),
  ('wide-shot', 'Wide Shot', 'Wide establishing coverage.', 240),
  ('close-up', 'Close-up', 'Tight detail or close-range framing.', 250),
  ('detail', 'Detail', 'Material, fixture, or design detail focus.', 260),
  ('people', 'People', 'People visibly present in frame.', 270),
  ('empty', 'Empty', 'No people in the frame.', 280),
  ('busy', 'Busy', 'Crowded or high-activity scene.', 290),
  ('food', 'Food', 'Food plating, meals, or food display focus.', 300),
  ('beverage', 'Beverage', 'Drinks, cocktails, coffee, or beverage service.', 310),
  ('dessert', 'Dessert', 'Desserts, pastries, or sweet items.', 320),
  ('daytime', 'Daytime', 'Captured in daylight conditions.', 330),
  ('night', 'Night', 'Captured at night.', 340),
  ('sunrise', 'Sunrise', 'Sunrise lighting conditions.', 350),
  ('sunset', 'Sunset', 'Sunset lighting conditions.', 360),
  ('golden-hour', 'Golden Hour', 'Warm low-angle light.', 370),
  ('blue-hour', 'Blue Hour', 'Twilight or blue-hour atmosphere.', 380),
  ('luxury', 'Luxury', 'Premium, upscale, or high-end feel.', 390),
  ('modern', 'Modern', 'Contemporary modern design language.', 400),
  ('rustic', 'Rustic', 'Rustic, earthy, or raw design cues.', 410),
  ('minimal', 'Minimal', 'Minimalist composition or styling.', 420),
  ('family-friendly', 'Family Friendly', 'Family-oriented or household-safe use case.', 430),
  ('pet-friendly', 'Pet Friendly', 'Pet-friendly venue or accommodation.', 440),
  ('travel', 'Travel', 'Travel-oriented destination or tourism content.', 450),
  ('nature', 'Nature', 'Natural scenery emphasis.', 460),
  ('event', 'Event', 'Event-ready or active event coverage.', 470),
  ('festive', 'Festive', 'Celebratory, seasonal, or decorative mood.', 480),
  ('branding', 'Branding', 'Brand-centric composition or signage.', 490),
  ('real-estate', 'Real Estate', 'Property-marketing ready visual.', 500)
on conflict (slug) do update
set
  label = excluded.label,
  description = excluded.description,
  sort_order = excluded.sort_order,
  is_active = true;