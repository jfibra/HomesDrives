-- Folder locations for uploader-specific grouped uploads
create table if not exists public.albums_folders (
  id uuid primary key default gen_random_uuid(),
  album_user_id bigint,
  uploader_code text,
  uploader_name text not null,
  folder_name text not null,
  full_address text,
  street text,
  city text,
  province text,
  zip_code text,
  country text,
  latitude double precision,
  longitude double precision,
  type_of_place text[] not null default '{}',
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists albums_folders_uploader_name_idx
  on public.albums_folders (uploader_name);

create index if not exists albums_folders_album_user_id_idx
  on public.albums_folders (album_user_id);

create index if not exists albums_folders_uploader_code_idx
  on public.albums_folders (uploader_code);

create index if not exists albums_folders_created_at_idx
  on public.albums_folders (created_at desc);

create index if not exists albums_folders_folder_name_idx
  on public.albums_folders (folder_name);

do $$
begin
  alter table public.albums_folders
    add column if not exists album_user_id bigint,
    add column if not exists uploader_code text;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'albums_folders_album_user_id_fkey'
      and conrelid = 'public.albums_folders'::regclass
  ) then
    alter table public.albums_folders
      add constraint albums_folders_album_user_id_fkey
        foreign key (album_user_id)
        references public.album_users (id)
        on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'albums_folders_uploader_code_fkey'
      and conrelid = 'public.albums_folders'::regclass
  ) then
    alter table public.albums_folders
      add constraint albums_folders_uploader_code_fkey
        foreign key (uploader_code)
        references public.album_users (code)
        on delete set null;
  end if;

  alter table public.albums_photos
    add column if not exists album_user_id bigint,
    add column if not exists uploader_code text;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'albums_photos_album_user_id_fkey'
      and conrelid = 'public.albums_photos'::regclass
  ) then
    alter table public.albums_photos
      add constraint albums_photos_album_user_id_fkey
        foreign key (album_user_id)
        references public.album_users (id)
        on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'albums_photos_uploader_code_fkey'
      and conrelid = 'public.albums_photos'::regclass
  ) then
    alter table public.albums_photos
      add constraint albums_photos_uploader_code_fkey
        foreign key (uploader_code)
        references public.album_users (code)
        on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'albums_photos_folder_id_fkey'
      and conrelid = 'public.albums_photos'::regclass
  ) then
    alter table public.albums_photos
      add column if not exists folder_id uuid,
      add constraint albums_photos_folder_id_fkey
        foreign key (folder_id)
        references public.albums_folders (id)
        on delete set null;
  end if;
end
$$;

create index if not exists albums_photos_folder_id_idx
  on public.albums_photos (folder_id);

create index if not exists albums_photos_album_user_id_idx
  on public.albums_photos (album_user_id);

create index if not exists albums_photos_uploader_code_idx
  on public.albums_photos (uploader_code);

create or replace function public.set_albums_folders_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists albums_folders_updated_at on public.albums_folders;
create trigger albums_folders_updated_at
before update on public.albums_folders
for each row
execute function public.set_albums_folders_updated_at();
