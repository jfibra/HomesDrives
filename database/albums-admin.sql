-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: add admin role + seed admin account into album_users
--
-- Run this against your Supabase / Postgres database.
-- Safe to run multiple times (idempotent).
--
-- After running this:
--   • The album_users table will have a `role` column with allowed values
--     ('admin' | 'media' | 'customer').
--   • Any pre-existing 'user' rows are migrated to 'media'.
--   • A system admin account is inserted with a unique login code.
--   • The admin can log in via the same /[code] dashboard route used by users.
--
-- IMPORTANT (Supabase Auth):
--   Passwords are stored in Supabase Auth (auth.users), NOT in album_users.
--   After running this SQL, also create the matching auth user:
--     1. Supabase Dashboard → Authentication → Users → "Add user"
--        Email:    admin@homesalbums.local
--        Password: admin@homes1234!
--        Confirm:  yes (auto-confirm email)
--     2. Then log in at:  /ALB-ADMIN-MASTER-0001
--
--   To rotate the password later (or set it from SQL directly), run the
--   "RESET ADMIN PASSWORD" snippet at the bottom of this file.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add `role` column ────────────────────────────────────────────────────────
-- New rows default to 'media' (the most common operator role). Admins are
-- created explicitly below.
do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'album_users'
      and column_name  = 'role'
  ) then
    alter table public.album_users
      add column role text not null default 'media';
  end if;

  -- Make sure the column default reflects the current policy even on re-runs.
  alter table public.album_users
    alter column role set default 'media';
end
$$;

-- 2. Drop the old role check constraint FIRST so we can migrate data freely.
--    The previous version of this file allowed only ('admin', 'user'), which
--    would otherwise block the UPDATE in step 3.
do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'album_users_role_check'
      and conrelid = 'public.album_users'::regclass
  ) then
    alter table public.album_users
      drop constraint album_users_role_check;
  end if;
end
$$;

-- 3. Migrate any pre-existing 'user' rows to 'media'. Adjust manually in the
--    admin UI if a different role fits better for any individual account.
update public.album_users
set role = 'media'
where role = 'user';

-- 4. Re-add the role check constraint with the new allowed values.
alter table public.album_users
  add constraint album_users_role_check
  check (role in ('admin', 'media', 'customer'));

-- 5. Index on role for fast role-based filtering ─────────────────────────────
create index if not exists album_users_role_idx
  on public.album_users (role);

-- 6. Insert (or update) the admin account ────────────────────────────────────
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
  'System',
  'Administrator',
  'System Administrator',
  'active',
  'All',
  'admin@homesalbums.local',
  '+639170000000',
  'ALB-ADMIN-MASTER-0001',
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

-- ─────────────────────────────────────────────────────────────────────────────
-- Verification queries (optional — run to confirm)
-- ─────────────────────────────────────────────────────────────────────────────
-- select id, full_name, email, code, role, status
-- from public.album_users
-- where role = 'admin';
--
-- Expected result:
--   System Administrator | admin@homesalbums.local | ALB-ADMIN-MASTER-0001 | admin | active
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- RESET ADMIN PASSWORD
-- ─────────────────────────────────────────────────────────────────────────────
-- Sets the admin Supabase Auth password to: admin@homes1234!
-- Requires the pgcrypto extension (Supabase has it enabled by default).
-- Run after the auth user has been created in the Supabase Dashboard.
--
-- Run this whole block in Supabase SQL Editor:
--
-- create extension if not exists pgcrypto;
--
-- update auth.users
-- set
--   encrypted_password = crypt('admin@homes1234!', gen_salt('bf')),
--   email_confirmed_at = coalesce(email_confirmed_at, now()),
--   updated_at         = now()
-- where email = 'admin@homesalbums.local';
--
-- -- Confirm the change
-- select id, email, email_confirmed_at, updated_at
-- from auth.users
-- where email = 'admin@homesalbums.local';
-- ─────────────────────────────────────────────────────────────────────────────

