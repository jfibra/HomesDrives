-- Event-scoped photographer identities (who captured each upload)
-- Run in Supabase after portal-events.sql

create table if not exists public.portal_event_photographers (
  id uuid primary key default gen_random_uuid(),
  portal_event_id uuid not null references public.portal_events (id) on delete cascade,
  full_name text not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists portal_event_photographers_event_id_idx
  on public.portal_event_photographers (portal_event_id);

create index if not exists portal_event_photographers_event_name_idx
  on public.portal_event_photographers (portal_event_id, lower(full_name));

alter table public.albums_folders
  add column if not exists portal_photographer_id uuid
  references public.portal_event_photographers (id) on delete set null;

create index if not exists albums_folders_portal_photographer_id_idx
  on public.albums_folders (portal_photographer_id);

alter table public.albums_photos
  add column if not exists portal_photographer_id uuid
  references public.portal_event_photographers (id) on delete set null;

create index if not exists albums_photos_portal_photographer_id_idx
  on public.albums_photos (portal_photographer_id);
