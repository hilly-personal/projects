# Architecture Requirement: Public Discoverability Layer

Added 2026-08-31, per the `seo-geo` skill. This is a **requirement on the future data model**, captured now while the schema is still being designed, so it doesn't have to be retrofitted later. It is **not** a build task for now — see Status at the bottom.

## The two-layer product

- **Private intelligence layer** (what's sold): personalized opportunity pipeline, alerts, forecasts, watchlists — the subscription product described in the brief.
- **Public knowledge layer** (how people find it): structured, crawlable pages answering specific real procurement questions, driving both Google search and AI-answer-engine (ChatGPT/Claude/Gemini/Perplexity) traffic into the private layer via a scoped CTA ("track this buyer").

## Canonical entity model (design into the schema now)

Every core entity gets a canonical slug, URL, title, description, structured facts, related-entity links, source citation, and last-updated timestamp:

```
/data/buyers/<slug>          e.g. /data/buyers/tel-aviv-municipality
/data/suppliers/<slug>       e.g. /data/suppliers/moriya-cleaning
/data/categories/<slug>      e.g. /data/categories/cleaning
/data/tenders/<slug>         e.g. /data/tenders/123-2026
/data/contracts/<slug>       e.g. /data/contracts/tel-aviv-municipality-cleaning-2024
```

This directly maps onto the lifecycle graph entities already defined in the brief (Buyer, Supplier, Contract, Tender, Category, Lifecycle Event) — no new data model is needed, just a canonicalization/slugging layer on top of what Phase 1/8 already plans to build.

## Rules

- Content must be in server-rendered HTML, never hidden behind JS or a login — crawlers and AI retrieval must see the real facts directly.
- Schema.org markup (Organization, GovernmentOrganization, Dataset, BreadcrumbList) only for what the page visibly shows — never overclaim via structured data.
- Every page links to natural neighbors (buyer ↔ supplier ↔ category ↔ related tenders) — a crawlable reflection of the actual procurement graph.
- **Eligibility gate, to avoid thin-content spam**: a page only publishes if it clears a minimum bar — e.g. ≥3 procurement events for that entity, OR an active/current contract, OR otherwise meaningful history. A tender with two fields and a PDF link does not get its own page.
- Design for long-tail Hebrew queries generated naturally by the data ("מכרז ניקיון [buyer] [year]", "מי חברת הניקיון של [buyer]"), not competitive generic terms.
- The conversion pitch on every public page should name what a chatbot answering the same question from general knowledge can't claim: continuous monitoring, extension/replacement history, a forward-looking window with evidence — not just "we have data too."

## Status

**Design requirement only — captured now for the future data model, not scheduled for build.** Per the brief's own phasing and the current `business_viability_review.md` (Yellow verdict), the public layer is Phase 7/8 work, after Gate 1 and customer discovery validate the private product. Building it now, before the first outreach interviews are even answered, would be the over-investment risk the viability review specifically warned against. Revisit once Gate 1 passes and the concierge pilots are running.
