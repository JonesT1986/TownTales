-- Nov 27 2026 — timelines stay in step with the archive (additive; safe to run more than once).
--
-- 1. Any dated archive item that is published, re-dated, unpublished or deleted marks its town "due".
--    Debounced: the town's due time is bumped at most every 20 s, and the existing 5-minute sweep only starts a
--    rebuild once the town has been quiet for 3 minutes, so a bulk import produces ONE rebuild, not one per item.
-- 2. A nightly sweep marks every town the admin would flag as "Needs rebuild" as due (up to 40 a night).
-- 3. The towns table remembers why the last build failed and which dated items the AI deliberately left out,
--    so the admin can show the real error and the "missing" count can reach 0.
-- 4. The stats cache can no longer be overwritten by an older snapshot (the 5-minute refresh could finish after a
--    build's own refresh and put back stale numbers, e.g. "0 rows" for a town that had just been rebuilt).
--
-- Run this BEFORE deploying the new edge function (the function writes the new columns).

-- 3. columns -----------------------------------------------------------------------------------------------
alter table public.towns add column if not exists timeline_error    text;
alter table public.towns add column if not exists timeline_error_at timestamptz;
alter table public.towns add column if not exists timeline_tries    int  not null default 0;   -- consecutive failed builds
alter table public.towns add column if not exists timeline_skipped  uuid[] not null default '{}'; -- dated items the last build left out on purpose

-- One definition of "needs rebuild", used by the admin list and the nightly sweep.
create or replace function public.timeline_grade(
  p_status text, p_built timestamptz, p_items int, p_uncovered int, p_stale int, p_newer boolean
) returns text language sql immutable as $$
  select case
    when p_status in ('queued', 'building') then 'rebuilding'
    when p_items > 0 and (p_built is null or p_status in ('error', 'empty') or p_newer or p_uncovered > 0 or p_stale > 0) then 'needs'
    else 'ok'
  end
$$;

-- 4. stats cache: skipped items don't count as missing, and an older snapshot never overwrites a newer one -----
create or replace function public.refresh_town_rebuild_stats(p_slug text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into town_rebuild_stats (slug, items, rows, uncovered, stale, newest, computed_at)
  with
  tw as (select slug, timeline_skipped from towns where p_slug is null or slug = p_slug),
  pub as (
    select i.id, i.town, i.year, i.created_at from items i
    where i.status = 'published' and (p_slug is null or i.town = p_slug)
  ),
  refs as (
    select distinct r.town, x as id from timeline r, unnest(r.item_ids) as x
    where p_slug is null or r.town = p_slug
  ),
  istat as (select town, count(*)::int n, max(created_at) newest from pub group by town),
  tstat as (select town, count(*)::int n from timeline where p_slug is null or town = p_slug group by town),
  unc as (
    select p.town, count(*)::int n from pub p
    join tw on tw.slug = p.town
    left join refs f on f.town = p.town and f.id = p.id
    where p.year is not null and f.id is null and not (p.id = any (tw.timeline_skipped))
    group by p.town
  ),
  stl as (
    select f.town, count(*)::int n from refs f
    left join pub p on p.id = f.id and p.town = f.town
    where p.id is null group by f.town
  )
  select tw.slug, coalesce(s.n, 0), coalesce(t.n, 0), coalesce(u.n, 0), coalesce(x.n, 0), s.newest, now()
  from tw
  left join istat s on s.town = tw.slug
  left join tstat t on t.town = tw.slug
  left join unc u on u.town = tw.slug
  left join stl x on x.town = tw.slug
  on conflict (slug) do update set
    items = excluded.items, rows = excluded.rows, uncovered = excluded.uncovered,
    stale = excluded.stale, newest = excluded.newest, computed_at = excluded.computed_at
  where town_rebuild_stats.computed_at <= excluded.computed_at;   -- never replace newer numbers with an older snapshot

  if p_slug is null then
    delete from town_rebuild_stats s where not exists (select 1 from towns t where t.slug = s.slug);
  end if;
end;
$$;
revoke all on function public.refresh_town_rebuild_stats(text) from public, anon, authenticated;
grant execute on function public.refresh_town_rebuild_stats(text) to service_role;

-- 1. items → "this town is due for a rebuild" ---------------------------------------------------------------
create or replace function public.items_mark_rebuild() returns trigger
language plpgsql security definer set search_path = '' as $$
declare t text;
begin
  if tg_op = 'DELETE' then t := old.town; else t := new.town; end if;
  -- bump at most every 20 s: cheap during a bulk import, and the due time still trails the last item by < 20 s
  update public.towns set rebuild_due_at = clock_timestamp()
   where slug = t and (rebuild_due_at is null or rebuild_due_at < clock_timestamp() - interval '20 seconds');
  return null;
end $$;

drop trigger if exists items_mark_rebuild on public.items;
create trigger items_mark_rebuild after insert on public.items for each row
  when (new.status = 'published' and (new.year is not null or new.external_id like 'link:%'))
  execute function public.items_mark_rebuild();

drop trigger if exists items_mark_rebuild_upd on public.items;
create trigger items_mark_rebuild_upd after update of status, year, date_label on public.items for each row
  when (
    -- became published with a date, or its date changed
    (new.status = 'published' and new.year is not null
       and (old.status is distinct from 'published' or old.year is distinct from new.year or old.date_label is distinct from new.date_label))
    -- or a dated item left the timeline (unpublished, or lost its date)
    or (old.status = 'published' and old.year is not null
       and (new.status is distinct from 'published' or new.year is distinct from old.year))
  )
  execute function public.items_mark_rebuild();

drop trigger if exists items_mark_rebuild_del on public.items;
create trigger items_mark_rebuild_del after delete on public.items for each row
  when (old.status = 'published' and old.year is not null)
  execute function public.items_mark_rebuild();

-- 2. nightly sweep -----------------------------------------------------------------------------------------
-- Marks flagged towns as due; the existing 5-minute sweep (towns_research_sweep) then starts 5 rebuilds per run.
-- Towns whose last 3 builds failed are left alone (the admin row shows the error) until something changes.
create or replace function public.timeline_nightly_sweep(p_limit int default 40) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform refresh_town_rebuild_stats();
  with graded as (
    select t.slug, t.timeline_status, coalesce(s.uncovered, 0) as unc,
      timeline_grade(t.timeline_status, t.timeline_built_at, coalesce(s.items, 0), coalesce(s.uncovered, 0), coalesce(s.stale, 0),
        (s.newest is not null and (t.timeline_built_at is null or s.newest > t.timeline_built_at))) as g
    from towns t
    left join town_rebuild_stats s on s.slug = t.slug
    where t.rebuild_due_at is null and t.timeline_tries < 3
  ), pick as (
    select slug from graded where g = 'needs'
    order by (timeline_status = 'error'), unc desc, slug
    limit greatest(coalesce(p_limit, 40), 0)
  )
  update towns set rebuild_due_at = now() - interval '10 minutes' where slug in (select slug from pick);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.timeline_nightly_sweep(int) from public, anon, authenticated;
grant execute on function public.timeline_nightly_sweep(int) to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'timeline-nightly-sweep';
    perform cron.schedule('timeline-nightly-sweep', '30 9 * * *', 'select public.timeline_nightly_sweep(40)');   -- 03:30 Saskatchewan time
  end if;
end $$;

-- Admin list: same as before, plus the last build's error, failed-build count and "left out" count; grading via timeline_grade().
create or replace function public.admin_towns(
  p_q text default '',
  p_letter text default '',
  p_needs boolean default false,
  p_limit int default 100,
  p_offset int default 0
) returns jsonb
language plpgsql stable
set search_path = public
as $$
declare
  q text := tt_fold(trim(coalesce(p_q, '')));
  l text := upper(left(trim(coalesce(p_letter, '')), 1));
  lim int := least(greatest(coalesce(p_limit, 100), 1), 500);
  off int := greatest(coalesce(p_offset, 0), 0);
  result jsonb;
begin
  with
  base as (
    select
      t.slug, t.name, t.prov, t.hidden, t.timeline_status, t.timeline_built_at,
      t.timeline_error, t.timeline_error_at, t.timeline_tries,
      coalesce(cardinality(t.timeline_skipped), 0) as skipped,
      coalesce(s.items, 0) as items, coalesce(s.rows, 0) as rows,
      coalesce(s.uncovered, 0) as uncovered, coalesce(s.stale, 0) as stale,
      (s.newest is not null and (t.timeline_built_at is null or s.newest > t.timeline_built_at)) as newer,
      tt_fold(t.name) as fname,
      s.computed_at
    from towns t
    left join town_rebuild_stats s on s.slug = t.slug
  ),
  graded as (
    select b.*,
      case when left(b.fname, 1) between 'a' and 'z' then upper(left(b.fname, 1)) else '#' end as letter,
      timeline_grade(b.timeline_status, b.timeline_built_at, b.items, b.uncovered, b.stale, b.newer) as status
    from base b
  ),
  searched as (
    select * from graded g
    where q = '' or g.fname like '%' || q || '%' or g.slug like '%' || q || '%'
  ),
  needs_scope as (select * from searched where l = '' or letter = l),
  letter_scope as (select * from searched where not p_needs or status = 'needs'),
  filtered as (select * from needs_scope where not p_needs or status = 'needs')
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'needs', (select count(*) from needs_scope where status = 'needs'),
    'needs_all', (select count(*) from graded where status = 'needs'),
    'letters', coalesce((select jsonb_object_agg(letter, n) from (
        select letter, count(*) as n from letter_scope group by letter) x), '{}'::jsonb),
    'stats_at', (select max(computed_at) from town_rebuild_stats),
    'limit', lim,
    'offset', off,
    'rows', coalesce((select jsonb_agg(to_jsonb(r) - 'fname' order by r.fname, r.slug) from (
        select slug, name, prov, hidden, items, rows, uncovered, stale, newer, skipped,
               timeline_status, timeline_built_at, timeline_error, timeline_error_at, timeline_tries, status, fname
        from filtered
        order by fname, slug
        limit lim offset off) r), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;
revoke all on function public.admin_towns(text, text, boolean, int, int) from public, anon, authenticated;
grant execute on function public.admin_towns(text, text, boolean, int, int) to service_role;

select public.refresh_town_rebuild_stats();
