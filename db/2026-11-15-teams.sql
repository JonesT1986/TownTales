-- TownTales Build 5: Sports & Teams. Safe to re-run.
-- Changes from the brief: town must be a real town slug; tier/status limited to known values; policy re-runnable.
-- championships: a JSON list. Each entry is either text ("1952 provincial senior champions")
-- or an object {"year":"1952","title":"Provincial senior champions"}; shown as written.
create table if not exists public.teams (
  id text primary key, town text not null references public.towns(slug), name text not null,
  sport text not null, league text,
  years_label text, home_venue text,
  championships jsonb not null default '[]',
  note text, tier text not null default 'documented' check (tier in ('documented','community')),
  source text not null, source_url text,
  status text not null default 'published' check (status in ('pending','published','declined')),
  created_at timestamptz not null default now()
);
create index if not exists teams_town_idx on public.teams (town);
create index if not exists teams_sport_idx on public.teams (sport);
alter table public.teams enable row level security;
drop policy if exists "public read published" on public.teams;
create policy "public read published" on public.teams for select using (status = 'published');
