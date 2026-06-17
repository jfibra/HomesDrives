-- Temporary portals: nested folders (parent folder → sub-folder).
-- Safe to run multiple times.

alter table public.albums_folders
  add column if not exists parent_folder_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'albums_folders_parent_folder_id_fkey'
      and conrelid = 'public.albums_folders'::regclass
  ) then
    alter table public.albums_folders
      add constraint albums_folders_parent_folder_id_fkey
        foreign key (parent_folder_id)
        references public.albums_folders (id)
        on delete cascade;
  end if;
end
$$;

create index if not exists albums_folders_parent_folder_id_idx
  on public.albums_folders (parent_folder_id);
