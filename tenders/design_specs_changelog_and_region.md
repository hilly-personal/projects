# Design Specs: Change Log & Region Filter

Written 2026-08-31 for design work in Claude Design, covering the two gaps flagged when implementing `Tender Intelligence - App (Feed + Dossier).dc.html`. Each section: what the feature does, why it's not built yet, the exact data it needs, and the UI states/interactions the design should cover.

---

## 1. Change Log ("מה השתנה")

### What it does

A reverse-chronological record of how the system's assessment of one opportunity evolved: new evidence appearing, confidence moving up or down, stage transitions, or an explicit "we checked, nothing changed" entry. This is the concrete proof of the product's actual differentiator — continuous monitoring a customer can't replicate by asking an LLM once against a static file. It should exist both **per-opportunity** (in the Dossier) and, more valuably, as a **digest across everything a customer tracks** (see "Aggregate surface" below) — the latter is closer to what a subscriber actually wants delivered to them.

### Why it's not built yet

It requires comparing at least two snapshots of the government data pulled at different times, to detect what's new or different. We currently have exactly one snapshot (7 August 2026). There is nothing yet to diff against — this is a data-pipeline gap, not a UI gap, and needs to be solved before the design can show real content here.

### Data/infra this depends on (context for design, not a design task itself)

- A recurring pull schedule for the source exports (e.g. weekly).
- Snapshots stored separately by pull-date, never overwritten.
- A diff process, per lifecycle/opportunity, comparing snapshot N against N-1: new records, changed fields on existing records (status, amount, end-date), and a re-run of the confidence score to detect deltas.
- Each detected difference persisted as a discrete, timestamped change event.

### Data points per change-log entry

| Field | Description |
|---|---|
| `date` | When the change was detected (the newer snapshot's pull date) |
| `type` | `new_signal` \| `confidence_change` \| `stage_change` \| `record_updated` \| `no_change` |
| `description` | One-line human-readable summary (e.g. "אופציה שנייה הופעלה בפרוטוקול ועדה") |
| `delta` | Quantified effect where applicable — "ביטחון ↑ 6%", "שלב ↑" — blank for `no_change` |
| `source` | The specific procedure ID behind the change, same evidence-trail pattern as the "why" panel |
| `snapshot_from` / `snapshot_to` | Which two pulls this diff came from — for transparency/debugging, not necessarily shown by default |

### UI states to design

1. **First-observation / empty state** (today's actual state for every opportunity): reassuring, not hidden — "נצפה פעם אחת בלבד. הסריקה הבאה: [date]." Signals the system is watching, not broken.
2. **Populated state**: newest first, matching the existing pattern (mono date, description, colored delta badge) already in the Dossier mock.
3. **`no_change` entries need their own, quieter visual treatment** — muted/smaller than real signal changes, so a long log doesn't drown the meaningful events, but still present (silence would read as "did the system stop watching?").
4. **A next-scan indicator**, visible near the log: "נסרק לאחרונה: [date] · הסריקה הבאה: [date]" — sets the expectation that matters most for a monitoring product.
5. **Aggregate surface (new design opportunity, not just a per-dossier detail)**: a "what changed since you last looked" digest across every tracked opportunity — this is the natural home for the "מעקב" (tracking) nav tab, which is currently a stub, and maps directly to the brief's own preferred delivery mechanism (email digest). Worth designing as its own view, not only as a per-opportunity tab.

---

## 2. Region Filter ("מרכז" / geography)

### What it does

Lets a customer scope the feed to the region(s) they actually operate in — a Center-district cleaning company doesn't want Eilat opportunities. The header's static "ניקיון ואחזקה · מרכז" label implies this is really a **customer-level setting**, not just a feed filter — set once, applied everywhere.

### Why it's not built yet

The source government data has no clean, structured region field. A buyer name (e.g. "עיריית פתח תקווה") implies a location, but nothing in the record states it directly, and large national bodies (ministries) often have no single meaningful region at all — only a specific site or branch mentioned in free text might. Building this needs either:
- A lookup table mapping known municipal/institutional buyer names to Israel's official districts, or
- Entity-resolving each buyer against a canonical directory with known geography.

For national bodies (most ministries), the honest answer is often "no region" — not a wrong guess.

This is real data-engineering work, not a UI toggle — flagging so it isn't scheduled as if it were a quick filter wire-up.

### Data points needed

| Field | Description |
|---|---|
| `region` | One of Israel's standard districts (מרכז / ירושלים / תל אביב / צפון / חיפה / דרום / יהודה ושומרון) **or** `national` for bodies that aren't geographically scoped |
| `region_confidence` / `region_source` | Whether the tag is a confident match, a fuzzy inference, or manually reviewed — matters for not overclaiming geographic precision built on a fuzzy name match |
| `site_address` (stretch) | A specific facility/site extracted from the title where present (e.g. "לשכת רה״מ באר שבע") — richer than buyer-level region, much harder to extract reliably; treat as a later enhancement, not part of the first pass |

### UI states to design

1. **The filter itself should be a real multi-select across all districts**, not a single hardcoded "מרכז" pill — a customer may operate in 1–3 regions, not exactly the one shown in the current mock.
2. **A visible "ארצי / לא משויך לאזור" bucket** for records that can't be regioned — surfaced, not silently dropped. Hiding unregioned data is worse than labeling it honestly uncertain.
3. **A per-row region tag/badge on the Feed**, so a customer can spot-check that a shown opportunity is actually where they expect — this is also the trust mechanism for an imperfect, inferred field.
4. **A Settings screen use case**: region is naturally a one-time customer setting rather than a per-session filter choice — this is a concrete first real screen for the currently-stubbed "הגדרות" nav item, rather than a filter chip alone.

---

## Summary for design work

Both features need their **empty/uncertain states designed as first-class**, not as an afterthought — for the change log, that's "observed once, nothing to compare yet"; for region, that's "national / unassigned." Neither gap is a missing button; both are missing data-pipeline capability that the UI needs to represent honestly while it doesn't exist, and represent richly once it does.
