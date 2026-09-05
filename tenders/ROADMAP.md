# Feature Roadmap — Tender Intelligence Platform

Living roadmap, edited directly (by you or with me) as the project evolves. Status annotations
below reflect what's actually been built and verified in this repo as of 2026-09-05 — everything
else in this list came from your own competitor-matrix research, which I haven't independently
verified in this session (see the "Open questions" section at the bottom, which already flags
this — worth resolving before treating competitor-claim items as settled fact).

## Tier 0 — Parity (must-have to be a credible switch target)
- [~] Full source ingestion: official public tenders + scraped private-sector opportunities (match Yfat/Govo breadth)
  — **Partially built**: live scraping of mr.gov.il's real public tender search is done and verified (`src/ingestion/scrape_open_tenders.py`, runs every 8h), but deliberately scoped to our 6 validated domains, not full nationwide/private-sector breadth — that's a much larger undertaking (hundreds of individual municipal/institutional sites) that was explicitly descoped this round in favor of starting small.
- [ ] Category taxonomy, ~70+ branches (currently narrower than this — needs expansion)
  — We're at 6 validated domains (cleaning, security, catering, gardening, laundry, transport), each individually precision-checked against real title samples. Pest control was tried and rejected (agricultural-research contamination in the source data, no fix found). Expanding further means repeating that same per-domain precision-sampling discipline, not just adding keywords.
- [~] Category-based smart alerts: email / SMS / push
  — **Partially built**: weekly change-detection + email digest pipeline is coded and wired to a real Resend account (`src/pipeline/detect_changes.py` + `send_digests.py`), verified against a real first snapshot in production. Still needs a second real week-over-week run to prove an actual diff-triggered email end-to-end. No SMS/push.
- [ ] Structured, filterable premium fields: budget/financial scope, contractor license tier, document cost, location — done as real filters, not a locked "field exists" teaser
  — Location and deal-size-quartile filters exist in the onboarding flow, backed by real data (buyer→district mapping, quartile buckets computed server-side). Contractor license tier and document cost aren't in any source data we have — would need a new source, not just a UI filter.
- [ ] "New since your last visit" indicator on the open-tenders feed — a badge/count of how many new listings were added since the user last checked
  — Builds directly on the already-shipped `open_tenders` table (`first_seen` date already stored per tender). Needs a per-user "last visited" timestamp — natural extension of `user_scopes` (already server-side, per signed-in user) — anonymous visitors would need a localStorage-based fallback timestamp instead.

## Tier 1 — Wedge (differentiation — nobody in the matrix does these)
- [~] Real fit-scoring against company profile (past bids/wins, licenses, sector) — replaces keyword "smart agent" matching
  — The renewal-signal model (`gap_flag`/`short_ext_flag`/`final_option_flag`/tier classification) is a real, working version of this for the *exemptions* data, not yet extended to a full "company profile" concept.
- [ ] Structured budget-tier filtering + historical award benchmarking ("similar tenders closed at ₪X–Y")
  - ⚠️ **Gate, already partially informed by this session's own findings**: we already hit exactly the failure mode this flags — the government amount field carries a literal "1" placeholder for undisclosed amounts (handled: floored at ₪1,000 before computing medians), and the bulk Tenders export's award/supplier fields were found >99% empty in the original Phase 1 investigation. Any budget-benchmarking feature needs the same fill-rate audit discipline already applied elsewhere before trusting it.
- [ ] Win-probability signal: incumbent-holder detection, competitor density, historical win rate by category
  — Incumbent-holder detection exists in spirit (`latest_buyer`, tier/volume-based classification on the magic-quadrant chart); true win-probability scoring doesn't.
- [ ] AI eligibility-checklist + deadline extraction from tender documents
  — Deadline *extraction* for open tenders is done (`submit_start`/`submit_end` scraped directly from mr.gov.il's real detail pages). Document-level eligibility-checklist parsing is not.
- [ ] Automated first-draft bid sections (compliance/qualification boilerplate) — targets the Yfat Radar / Govo consultant / Maagarim add-on revenue line
- [ ] For subscribed users: approximate cost to bid per tender (document-purchase fee + any required bid guarantee/deposit) — real submission-associated costs, not the contract value itself
  — Not yet verified whether mr.gov.il's tender detail pages expose this at all (we only confirmed title, buyer, and submission dates so far — see `scrape_open_tenders.py`). Needs the same discipline as everything else scraped this session: check real detail pages for a document-cost/guarantee field before assuming it's extractable, rather than building UI against an assumed field.

## Tier 2 — Stickiness & team expansion
- [ ] Pipeline/kanban tracking (watching → preparing → submitted → won/lost)
- [ ] Team roles + shared org memory of past submissions/outcomes
- [ ] Vendor/subcontractor directory linked to specific open tenders

## Tier 3 — Vertical & adjacent expansion
- [ ] Construction vertical pack (contractor-classification-aware, site-visit dates, bank-guarantee amounts)
- [ ] Lightweight competitor/market intelligence (who's winning, at what price) using Tier-1 award data
- [ ] API/CRM integration (Salesforce, monday.com, Priority)
- [ ] Tender-lawyer marketplace: a second, distinct user type (lawyers, not contractors) who subscribe to get matched with contractors requesting tender assistance or submission help, billed per engagement rather than the flat contractor subscription
  — A real two-sided marketplace, not a feature toggle on the existing product: needs (1) a lawyer account type/role separate from `user_scopes`, (2) a request/matching flow (contractor asks for help -> relevant lawyers notified), (3) per-engagement billing distinct from Cardcom/Tranzila's single-sided flat subscription (a marketplace commission or per-case invoice model, not yet designed), and (4) real legal/liability scoping — this platform would be introducing/facilitating a professional-services relationship, not just showing data, which is a different liability posture than anything shipped so far.

## Open questions to resolve before treating this as final
- [ ] Re-verify the competitor feature matrix with scrape dates / confidence labels per cell — several "not shown" entries (esp. Yfat, which is sales-assisted) may mean "not public" rather than "doesn't exist"
- [ ] Get actual willingness-to-pay signal before committing to a "sit between Govo and Yfat" pricing position — three competitor list prices are not a demand curve, and Maagarim's capped-category tier suggests a price-sensitive segment worth pricing for separately

## Already shipped this session, not on the original list above
- Corrected classifier bug affecting 94/133 companies' record counts (title-vs-subject-tag matching)
- Real access-model fix: signup-gated named data, fully public anonymized showcase examples, Supabase RLS-backed (not cosmetic CSS blur)
- Onboarding flow: domain + location + deal-size selection, server-side persisted once signed in
- Recurring weekly full-data refresh via GitHub Actions (verified running end-to-end)
