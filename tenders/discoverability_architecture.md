# Discoverability Architecture — SEO / GEO Plan

Drafted 2026-09-05, per the `seo-geo` skill. This is a **plan**, not a build — see "Sequencing"
at the bottom for what's cheap to lock in now vs. what should wait.

## Why this needs its own design pass, not a generic SEO checklist

This product's core paid value is **exactly the thing a naive public page would give away for
free**: the whole reason `companies_teaser` exists (see `webapp/supabase/schema.sql`) is that a
specific supplier's buyer relationships, dates, and amounts are commercially sensitive to that
supplier and valuable to their competitors — that's what a signup unlocks. The `seo-geo` skill's
"golden rule" (facts must be in the initial server-rendered HTML, not gated) is written for
products where the public facts *are* the product. Here, they mostly aren't. So the public layer
below is deliberately built from the data that's **already** non-sensitive by this project's own
design — not a new access-model decision, a rendering of one already made.

## The three entity types

### 1. Open tenders — the obvious, zero-conflict starting point
`open_tenders` (see `webapp/supabase/add_open_tenders.sql`) was already built as fully public — an
open tender is an invitation to bid, not a supplier's exposed status (no RLS gating at all). This
is the least risky, most natural first public surface.

- **URL**: `/tenders/{category}/{publication_number}` (e.g. `/tenders/cleaning/4000619100`) —
  numeric ID in the path avoids Hebrew-slug URL-encoding mess; the Hebrew title/buyer go in the
  page's `<h1>`/meta, not the URL.
- **Content**: title, buyer, publish/submit-start/submit-end dates, category, a link to the real
  mr.gov.il source (`detail_url`) — all fields already scraped and stored, nothing new to compute.
- **Kept live after closing**, not deleted or 410'd: a closed tender is still a real historical
  record ("did buyer X run a cleaning tender in 2026?") and keeps the page from ever being thin —
  status is just clearly marked "סגור להגשה" instead of removed.
- **CTA into the private layer**: "עקבו אחרי מכרזים דומים ל[buyer] בתחום [category]" → the
  onboarding flow (`webapp/index.html#onboarding-firstrun`), pre-scoped to that category — a
  specific next step, not a generic "sign up" banner.

