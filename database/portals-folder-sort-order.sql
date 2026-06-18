-- Custom sort order for portal folder sidebars (admin drag-and-drop).
alter table public.albums_folders
  add column if not exists sort_order integer not null default 0;

with ranked as (
  select
    id,
    row_number() over (
      partition by coalesce(parent_folder_id::text, 'root'), uploader_code
      order by created_at asc
    ) - 1 as new_sort_order
  from public.albums_folders
  where uploader_code in ('PHOTOGRAPHER-PORTAL', 'PUBLIC-SUBMISSIONS')
)
update public.albums_folders as folders
set sort_order = ranked.new_sort_order
from ranked
where folders.id = ranked.id;

create index if not exists albums_folders_sort_order_idx
  on public.albums_folders (uploader_code, parent_folder_id, sort_order);
