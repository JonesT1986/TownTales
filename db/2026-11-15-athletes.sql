-- TownTales: Hometown athletes (people from a town who reached the NHL, AAA, pro, national teams…). Safe to re-run.
-- achievements: JSON list of text, shown as written. Same tiers/status/source rules as teams.
create table if not exists public.athletes (
  id text primary key, town text not null references public.towns(slug), name text not null,
  sport text not null, level text, connection text,
  teams_label text, years_label text,
  achievements jsonb not null default '[]',
  note text, tier text not null default 'documented' check (tier in ('documented','community')),
  source text not null, source_url text,
  status text not null default 'published' check (status in ('pending','published','declined')),
  created_at timestamptz not null default now()
);
create index if not exists athletes_town_idx on public.athletes (town);
alter table public.athletes enable row level security;
drop policy if exists "public read published" on public.athletes;
create policy "public read published" on public.athletes for select using (status = 'published');
