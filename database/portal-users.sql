-- Public upload account for /public portal submissions (no login required).
-- Run in Supabase SQL Editor after albums-admin.sql.

insert into public.album_users (
  first_name,
  last_name,
  full_name,
  status,
  area_focused,
  email,
  phone_number,
  code,
  role
)
values (
  'Public',
  'Submissions',
  'Public Submissions',
  'active',
  'Public uploads',
  'public@drive.ph',
  '+639170000001',
  'PUBLIC-SUBMISSIONS',
  'customer'
)
on conflict (email) do update
set
  first_name   = excluded.first_name,
  last_name    = excluded.last_name,
  full_name    = excluded.full_name,
  status       = excluded.status,
  area_focused = excluded.area_focused,
  phone_number = excluded.phone_number,
  code         = excluded.code,
  role         = excluded.role,
  updated_at   = now();

-- Open photographer workspace for /photographers (no login required).
insert into public.album_users (
  first_name,
  last_name,
  full_name,
  status,
  area_focused,
  email,
  phone_number,
  code,
  role
)
values (
  'Photographer',
  'Portal',
  'Photographer Portal',
  'active',
  'Open uploads',
  'photographers@drive.ph',
  '+639170000003',
  'PHOTOGRAPHER-PORTAL',
  'media'
)
on conflict (email) do update
set
  first_name   = excluded.first_name,
  last_name    = excluded.last_name,
  full_name    = excluded.full_name,
  status       = excluded.status,
  area_focused = excluded.area_focused,
  phone_number = excluded.phone_number,
  code         = excluded.code,
  role         = excluded.role,
  updated_at   = now();

-- Supabase Auth user (Dashboard → Authentication → Users → Add user):
--   Email:    public@drive.ph
--   Password: (not used for public portal — uploads are anonymous)
--   Email:    photographers@drive.ph
--   Password: (not used for photographer portal — open access)

-- Admin account for /admin portal (created automatically on first login if missing).
insert into public.album_users (
  first_name,
  last_name,
  full_name,
  status,
  area_focused,
  email,
  phone_number,
  code,
  role
)
values (
  'Drive',
  'Administrator',
  'Drive Administrator',
  'active',
  'All',
  'admin@drive.ph',
  '+639170000002',
  'ALB-ADMIN-DRIVE-0001',
  'admin'
)
on conflict (email) do update
set
  first_name   = excluded.first_name,
  last_name    = excluded.last_name,
  full_name    = excluded.full_name,
  status       = excluded.status,
  area_focused = excluded.area_focused,
  phone_number = excluded.phone_number,
  code         = excluded.code,
  role         = excluded.role,
  updated_at   = now();

-- Portal admin login uses static credentials in lib/portals/constants.ts
-- (no Supabase Auth user required for /admin).
