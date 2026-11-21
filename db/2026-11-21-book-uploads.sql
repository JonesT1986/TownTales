-- Nov 21, 2026 — Whole-book uploads (/share-a-book)
-- People photograph every page of a town history book with their phone and upload them all at once.
-- Pages are PRIVATE (books are usually still under copyright): no public read; admin sees them through signed links.
-- Flow: start_book_upload() → pages go to book-pages/<upload id>/0001.jpg … → finish_book_upload() → #admin "Book uploads".
-- Additive only.
begin;

create table if not exists public.book_uploads (
  id uuid primary key default gen_random_uuid(),
  town text not null references public.towns(slug),
  title text not null,
  published_year text,
  permission text not null default 'unsure' check (permission in ('owner','committee','unsure')),
  notes text,
  uploader_name text not null,
  uploader_email text not null,
  page_count integer not null default 0,
  status text not null default 'uploading'
    check (status in ('uploading','received','processing','done','declined')),
  admin_note text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists book_uploads_status_idx on public.book_uploads (status, created_at desc);
alter table public.book_uploads enable row level security;   -- no policies: private
revoke all on public.book_uploads from anon, authenticated;

-- True while an upload is open (started in the last 24 h, not finished). Used by the storage policy.
create or replace function public.book_upload_open(p_id text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from book_uploads
    where id::text = p_id and status = 'uploading' and created_at > now() - interval '24 hours');
$$;

create or replace function public.start_book_upload(
  p_town text, p_title text, p_year text, p_permission text, p_notes text, p_name text, p_email text
) returns json language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not exists (select 1 from towns where slug = p_town and coalesce(hidden,false) = false) then
    return json_build_object('ok', false, 'error', 'Please choose your town.');
  end if;
  if coalesce(trim(p_title),'') = '' then
    return json_build_object('ok', false, 'error', 'Please enter the book''s title.');
  end if;
  if coalesce(trim(p_name),'') = '' or coalesce(trim(p_email),'') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return json_build_object('ok', false, 'error', 'Please enter your name and a working email address.');
  end if;
  -- Light flood guard: max 5 open uploads per email per day.
  if (select count(*) from book_uploads where uploader_email = lower(trim(p_email)) and created_at > now() - interval '24 hours') >= 5 then
    return json_build_object('ok', false, 'error', 'That''s a lot of books for one day! Please email towntalesinfo@gmail.com and we''ll help.');
  end if;
  insert into book_uploads (town, title, published_year, permission, notes, uploader_name, uploader_email)
  values (p_town, left(trim(p_title), 200), nullif(left(trim(p_year), 40), ''),
          case when p_permission in ('owner','committee') then p_permission else 'unsure' end,
          nullif(left(trim(p_notes), 2000), ''), left(trim(p_name), 120), lower(left(trim(p_email), 200)))
  returning id into v_id;
  return json_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.finish_book_upload(p_id text, p_pages integer)
returns json language plpgsql security definer set search_path = public as $$
begin
  update book_uploads set status = 'received', page_count = greatest(0, least(coalesce(p_pages,0), 2000)), finished_at = now()
  where id::text = p_id and status = 'uploading';
  if not found then return json_build_object('ok', false, 'error', 'That upload has already finished or expired.'); end if;
  return json_build_object('ok', true);
end $$;

revoke all on function public.book_upload_open(text) from public;
revoke all on function public.start_book_upload(text,text,text,text,text,text,text) from public;
revoke all on function public.finish_book_upload(text,integer) from public;
grant execute on function public.book_upload_open(text) to anon, authenticated;
grant execute on function public.start_book_upload(text,text,text,text,text,text,text) to anon, authenticated;
grant execute on function public.finish_book_upload(text,integer) to anon, authenticated;

-- Private bucket. Public can only ADD files, and only into a folder whose upload is still open.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('book-pages', 'book-pages', false, 26214400,
        array['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf'])
on conflict (id) do update set
  public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "book pages upload" on storage.objects;
create policy "book pages upload" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'book-pages' and public.book_upload_open((storage.foldername(name))[1]));

commit;
