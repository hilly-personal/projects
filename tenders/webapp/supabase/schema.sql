-- Tender Intelligence — public sample tool backend
--
-- Run this in the Supabase SQL editor (Project → SQL Editor → New query → paste → Run).
--
-- MULTI-DOMAIN MIGRATION: this rebuilds `companies` from a single-category (id-only) table
-- into a (company, domain)-scoped table — a company can now have separate rows per domain
-- (cleaning, security, etc.), each with its own independent lifecycle signals, because a real
-- company can be in a renewal gap for one domain while actively contracted in another. This
-- DROPS the existing table (all data is regenerated from app/companies.json + the other
-- data/processed/companies_<category>.json files via scripts/load_data.py — nothing here is
-- the source of truth, so dropping it is safe, not destructive of anything irreplaceable).

drop view if exists public.companies_teaser;
drop view if exists public.market_stats;
drop table if exists public.companies;

-- 1. Full table — every derived signal from the category-scoped dataset files, one row per
--    (company, domain) pair.
create table public.companies (
  id text not null,
  category text not null,
  names jsonb not null,
  buyers jsonb not null,
  records jsonb not null,
  record_count integer not null,
  full_count integer not null,
  year_min integer not null,
  year_max integer not null,
  is_active boolean not null,
  latest_end_obj date,
  days_to_end integer,
  latest_buyer text,
  latest_amount text,
  latest_mechanism text,
  latest_proc_id text,
  gap_flag boolean not null default false,
  short_ext_flag boolean not null default false,
  short_ext_buyer text,
  option_count integer not null default 0,
  continuation_count integer not null default 0,
  final_option_flag boolean not null default false,
  primary key (id, category)
);

-- 2. Lock the full table down: only a signed-in (authenticated) session may read it directly.
--    Anonymous requests to /rest/v1/companies get nothing back, regardless of any client-side
--    UI logic — this is the actual security boundary.
alter table public.companies enable row level security;

create policy "companies_select_authenticated_only"
  on public.companies
  for select
  to authenticated
  using (true);

-- No insert/update/delete policy for anon or authenticated — those roles get zero write access.
-- Data loading happens only via scripts/load_data.py using the service_role key (bypasses RLS
-- by design — that key must never be embedded in the frontend or shared outside your machine).

-- 3. Public teaser view — the only thing anonymous visitors can query. Deliberately excludes
--    buyers, records, latest_buyer, latest_amount, latest_mechanism, latest_proc_id,
--    short_ext_buyer, exact days_to_end, option_count, continuation_count — i.e. every field
--    that names a third party or gives an exact, actionable figure. Views run with the
--    privileges of their owner by default, so this view can read the locked base table even
--    though anon cannot query the table directly.
--
-- volume_bucket / dealsize_bucket reproduce the sample tool's original magic-quadrant axes
-- (count of records won within the row's own category; median amount among those, floored at
-- ₪1,000 to exclude the government data's literal "1" placeholder values — see
-- business_viability_review.md's note on this) but expose only a 1-4 quartile rank, computed
-- separately PER CATEGORY (a company's security volume is not compared against cleaning
-- volumes), never the real count or amount, so the chart stays meaningful without leaking
-- exact figures. Unlike the pre-migration version, this does NOT re-filter records by a
-- cleaning-specific keyword — every row's `records` are already scoped to its own `category`
-- by the generator (src/lifecycle/gen_company_dataset.py), so all of a row's records count.
create or replace view public.companies_teaser
  with (security_invoker = false)
as
with per_record as (
  select
    c.id,
    c.category,
    r ->> 'amount' as amount_raw
  from public.companies c,
       jsonb_array_elements(c.records) as r
),
volume_per_company as (
  select id, category, count(*) as volume
  from per_record
  group by id, category
),
dealsize_per_company as (
  select id, category, percentile_cont(0.5) within group (order by amount_raw::numeric) as deal_size
  from per_record
  where amount_raw ~ '^[0-9]+(\.[0-9]+)?$' and amount_raw::numeric >= 1000
  group by id, category
),
buckets as (
  select
    v.id,
    v.category,
    ntile(4) over (partition by v.category order by v.volume) as volume_bucket,
    ntile(4) over (partition by d.category order by d.deal_size) as dealsize_bucket
  from volume_per_company v
  join dealsize_per_company d on d.id = v.id and d.category = v.category
)
select
  c.id,
  c.category,
  c.names,
  c.year_min,
  c.year_max,
  c.full_count,
  c.is_active,
  c.gap_flag,
  c.short_ext_flag,
  c.final_option_flag,
  (c.days_to_end is not null and c.days_to_end <= 150) as expiring_soon,
  case
    when c.full_count >= 15 or jsonb_array_length(c.buyers) >= 4 then 'leading'
    when c.full_count >= 5 or jsonb_array_length(c.buyers) >= 2 then 'established'
    else 'rising'
  end as tier,
  b.volume_bucket,
  b.dealsize_bucket
from public.companies c
left join buckets b on b.id = c.id and b.category = c.category;

grant select on public.companies_teaser to anon, authenticated;

-- companies itself is NOT granted to anon (RLS above blocks it regardless, this is belt+braces)
grant select on public.companies to authenticated;

-- 4. Aggregate market-wide stats, PER CATEGORY (total companies, active count, distinct buyer
--    count within that one domain) — pure aggregate numbers, not tied to any named company, so
--    safe for anonymous visitors even though computing the buyer count requires reading the
--    locked `buyers` column server-side. Query with ?category=eq.<name>.
create or replace view public.market_stats
  with (security_invoker = false)
as
select
  c.category,
  count(*) as total,
  count(*) filter (where c.is_active) as active,
  (
    select count(distinct b)
    from public.companies c2, jsonb_array_elements_text(c2.buyers) as b
    where c2.category = c.category
  ) as buyers
from public.companies c
group by c.category;

grant select on public.market_stats to anon, authenticated;

-- 5. Verification queries — run after loading data:
--   select category, count(*) from public.companies group by category;  -- as service_role
--   select * from public.companies_teaser where category='cleaning' limit 1;  -- as anon: no buyer/date/amount fields
--   select * from public.companies limit 1;  -- as anon: should return 0 rows / be denied
