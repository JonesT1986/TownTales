-- Admin towns list (Nov 22 2026): search, A–Z, Needs-rebuild filter, counts, paging.
-- Applied as migrations admin_towns_2026_11_22 + admin_towns_cache_2026_11_22. Final state below.

create or replace function public.tt_fold(t text) returns text
language sql immutable parallel safe as $$
  select translate(lower(coalesce(t, '')),
    'àâäáãåéèêëíîïìóôöòõúûüùçñÿ',
    'aaaaaaeeeeiiiiooooouuuucny')
$$;

-- Per-town rebuild stats, cached so the admin towns list is instant.
-- Full refresh every 5 minutes (pg_cron); one town is refreshed immediately whenever its
-- timeline finishes building (trigger on towns), so a rebuilt town drops out of
-- "Needs rebuild" without waiting for the next cron run.

create table if not exists public.town_rebuild_stats (
  slug text primary key,
  items int not null default 0,        -- published items
  rows int not null default 0,         -- timeline rows
  uncovered int not null default 0,    -- published items with a year that no timeline row references
  stale int not null default 0,        -- timeline references to items no longer published
  newest timestamptz,                  -- newest published item
  computed_at timestamptz not null default now()
);
alter table public.town_rebuild_stats enable row level security;   -- no policies: service role only
revoke all on public.town_rebuild_stats from anon, authenticated;

create or replace function public.refresh_town_rebuild_stats(p_slug text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into town_rebuild_stats (slug, items, rows, uncovered, stale, newest, computed_at)
  with
  tw as (select slug from towns where p_slug is null or slug = p_slug),
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
    left join refs f on f.town = p.town and f.id = p.id
    where p.year is not null and f.id is null group by p.town
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
    stale = excluded.stale, newest = excluded.newest, computed_at = excluded.computed_at;

  if p_slug is null then
    delete from town_rebuild_stats s where not exists (select 1 from towns t where t.slug = s.slug);
  end if;
end;
$$;
revoke all on function public.refresh_town_rebuild_stats(text) from public, anon, authenticated;
grant execute on function public.refresh_town_rebuild_stats(text) to service_role;

-- Refresh one town as soon as its timeline build finishes (ready / empty / error).
create or replace function public.trg_town_rebuild_stats() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.timeline_status is distinct from old.timeline_status
     and new.timeline_status in ('ready', 'empty', 'error') then
    begin
      perform refresh_town_rebuild_stats(new.slug);
    exception when others then
      -- never let the stats cache break a timeline build
      raise warning 'town_rebuild_stats refresh failed for %: %', new.slug, sqlerrm;
    end;
  end if;
  return new;
end;
$$;
drop trigger if exists town_rebuild_stats_after_build on public.towns;
create trigger town_rebuild_stats_after_build
  after update of timeline_status on public.towns
  for each row execute function public.trg_town_rebuild_stats();

-- Every 5 minutes, refresh all towns.
select cron.unschedule(jobid) from cron.job where jobname = 'refresh-town-rebuild-stats';
select cron.schedule('refresh-town-rebuild-stats', '*/5 * * * *', $$select public.refresh_town_rebuild_stats()$$);

-- Admin list now reads the cache. Status uses live towns.timeline_status / timeline_built_at,
-- so "Rebuilding" and "items added after the last build" are always current.
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
      case
        when b.timeline_status in ('queued', 'building') then 'rebuilding'
        when b.items > 0 and (
             b.timeline_built_at is null
          or b.timeline_status in ('error', 'empty')
          or b.newer or b.uncovered > 0 or b.stale > 0
        ) then 'needs'
        else 'ok'
      end as status
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
        select slug, name, prov, hidden, items, rows, uncovered, stale, newer,
               timeline_status, timeline_built_at, status, fname
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