### 2. Buyer pages — the real long-tail engine
A government buyer's identity isn't sensitive (it's the *supplier's* exposure that's gated) —
`buyer_regions` (`add_regions.sql`) already has every buyer name mapped to a district, and
`companies_teaser`'s aggregate fields (`tier`, `is_active`, counts) are already anonymous-safe by
construction.

- **URL**: `/buyers/{buyer-id}` (a new stable slug/id needs to be assigned to each buyer name —
  today buyers are matched by exact string, not a real entity table; this is the one real
  data-model addition, and it's cheap to do now: a `buyers` table with `id, name, district`,
  replacing string-matching in `buyer_regions`).
- **Content**: which categories this buyer procures in, aggregate counts only ("3 ספקי ניקיון
  פעילים כרגע" — no supplier names), district, links to this buyer's open tenders (entity type 1).
  **Never** a specific supplier's name/dates/amount tied to this buyer on the public page — that
  stays exactly as gated as it is today.
- **Eligibility gate** (anti-thin-content): only publish a buyer page once it has ≥3 real records
  or ≥1 currently-open tender — a large index of one-record buyer stubs is a liability, not an
  asset, per the skill's own warning.
- **CTA**: "עקבו אחרי [buyer]" → onboarding pre-scoped to that buyer's district + category.

### 3. Category hub pages — reuses data that's already computed
One per validated domain (currently 7: cleaning, security, catering, gardening, laundry,
transport, parking). `market_stats` (`schema.sql`) already computes `total`/`active`/`buyers` per
category — zero new computation for a first version.

- **URL**: `/domains/{category-key}` (e.g. `/domains/cleaning`) — reuses the same `key`s already in
  `DOMAINS` (`webapp/app.js`), so no new naming decision needed.
- **Content**: real aggregate stats (already fetched via `fetchMarketStats`), links to open tenders
  in that domain, links to buyer pages active in that domain — an index page, not new data.
- **CTA**: "ראו את כל ההזדמנויות הפעילות בתחום [X]" → onboarding pre-scoped to that category.

### Explicitly NOT public: individual company/supplier pages
This is the boundary the whole plan hinges on. A public page for a specific supplier showing real
buyer names, dates, or amounts would hand the entire paid product to search crawlers and
competitors for free — the opposite of what `companies_teaser`/RLS were built to prevent this
session. If a company page exists publicly at all, it's a thin stub ("X is a tracked supplier in
the cleaning sector — sign in to see full history") with **zero** real facts, functioning purely as
a signup CTA, not an SEO asset in its own right.

## The real architectural blocker: this is a client-side SPA today

`webapp/` is a single `index.html` + `app.js` that renders everything from live Supabase queries in
the browser — a crawler hitting any URL today gets the SPA shell, not content. This is precisely
the anti-pattern the skill warns against (`page → JS → API → DB`, not `page → useful HTML`), and it
has to be solved before any public page is worth publishing, independent of which entities get
picked.

**The fix fits the existing infrastructure, not a new framework**: the project already has a
Python pipeline (`src/pipeline/refresh_all.py`, `src/ingestion/scrape_open_tenders.py`) that
regenerates static JSON files on a schedule via GitHub Actions and deploys as static files to
Cloudflare Pages. The natural extension is a build-time static-HTML generation step in that same
pipeline — real server-rendered (well, build-rendered) HTML per tender/buyer/category, output
alongside the existing `webapp/` files — not a live server, not a new rendering framework.

## Structured data — only what's actually true

- Buyer pages: `GovernmentOrganization` (schema.org) — a real, matching type.
- Everywhere: `BreadcrumbList` — real navigational structure, cheap and honest.
- Category hub pages: `ItemList`/`Dataset` for the linked tenders.
- **No forced schema type for individual tenders** — schema.org doesn't have a clean "government
  procurement opportunity" type, and forcing `Event` or `JobPosting` onto it would be exactly the
  "mark up a claim the page doesn't support" mistake the skill warns against. Clean semantic HTML,
  a real `<title>`/meta description, and breadcrumbs carry that page instead.

## What to state explicitly on every public page (the AI-answer-engine differentiator)

Per the skill: an AI answer engine can already state "buyer X ran a cleaning tender in 2024" from
its own training data or a single search result — that's not a reason to visit this site. Every
public page should say, in plain language, what a static answer can't: *this listing is monitored
continuously, and you'll be notified the moment it changes* — the forward-looking claim, stated
directly, not implied.

## Eligibility gates, summarized
| Entity | Minimum bar |
|---|---|
| Open tender | Always (already gated upstream — real scrape only) |
| Buyer | ≥3 real records OR ≥1 currently-open tender |
| Category | All 7 validated domains qualify today |
| Company/supplier | Never a full page — thin stub only, no real facts |

## Sequencing — what to do now vs. what to wait on

**Do now (cheap, schema/naming only):**
- Lock the three URL patterns above so future data-model work doesn't collide with them.
- Add the `buyers` table (id/name/district) — small, and the one real schema gap.
- Nothing else structural — no page templates, no JSON-LD library, no build-pipeline changes yet.

**Wait on (real build work — gate behind actual validation, per this project's own
`ROADMAP.md` "Open questions": willingness-to-pay is still unresolved, Cardcom isn't live, and the
competitor-matrix claims haven't been re-verified):**
- The static-HTML build step itself.
- Actually publishing buyer/category/tender pages at scale.
- Any schema.org/JSON-LD rollout.

**If a cheap pilot is wanted before full commitment**: open-tender pages alone are the lowest-risk
test — the data is small (dozens, not thousands, of rows today), already fully public with zero
new access-model risk, and would validate whether this channel produces any real signal at all
before building out the much larger buyer-page long tail.
