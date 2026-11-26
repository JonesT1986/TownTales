-- Nov 26 2026: clipping review/timeline links, place markers, submitter contacts, "New" tag setting.
-- All additive. Nothing existing is changed or removed.

-- 1. Place rank: capital / city / town (default town). The renderer picks the marker from this field.
alter table public.towns add column if not exists place_kind text not null default 'town';
do $$ begin
  alter table public.towns add constraint towns_place_kind_chk check (place_kind in ('capital','city','town'));
exception when duplicate_object then null; end $$;
update public.towns set place_kind = 'capital' where slug in (
  'regina-sk','winnipeg-mb','st-johns-nl','yellowknife-nt','victoria-bc','edmonton-ab','toronto-on',
  'quebec-qc','fredericton-nb','halifax-ns','charlottetown-pe','whitehorse-yt','iqaluit-nu');

-- 2. A clipping can be linked to the archive item that puts it on the timeline.
--    Set by "Approve + add to timeline"; one link per clipping (no duplicates).
alter table public.clippings add column if not exists item_id uuid references public.items(id) on delete set null;
alter table public.clippings add column if not exists reviewed_at timestamptz;
-- The Radville rink clipping is already on the timeline through the Muse item for the same article.
update public.clippings set item_id = 'e9eb5c22-9ad8-4152-908f-7a3791ff407c'
  where id = 'cda732b0-6f79-4411-85d8-edc6bf568410' and item_id is null;

-- 3. Reviewer-written timeline entries: an item with pin_timeline always gets its own timeline entry,
--    even if the AI rebuild leaves it out.
alter table public.items add column if not exists pin_timeline boolean not null default false;

-- 4. Problem reports: which town the report is about.
alter table public.reports add column if not exists town text;

-- 5. "New" tag: how many days an item counts as new, and the date it started (so the Nov 2026
--    bulk re-import doesn't make the whole site "new" at once). Editable in #admin.
insert into public.admin_settings (k, v, updated_at) values
  ('new_tag_days', '30'::jsonb, now()),
  ('new_tag_since', '"2026-11-26"'::jsonb, now())
on conflict (k) do nothing;

-- Public read of only the display settings (admin_settings itself stays private).
create or replace function public.public_settings() returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_object_agg(k, v), '{}'::json) from admin_settings where k in ('new_tag_days','new_tag_since');
$$;
grant execute on function public.public_settings() to anon, authenticated;

-- 6. Clipping headline (card title; "Transcribe image" suggests it when the field is empty).
alter table public.clippings add column if not exists headline text;
update public.clippings set headline = 'Bennett Construction Company Gets Contract for Skating and Curling Rink'
 where id = 'cda732b0-6f79-4411-85d8-edc6bf568410' and headline is null;
