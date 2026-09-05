-- "New since your last visit" badge on the open-tenders feed. Additive column on the existing
-- user_scopes table (already RLS-locked to the owning user) — no new table needed. Anonymous
-- visitors track the same concept in localStorage (webapp/app.js), never server-side.
alter table public.user_scopes
  add column if not exists open_tenders_last_visit date;

-- Verification:
--   select user_id, open_tenders_last_visit from public.user_scopes limit 1;  -- as service_role
