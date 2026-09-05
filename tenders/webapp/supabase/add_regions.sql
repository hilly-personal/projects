-- Adds location scoping for the onboarding flow. Run this AFTER schema.sql (it does not touch
-- or drop the companies table — no data reload needed).
--
-- Design: buyer_regions is a small reference table (ministry/hospital/authority name -> Israeli
-- district or national) — this is public information about GOVERNMENT BUYERS, not about any
-- supplier, so it's safe to expose in full. What must stay hidden is which SPECIFIC buyer a
-- given supplier works with — so companies_teaser joins against buyer_regions to compute each
-- company's district SCOPE (which regions its buyers span) without ever including the buyer
-- names themselves in the teaser output. Verified 100% buyer coverage across all 6 validated
-- domains (66 distinct buyers) before building this.

create table if not exists public.buyer_regions (
  buyer text primary key,
  region text,
  is_national boolean not null default false
);

grant select on public.buyer_regions to anon, authenticated;
-- No RLS needed here — this table names only government buyers/ministries, never a supplier.

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
),
company_regions as (
  select
    c.id,
    c.category,
    array_agg(distinct br.region) filter (where br.region is not null) as regions,
    bool_or(coalesce(br.is_national, false)) as has_national_buyer
  from public.companies c
  cross join lateral jsonb_array_elements_text(c.buyers) as buyer_name
  left join public.buyer_regions br on br.buyer = buyer_name
  group by c.id, c.category
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
  b.dealsize_bucket,
  coalesce(cr.regions, array[]::text[]) as regions,
  coalesce(cr.has_national_buyer, false) as has_national_buyer
from public.companies c
left join buckets b on b.id = c.id and b.category = c.category
left join company_regions cr on cr.id = c.id and cr.category = c.category;

grant select on public.companies_teaser to anon, authenticated;

-- Verification (as anon):
--   select regions, has_national_buyer from public.companies_teaser where category='cleaning' limit 5;
