-- Article writer picks: up to 3 starred photos per folder
do $$
begin
  alter table public.albums_photos
    add column if not exists article_star_rank smallint;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'albums_photos_article_star_rank_check'
      and conrelid = 'public.albums_photos'::regclass
  ) then
    alter table public.albums_photos
      add constraint albums_photos_article_star_rank_check
        check (article_star_rank is null or article_star_rank between 1 and 3);
  end if;
end
$$;

create index if not exists albums_photos_folder_article_star_idx
  on public.albums_photos (folder_id, article_star_rank)
  where article_star_rank is not null;
