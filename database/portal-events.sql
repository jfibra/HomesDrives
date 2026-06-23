-- Multi-event support for temporary drive portals (admin / photographers / public).
-- Run in Supabase SQL Editor after existing portal migrations.

create table if not exists portal_events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  status text not null default 'active' check (status in ('active', 'archived')),
  cover_image_url text,
  qr_logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table albums_folders
  add column if not exists portal_event_id uuid references portal_events (id) on delete set null;

create index if not exists albums_folders_portal_event_id_idx
  on albums_folders (portal_event_id);

insert into portal_events (name, slug)
values ('Homes.ph Event', 'homes-ph-event')
on conflict (slug) do nothing;

update albums_folders
set portal_event_id = (select id from portal_events where slug = 'homes-ph-event' limit 1)
where uploader_code in ('PHOTOGRAPHER-PORTAL', 'PUBLIC-SUBMISSIONS')
  and portal_event_id is null;

alter table portal_events
  add column if not exists cover_image_url text;

alter table portal_events
  add column if not exists qr_logo_url text;
