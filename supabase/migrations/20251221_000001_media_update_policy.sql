-- Allow post authors to update their media rows (e.g. display_order reordering)
-- Fixes: saving media reorder in /admin/edit/[id]

-- Ensure RLS is enabled (safe to run even if already enabled)
alter table public.media enable row level security;

drop policy if exists "Authors can update their post media" on public.media;
create policy "Authors can update their post media"
on public.media
for update
to authenticated
using (
  exists (
    select 1
    from public.posts p
    where p.id = media.post_id
      and p.author_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.posts p
    where p.id = media.post_id
      and p.author_id = auth.uid()
  )
);

