-- Adds the digest/monitoring feature's data model: server-side user scope (so a digest can be
-- sent independent of whether someone's actively browsing), per-company snapshots (to diff
-- against next run), and the resulting change events. Additive only — does not touch or drop
-- companies / companies_teaser / buyer_regions. Run this after schema.sql and add_regions.sql.

-- 1. Server-side onboarding scope, one row per signed-in user. Anonymous visitors keep using
--    localStorage (webapp/app.js) — this table only matters once someone has an account to send
--    a digest to.
create table if not exists public.user_scopes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  category text not null default 'cleaning',
  districts text[] not null default '{}',
  include_national boolean not null default true,
  deal_sizes int[] not null default '{1,2,3,4}',
  digest_enabled boolean not null default true,
  is_paying boolean not null default false, -- gating hook for payment work, unused for now
  updated_at timestamptz not null default now()
);

alter table public.user_scopes enable row level security;

create policy "user_scopes_own_row_select" on public.user_scopes
  for select to authenticated using (auth.uid() = user_id);
create policy "user_scopes_own_row_insert" on public.user_scopes
  for insert to authenticated with check (auth.uid() = user_id);
create policy "user_scopes_own_row_update" on public.user_scopes
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- No delete policy, no anon access at all — a user's monitoring preference is theirs alone.

-- 2. Lightweight per-(company, domain) state capture on every pipeline run — the raw material
--    for diffing. Written only by the service-role pipeline (src/pipeline/detect_changes.py),
--    never by the frontend, so no anon/authenticated policy is needed beyond blocking both.
create table if not exists public.company_snapshots (
  id text not null,
  category text not null,
  snapshot_date date not null,
  is_active boolean not null,
  gap_flag boolean not null,
  short_ext_flag boolean not null,
  final_option_flag boolean not null,
  latest_end_obj date,
  full_count integer not null,
  primary key (id, category, snapshot_date)
);
alter table public.company_snapshots enable row level security;
-- No policies at all -> RLS blocks anon and authenticated by default; only service_role
-- (which bypasses RLS) can read/write this table, via detect_changes.py.

-- 3. The actual diff output — one row per detected change, matching the field set already
--    scoped in design_specs_changelog_and_region.md's change-log spec.
create table if not exists public.change_events (
  id bigserial primary key,
  company_id text not null,
  category text not null,
  event_date date not null default current_date,
  type text not null,
  description text not null,
  source_proc_id text,
  created_at timestamptz not null default now()
);
alter table public.change_events enable row level security;
-- Same as company_snapshots: service_role only for now (written by detect_changes.py, read by
-- send_digests.py in the same pipeline run). No frontend surface reads this table yet.

-- Verification:
--   select count(*) from public.user_scopes;       -- as service_role, should work
--   select * from public.user_scopes limit 1;       -- as anon, should be denied/empty
