create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.app_state (
  id text primary key,
  roster jsonb not null default '[]'::jsonb,
  lineup jsonb not null default '[]'::jsonb,
  roster_version text,
  active_game_id text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.app_state
alter column roster_version type text using roster_version::text;

create table if not exists public.roster_players (
  id text primary key,
  team_id text not null default 'lions',
  roster_version text not null default '',
  name text not null,
  jersey_number text not null default '',
  positions jsonb not null default '[]'::jsonb,
  primary_position text not null default 'UTL',
  bats text not null default 'R',
  throws text not null default 'R',
  height text not null default '',
  weight text not null default '',
  active boolean not null default true,
  grades jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.roster_players
add column if not exists team_id text not null default 'lions',
add column if not exists roster_version text not null default '',
add column if not exists name text not null default 'Unknown Player',
add column if not exists jersey_number text not null default '',
add column if not exists positions jsonb not null default '[]'::jsonb,
add column if not exists primary_position text not null default 'UTL',
add column if not exists bats text not null default 'R',
add column if not exists throws text not null default 'R',
add column if not exists height text not null default '',
add column if not exists weight text not null default '',
add column if not exists active boolean not null default true,
add column if not exists grades jsonb not null default '{}'::jsonb,
add column if not exists sort_order integer not null default 0,
add column if not exists metadata jsonb not null default '{}'::jsonb,
add column if not exists updated_at timestamptz not null default timezone('utc', now());

alter table public.roster_players
alter column team_id set default 'lions',
alter column roster_version set default '',
alter column name set default 'Unknown Player',
alter column jersey_number set default '',
alter column positions set default '[]'::jsonb,
alter column primary_position set default 'UTL',
alter column bats set default 'R',
alter column throws set default 'R',
alter column height set default '',
alter column weight set default '',
alter column active set default true,
alter column grades set default '{}'::jsonb,
alter column sort_order set default 0,
alter column metadata set default '{}'::jsonb,
alter column updated_at set default timezone('utc', now());

create table if not exists public.games (
  id text primary key,
  opponent text not null default 'Opponent',
  game_date date,
  game_time text not null default '',
  status text not null default 'scheduled',
  lions_side text not null default 'away',
  is_final boolean not null default false,
  game_data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.app_admins (
  email text primary key,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.league_standings (
  id text primary key,
  season integer not null,
  division text not null,
  rank integer,
  team_name text not null,
  team_code text not null default '',
  wins integer not null default 0,
  losses integer not null default 0,
  ties integer not null default 0,
  record text not null default '--',
  points integer not null default 0,
  win_pct text not null default '--',
  games_back text not null default '-',
  runs_for integer not null default 0,
  runs_against integer not null default 0,
  last_ten text not null default '--',
  streak text not null default '--',
  source_url text not null default '',
  source_label text not null default '',
  synced_at timestamptz not null default timezone('utc', now()),
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now()),
  unique (season, division, team_name)
);

create table if not exists public.game_highlights (
  id text primary key,
  game_id text not null references public.games(id) on delete cascade,
  youtube_url text not null,
  youtube_video_id text not null default '',
  title text not null,
  description text not null default '',
  category text not null default 'top-plays',
  categories jsonb not null default '["top-plays"]'::jsonb,
  inning text not null default '',
  play_type text not null default '',
  player_ids jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.news_articles (
  id text primary key,
  title text not null,
  summary text not null default '',
  body_html text not null default '',
  category text not null default 'Team News',
  game_id text not null default '',
  article_date date,
  image_url text not null default '',
  thumbnail_url text not null default '',
  image_path text not null default '',
  thumbnail_path text not null default '',
  image_data_url text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.site_visits (
  id uuid primary key default gen_random_uuid(),
  visitor_id text not null,
  session_id text not null unique,
  page_path text not null default '',
  view_name text not null default '',
  device_type text not null default '',
  is_admin boolean not null default false,
  visit_date date not null default current_date,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.game_highlights
add column if not exists game_id text not null default '',
add column if not exists youtube_url text not null default '',
add column if not exists youtube_video_id text not null default '',
add column if not exists title text not null default '',
add column if not exists description text not null default '',
add column if not exists category text not null default 'top-plays',
add column if not exists categories jsonb not null default '["top-plays"]'::jsonb,
add column if not exists inning text not null default '',
add column if not exists play_type text not null default '',
add column if not exists player_ids jsonb not null default '[]'::jsonb,
add column if not exists metadata jsonb not null default '{}'::jsonb,
add column if not exists created_at timestamptz not null default timezone('utc', now()),
add column if not exists updated_at timestamptz not null default timezone('utc', now());

alter table public.game_highlights
alter column game_id drop default,
alter column youtube_url drop default,
alter column title drop default,
alter column youtube_video_id set default '',
alter column description set default '',
alter column category set default 'top-plays',
alter column categories set default '["top-plays"]'::jsonb,
alter column inning set default '',
alter column play_type set default '',
alter column player_ids set default '[]'::jsonb,
alter column metadata set default '{}'::jsonb,
alter column created_at set default timezone('utc', now()),
alter column updated_at set default timezone('utc', now());

update public.game_highlights
set categories = jsonb_build_array(category)
where category <> ''
  and (
    categories = '["top-plays"]'::jsonb
    or jsonb_array_length(categories) = 0
  );

alter table public.news_articles
add column if not exists title text not null default '',
add column if not exists summary text not null default '',
add column if not exists body_html text not null default '',
add column if not exists category text not null default 'Team News',
add column if not exists game_id text not null default '',
add column if not exists article_date date,
add column if not exists image_url text not null default '',
add column if not exists thumbnail_url text not null default '',
add column if not exists image_path text not null default '',
add column if not exists thumbnail_path text not null default '',
add column if not exists image_data_url text not null default '',
add column if not exists metadata jsonb not null default '{}'::jsonb,
add column if not exists created_at timestamptz not null default timezone('utc', now()),
add column if not exists updated_at timestamptz not null default timezone('utc', now());

alter table public.news_articles
alter column summary set default '',
alter column body_html set default '',
alter column category set default 'Team News',
alter column game_id set default '',
alter column image_url set default '',
alter column thumbnail_url set default '',
alter column image_path set default '',
alter column thumbnail_path set default '',
alter column image_data_url set default '',
alter column metadata set default '{}'::jsonb,
alter column created_at set default timezone('utc', now()),
alter column updated_at set default timezone('utc', now());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'news-images',
  'news-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

alter table public.site_visits
add column if not exists visitor_id text not null default '',
add column if not exists session_id text not null default '',
add column if not exists page_path text not null default '',
add column if not exists view_name text not null default '',
add column if not exists device_type text not null default '',
add column if not exists is_admin boolean not null default false,
add column if not exists visit_date date not null default current_date,
add column if not exists metadata jsonb not null default '{}'::jsonb,
add column if not exists created_at timestamptz not null default timezone('utc', now()),
add column if not exists updated_at timestamptz not null default timezone('utc', now());

alter table public.site_visits
alter column visitor_id set default '',
alter column session_id set default '',
alter column page_path set default '',
alter column view_name set default '',
alter column device_type set default '',
alter column is_admin set default false,
alter column visit_date set default current_date,
alter column metadata set default '{}'::jsonb,
alter column created_at set default timezone('utc', now()),
alter column updated_at set default timezone('utc', now());

create index if not exists games_status_idx on public.games (status);
create index if not exists games_game_date_idx on public.games (game_date);
create index if not exists games_updated_at_idx on public.games (updated_at desc);
create index if not exists roster_players_team_idx on public.roster_players (team_id, active, sort_order);
create index if not exists roster_players_updated_at_idx on public.roster_players (updated_at desc);
create index if not exists league_standings_division_season_idx on public.league_standings (division, season, rank);
create index if not exists league_standings_updated_at_idx on public.league_standings (updated_at desc);
create index if not exists game_highlights_game_idx on public.game_highlights (game_id, created_at desc);
create index if not exists game_highlights_category_idx on public.game_highlights (category, created_at desc);
create index if not exists game_highlights_categories_idx on public.game_highlights using gin (categories);
create index if not exists game_highlights_updated_at_idx on public.game_highlights (updated_at desc);
create index if not exists news_articles_category_date_idx on public.news_articles (category, article_date desc, created_at desc);
create index if not exists news_articles_updated_at_idx on public.news_articles (updated_at desc);
create unique index if not exists site_visits_session_idx on public.site_visits (session_id);
create index if not exists site_visits_visit_date_idx on public.site_visits (visit_date desc);
create index if not exists site_visits_created_at_idx on public.site_visits (created_at desc);
create index if not exists site_visits_visitor_idx on public.site_visits (visitor_id);

drop trigger if exists set_app_state_updated_at on public.app_state;
create trigger set_app_state_updated_at
before update on public.app_state
for each row execute function public.set_updated_at();

drop trigger if exists set_roster_players_updated_at on public.roster_players;
create trigger set_roster_players_updated_at
before update on public.roster_players
for each row execute function public.set_updated_at();

drop trigger if exists set_games_updated_at on public.games;
create trigger set_games_updated_at
before update on public.games
for each row execute function public.set_updated_at();

drop trigger if exists set_league_standings_updated_at on public.league_standings;
create trigger set_league_standings_updated_at
before update on public.league_standings
for each row execute function public.set_updated_at();

drop trigger if exists set_game_highlights_updated_at on public.game_highlights;
create trigger set_game_highlights_updated_at
before update on public.game_highlights
for each row execute function public.set_updated_at();

drop trigger if exists set_news_articles_updated_at on public.news_articles;
create trigger set_news_articles_updated_at
before update on public.news_articles
for each row execute function public.set_updated_at();

drop trigger if exists set_site_visits_updated_at on public.site_visits;
create trigger set_site_visits_updated_at
before update on public.site_visits
for each row execute function public.set_updated_at();

create or replace function public.record_site_visit(
  p_visitor_id text,
  p_session_id text,
  p_page_path text default '',
  p_view_name text default '',
  p_device_type text default '',
  p_is_admin boolean default false,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_visitor_id text := left(coalesce(nullif(btrim(p_visitor_id), ''), gen_random_uuid()::text), 128);
  clean_session_id text := left(coalesce(nullif(btrim(p_session_id), ''), gen_random_uuid()::text), 128);
  clean_metadata jsonb := case
    when jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) = 'object' then coalesce(p_metadata, '{}'::jsonb)
    else '{}'::jsonb
  end;
begin
  insert into public.site_visits (
    visitor_id,
    session_id,
    page_path,
    view_name,
    device_type,
    is_admin,
    visit_date,
    metadata
  )
  values (
    clean_visitor_id,
    clean_session_id,
    left(coalesce(p_page_path, ''), 240),
    left(coalesce(p_view_name, ''), 64),
    left(coalesce(p_device_type, ''), 32),
    coalesce(p_is_admin, false),
    current_date,
    clean_metadata || jsonb_build_object('recorded_from', 'scorebook-app')
  )
  on conflict (session_id) do update
  set
    page_path = excluded.page_path,
    view_name = excluded.view_name,
    device_type = excluded.device_type,
    is_admin = public.site_visits.is_admin or excluded.is_admin,
    metadata = public.site_visits.metadata || excluded.metadata;
end;
$$;

create or replace function public.get_site_visit_summary()
returns table (
  total_visits bigint,
  today_visits bigint,
  unique_visitors bigint,
  last_visit_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.app_admins admins
    where admins.email = lower((select auth.jwt() ->> 'email'))
  ) then
    raise exception 'Admin access required to view site visit summary.' using errcode = '42501';
  end if;

  return query
  select
    count(*)::bigint as total_visits,
    count(*) filter (where site_visits.visit_date = current_date)::bigint as today_visits,
    count(distinct site_visits.visitor_id)::bigint as unique_visitors,
    max(site_visits.created_at) as last_visit_at
  from public.site_visits;
end;
$$;

insert into public.app_state (id)
values ('primary')
on conflict (id) do nothing;

insert into public.roster_players (
  id,
  team_id,
  roster_version,
  name,
  jersey_number,
  positions,
  primary_position,
  bats,
  throws,
  height,
  weight,
  active,
  grades,
  sort_order,
  metadata
)
select
  player.value ->> 'id' as id,
  'lions' as team_id,
  coalesce(app_state.roster_version, '') as roster_version,
  coalesce(nullif(player.value ->> 'name', ''), 'Unknown Player') as name,
  coalesce(player.value ->> 'number', '') as jersey_number,
  case
    when jsonb_typeof(player.value -> 'positions') = 'array' then player.value -> 'positions'
    else '[]'::jsonb
  end as positions,
  coalesce(player.value ->> 'primaryPosition', 'UTL') as primary_position,
  coalesce(player.value ->> 'bats', 'R') as bats,
  coalesce(player.value ->> 'throws', coalesce(player.value ->> 'bats', 'R')) as throws,
  coalesce(player.value ->> 'height', '') as height,
  coalesce(player.value ->> 'weight', '') as weight,
  coalesce((player.value ->> 'active')::boolean, true) as active,
  coalesce(player.value -> 'grades', '{}'::jsonb) as grades,
  player.ordinality::integer - 1 as sort_order,
  jsonb_build_object('migrated_from', 'app_state.roster') as metadata
from public.app_state app_state
cross join lateral jsonb_array_elements(app_state.roster) with ordinality as player(value, ordinality)
where app_state.id = 'primary'
  and jsonb_typeof(app_state.roster) = 'array'
  and coalesce(player.value ->> 'id', '') <> ''
on conflict (id) do update
set
  team_id = excluded.team_id,
  roster_version = excluded.roster_version,
  name = excluded.name,
  jersey_number = excluded.jersey_number,
  positions = excluded.positions,
  primary_position = excluded.primary_position,
  bats = excluded.bats,
  throws = excluded.throws,
  height = excluded.height,
  weight = excluded.weight,
  active = excluded.active,
  grades = excluded.grades,
  sort_order = excluded.sort_order,
  metadata = public.roster_players.metadata || excluded.metadata;

insert into public.news_articles (
  id,
  title,
  summary,
  body_html,
  category,
  game_id,
  article_date,
  image_url,
  thumbnail_url,
  image_path,
  thumbnail_path,
  image_data_url,
  created_at,
  updated_at,
  metadata
)
select
  article.value ->> 'id' as id,
  coalesce(nullif(article.value ->> 'title', ''), 'Untitled Article') as title,
  coalesce(article.value ->> 'summary', '') as summary,
  coalesce(article.value ->> 'bodyHtml', article.value ->> 'body_html', article.value ->> 'body', '') as body_html,
  coalesce(nullif(article.value ->> 'category', ''), 'Team News') as category,
  coalesce(article.value ->> 'gameId', article.value ->> 'game_id', '') as game_id,
  case
    when coalesce(article.value ->> 'date', article.value ->> 'gameDate', article.value ->> 'game_date', '') ~ '^\d{4}-\d{2}-\d{2}$'
      then coalesce(article.value ->> 'date', article.value ->> 'gameDate', article.value ->> 'game_date')::date
    else null
  end as article_date,
  coalesce(article.value ->> 'imageUrl', article.value ->> 'image_url', '') as image_url,
  coalesce(article.value ->> 'thumbnailUrl', article.value ->> 'thumbnail_url', article.value ->> 'imageUrl', article.value ->> 'image_url', '') as thumbnail_url,
  coalesce(article.value ->> 'imagePath', article.value ->> 'image_path', '') as image_path,
  coalesce(article.value ->> 'thumbnailPath', article.value ->> 'thumbnail_path', '') as thumbnail_path,
  coalesce(article.value ->> 'imageDataUrl', article.value ->> 'image_data_url', article.value ->> 'image', '') as image_data_url,
  case
    when coalesce(article.value ->> 'createdAt', article.value ->> 'created_at', '') ~ '^\d{4}-\d{2}-\d{2}T'
      then coalesce(article.value ->> 'createdAt', article.value ->> 'created_at')::timestamptz
    else timezone('utc', now())
  end as created_at,
  case
    when coalesce(article.value ->> 'updatedAt', article.value ->> 'updated_at', '') ~ '^\d{4}-\d{2}-\d{2}T'
      then coalesce(article.value ->> 'updatedAt', article.value ->> 'updated_at')::timestamptz
    else timezone('utc', now())
  end as updated_at,
  jsonb_build_object('migrated_from', 'app_state.metadata.news_articles') as metadata
from public.app_state app_state
cross join lateral jsonb_array_elements(
  case
    when jsonb_typeof(app_state.metadata -> 'news_articles') = 'array' then app_state.metadata -> 'news_articles'
    else '[]'::jsonb
  end
) with ordinality as article(value, ordinality)
where app_state.id = 'primary'
  and jsonb_typeof(app_state.metadata -> 'news_articles') = 'array'
  and coalesce(article.value ->> 'id', '') <> ''
on conflict (id) do update
set
  title = excluded.title,
  summary = excluded.summary,
  body_html = excluded.body_html,
  category = excluded.category,
  game_id = excluded.game_id,
  article_date = excluded.article_date,
  image_url = excluded.image_url,
  thumbnail_url = excluded.thumbnail_url,
  image_path = excluded.image_path,
  thumbnail_path = excluded.thumbnail_path,
  image_data_url = excluded.image_data_url,
  metadata = public.news_articles.metadata || excluded.metadata;

alter table public.app_state enable row level security;
alter table public.roster_players enable row level security;
alter table public.games enable row level security;
alter table public.app_admins enable row level security;
alter table public.league_standings enable row level security;
alter table public.game_highlights enable row level security;
alter table public.news_articles enable row level security;
alter table public.site_visits enable row level security;

drop policy if exists "Public read app_state" on public.app_state;
create policy "Public read app_state"
on public.app_state
for select
to anon, authenticated
using (true);

drop policy if exists "Public read roster_players" on public.roster_players;
create policy "Public read roster_players"
on public.roster_players
for select
to anon, authenticated
using (true);

drop policy if exists "Public read games" on public.games;
create policy "Public read games"
on public.games
for select
to anon, authenticated
using (true);

drop policy if exists "Public read league_standings" on public.league_standings;
create policy "Public read league_standings"
on public.league_standings
for select
to anon, authenticated
using (true);

drop policy if exists "Public read game_highlights" on public.game_highlights;
create policy "Public read game_highlights"
on public.game_highlights
for select
to anon, authenticated
using (true);

drop policy if exists "Public read news_articles" on public.news_articles;
create policy "Public read news_articles"
on public.news_articles
for select
to anon, authenticated
using (true);

drop policy if exists "Public read news images" on storage.objects;
create policy "Public read news images"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'news-images');

drop policy if exists "Authenticated admin insert news images" on storage.objects;
create policy "Authenticated admin insert news images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'news-images'
  and exists (
    select 1
    from public.app_admins admins
    where admins.email = lower((select auth.jwt() ->> 'email'))
  )
);

drop policy if exists "Authenticated admin update news images" on storage.objects;
create policy "Authenticated admin update news images"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'news-images'
  and exists (
    select 1
    from public.app_admins admins
    where admins.email = lower((select auth.jwt() ->> 'email'))
  )
)
with check (
  bucket_id = 'news-images'
  and exists (
    select 1
    from public.app_admins admins
    where admins.email = lower((select auth.jwt() ->> 'email'))
  )
);

drop policy if exists "Authenticated admin delete news images" on storage.objects;
create policy "Authenticated admin delete news images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'news-images'
  and exists (
    select 1
    from public.app_admins admins
    where admins.email = lower((select auth.jwt() ->> 'email'))
  )
);

drop policy if exists "Authenticated admin read site_visits" on public.site_visits;
create policy "Authenticated admin read site_visits"
on public.site_visits
for select
to authenticated
using (
  exists (
    select 1
    from public.app_admins admins
    where admins.email = lower((select auth.jwt() ->> 'email'))
  )
);

drop policy if exists "Authenticated write app_state" on public.app_state;
create policy "Authenticated write app_state"
on public.app_state
for all
to authenticated
using (
  exists (
    select 1
    from public.app_admins admins
    where admins.email = lower((select auth.jwt() ->> 'email'))
  )
)
with check (
  exists (
    select 1
    from public.app_admins admins
    where admins.email = lower((select auth.jwt() ->> 'email'))
  )
);

drop policy if exists "Authenticated write roster_players" on public.roster_players;
create policy "Authenticated write roster_players"
on public.roster_players
for all
to authenticated
using (
  exists (
    select 1
    from public.app_admins admins
    where admins.email = lower((select auth.jwt() ->> 'email'))
  )
)
with check (
  exists (
    select 1
    from public.app_admins admins
    where admins.email = lower((select auth.jwt() ->> 'email'))
  )
);

drop policy if exists "Authenticated write games" on public.games;
create policy "Authenticated write games"
on public.games
for all
to authenticated
using (
  exists (
    select 1
    from public.app_admins admins
    where admins.email = lower((select auth.jwt() ->> 'email'))
  )
)
with check (
  exists (
    select 1
    from public.app_admins admins
    where admins.email = lower((select auth.jwt() ->> 'email'))
  )
);

drop policy if exists "Authenticated read app_admins" on public.app_admins;
create policy "Authenticated read app_admins"
on public.app_admins
for select
to authenticated
using (email = lower((select auth.jwt() ->> 'email')));

drop policy if exists "Authenticated write league_standings" on public.league_standings;
create policy "Authenticated write league_standings"
on public.league_standings
for all
to authenticated
using (
  exists (
    select 1
    from public.app_admins admins
    where admins.email = lower((select auth.jwt() ->> 'email'))
  )
)
with check (
  exists (
    select 1
    from public.app_admins admins
    where admins.email = lower((select auth.jwt() ->> 'email'))
  )
);

drop policy if exists "Authenticated write game_highlights" on public.game_highlights;
create policy "Authenticated write game_highlights"
on public.game_highlights
for all
to authenticated
using (
  exists (
    select 1
    from public.app_admins admins
    where admins.email = lower((select auth.jwt() ->> 'email'))
  )
)
with check (
  exists (
    select 1
    from public.app_admins admins
    where admins.email = lower((select auth.jwt() ->> 'email'))
  )
);

drop policy if exists "Authenticated write news_articles" on public.news_articles;
create policy "Authenticated write news_articles"
on public.news_articles
for all
to authenticated
using (
  exists (
    select 1
    from public.app_admins admins
    where admins.email = lower((select auth.jwt() ->> 'email'))
  )
)
with check (
  exists (
    select 1
    from public.app_admins admins
    where admins.email = lower((select auth.jwt() ->> 'email'))
  )
);

revoke all on function public.record_site_visit(text, text, text, text, text, boolean, jsonb) from public;
revoke all on function public.get_site_visit_summary() from public;
grant execute on function public.record_site_visit(text, text, text, text, text, boolean, jsonb) to anon, authenticated;
grant execute on function public.get_site_visit_summary() to authenticated;
