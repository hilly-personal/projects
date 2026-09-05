-- Adds the open-tenders table: live, currently-open-for-submission tenders scraped from
-- mr.gov.il's real public tender search (src/ingestion/scrape_open_tenders.py) — a separate,
-- different data source from companies/companies_teaser (which come from the historical
-- Exemptions bulk export). Additive only, no changes to any existing table.
--
-- Deliberately NOT gated like companies_teaser: an open tender is a public invitation to bid,
-- not a specific supplier's exposed contract status, so there's no third-party exposure
-- concern here — this table is fully public.

create table if not exists public.open_tenders (
  publication_number text primary key,
  category text not null,
  title text not null,
  buyer text not null,
  publish_date date,
  submit_start date,
  submit_end date,
  detail_url text,
  first_seen date not null default current_date,
  last_checked date not null default current_date
);

alter table public.open_tenders enable row level security;

create policy "open_tenders_public_read" on public.open_tenders
  for select to anon, authenticated using (true);
-- No insert/update/delete policy for anon/authenticated — only the service_role scraper writes.

-- Verification:
--   select category, count(*) from public.open_tenders group by category;  -- as service_role
--   select * from public.open_tenders where category='cleaning' limit 3;    -- as anon: should work, full data
