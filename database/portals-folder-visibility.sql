-- Admin-controlled visibility for photographer portal folders on the public download page.
alter table public.albums_folders
  add column if not exists is_public_visible boolean not null default true;

create index if not exists albums_folders_public_visible_idx
  on public.albums_folders (uploader_code, is_public_visible);
