# Phase 1 Report — Gate 1 Data Experiment (Cleaning Category)

Executed against the 7 August 2026 mr.gov.il exports per `docs/project_brief.md` §§9-22, §40.

## 1. Methodology

1. Parsed both source files (`data/raw/tenders_raw.xls`, `data/raw/exemptions_raw.xls`) with a
   custom SpreadsheetML streaming parser (`src/ingestion/parse_spreadsheetml.py`) — see
   `reports/schema_inspection.md` for the format quirks this had to handle (false UTF-16
   declaration, sparse `ss:Index`-addressed cells).
2. Classified every Exemptions record into `cleaning` / `facilities` / `technical_maintenance` /
   `other` with a conservative, precision-first keyword+tag classifier
   (`src/classification/category_classifier.py`).
3. Built buyer × category × incumbent-supplier "engagements" from the classified Exemptions
   population, then chained them into lifecycles with automated cross-supplier replacement
   detection (`src/lifecycle/build_lifecycles.py`).
4. Drew a reproducible random sample: **seed = 42**, 200 primary lifecycles + 50 stress cases
   (deliberately selected for missing end dates, high evidence count, or multiple extensions),
   from the full 1,299-lifecycle cleaning population. Indices recorded in
   `data/samples/sample_indices.json`; full population pickled in
   `data/samples/lifecycles_cleaning_all.pkl` for exact reproducibility.
5. Scored each lifecycle A/B/C/D per brief §14, computed lead-time distributions per §19, and
   spot-checked individual sample records against their underlying source rows for face validity
   (§6-7 below) — this is where a real, load-bearing limitation was found and is reported
   honestly rather than smoothed over.

**Scope note**: this report covers the **cleaning** category only. A `facilities` bucket
(20,183 Exemptions records tagged with the official "construction & building-maintenance
services" category) was built but excluded from Gate 1 sampling — manual inspection showed it
is heavily mixed with construction/renovation work, not facilities upkeep for the SME persona
the brief targets. Classifying it precisely enough to trust is future enrichment work, not part
of this Gate 1 verdict.

## 2. Dataset statistics

- Tenders: 24,572 rows, 17 columns. Exemptions: 239,549 rows, 22 columns.
- Cleaning-classified population: **2,599 Exemptions records**, collapsing to **1,299
  buyer×supplier engagements** (i.e. many records represent repeat extensions/options on the
  same underlying relationship, correctly collapsed per brief §16).
- Full detail (missingness per column, value distributions for the key `תקנה` and `מהות החלטה`
  fields, date ranges) is in `reports/schema_inspection.md`.

## 3. Sample methodology

200 primary + 50 stress lifecycles, seed 42, drawn from the 1,299-engagement cleaning
population (details above). No cherry-picking of the primary 200; the 50 stress cases were
deliberately biased toward harder records (missing dates, longer extension chains) per the
brief's instruction.

## 4. Classification results (A/B/C/D)

| Grade | Primary 200-sample | 50 stress cases |
|---|---:|---:|
| A (explicit end + replacement) | 91 (45.5%) | 10 (20.0%) |
| B (options/extensions clarify window) | 14 (7.0%) | 1 (2.0%) |
| C (forecastable, uncertain) | 35 (17.5%) | 8 (16.0%) |
| D (insufficient info) | 60 (30.0%) | 31 (62.0%) |

**Important — the A/B grade above overstates confidence; see §7.** "A" here required both a
known contract end date AND an automatically-detected "replacement" (a different supplier at
the same buyer within a ±window of the end date). Spot-checking A-grade sample records against
their source rows found the replacement detection is frequently **spurious** — see §7.

Supporting metrics on the 200-sample:
- Supplier identified (name or company number): **100%**.
- Contract end date present: **57.5%** (115/200).
- Explicit extension/option record present (from the structured `תקנה` field, not inferred):
  **31.5%** (63/200).
- Automated "replacement" detected: 84.5% (169/200) — **not trustworthy as stated, see §7**.

## 5. Lead-time distribution

Computed from automated replacement detection (169/200 sample lifecycles with a lead-time
value):

| Bucket | Count | % of full 200-sample |
|---|---:|---:|
| ≥6 months warning | 29 | 14.5% |
| 3–6 months | 4 | 2.0% |
| 1–89 days | 83 | 41.5% |
| ≤0 (replacement predates known end) | 53 | 26.5% |

**This distribution should not be trusted as evidence for opportunity forecasting (Track A2).**
26.5% of "replacements" occur *before* the prior contract's recorded end date, which is not
physically sensible for a genuine same-contract handover and is itself the tell that the
underlying linkage is often matching unrelated concurrent contracts, not real successions —
confirmed by manual inspection (§7).

## 6. Representative example (genuine, single-supplier, high-confidence)

**Buyer**: רשות האכיפה והגבייה (Enforcement and Collection Authority) — **Supplier**: ש.א. יובל
ניהול ואחזקה בע"מ — **Site**: לשכת ההוצאה לפועל בירושלים (Jerusalem enforcement office, named
consistently across all three records).

| Date | Record | Regulation clause | Period |
|---|---|---|---|
| 05.11.2012 | Continuation engagement — options exhausted from original tender | תקנה 3(4)(ב)(2), same conditions as first engagement | 01.01.2013–31.12.2013 |
| 23.07.2014 | "Additional year" engagement, explicit option exercise | תקנה 3ג — exercise of option | 01.09.2014–31.08.2015 |
| 04.08.2015 | Continuation, same site | תקנה 3ג — exercise of option | 01.09.2015–31.08.2016 |

This is exactly the lifecycle pattern the product thesis depends on: same buyer, same site,
same supplier, sequential year-by-year option exercises visible directly in structured
government fields, no free-text inference required. Notably, this lifecycle was graded **B**,
not A, by the automated scorer — because no cross-supplier "replacement" ever fired for it (the
supplier simply kept renewing). That is reassuring: the false-positive replacement problem
below is specific to *cross-supplier* buyer-level chaining, not to tracking a single incumbent's
own extension history, which is the more reliable and immediately usable signal.

## 7. Failure cases (spot-checked from the A-grade sample subset)

Four A-grade sample lifecycles were pulled and checked against their underlying source records
for face validity. **Two of four had classifier false positives, and three of four had
spurious/implausible "replacements":**

1. **Classifier false positive** — "מור תעשיות פלסטיק בע"מ" matched `cleaning` because its
   procedure title was "purchase of green-certified plastic bags **for cleaning campaigns**"
   (שקיות פלסטיק... למבצעי ניקיון) — this is a bag supplier, not a cleaning-services company.
   Its detected "replacement," מנהלת הכינרת (Kinneret Authority), is an unrelated concurrent
   engagement at the same ministry, not a real succession.
2. **Cross-site false link** — ISS (איי אס אס, a real global facilities company) providing
   cleaning at a specific tax office branch (פקיד שומה עכו — Acre) was linked as "replaced" by
   a different supplier (מגדלי נצרת) at the same buyer 358 days later. Nothing in the data
   confirms these are the same physical site/contract — the Tax Authority almost certainly runs
   many concurrent, independent branch-level cleaning contracts, and buyer-level grouping cannot
   distinguish them.
3. **Classifier false positive + cross-site link** — "פאוזה שירותי קפה בע"מ" (a coffee-service
   company) was linked as the "replacement" for a cleaning contract at Ministry of Interior's
   Nazareth Illit district office — implausible on its face; likely a bundled-services listing
   that shouldn't have matched `cleaning` at all.
4. **Cross-region false link, negative lead time** — a Jerusalem-region cleaning extension at
   Customs/VAT was linked to a "replacement" that both predates it (lead time −165 days) and
   most likely belongs to a different region, since the source title explicitly specifies
   "אזור ירושלים" (Jerusalem area) while nothing constrains the matched successor to the same
   area.

**Root cause**: the data has no stable per-site/per-facility identifier. Large buyers
(ministries, the Tax Authority, Customs) run many concurrent, independent cleaning contracts
for different branches/regions. Grouping by (buyer, category, supplier) alone — the best key
available in this dataset — cannot distinguish "this specific contract was replaced" from
"an unrelated concurrent contract at the same buyer happened to start nearby in time." This is
the single most important finding of this experiment.

## 8. Data-quality issues

- **Tenders file is not usable for award/incumbent/date data** — winning-supplier name,
  company number, and contract dates are >99% empty (24,572 rows). It remains useful for
  procedure identification and publication metadata only. See `schema_inspection.md`.
- **Company-number coverage in Exemptions is 61.9%**, not 100% — entity resolution will need a
  name-normalization fallback (implemented, see `normalize_name()` in
  `src/lifecycle/build_lifecycles.py`) for the remaining ~38%, with the accuracy risk that
  implies.
- **No per-site/per-facility identifier** — this is the core limitation described in §7, not a
  parsing artifact. It's a genuine gap in what the government data exposes at this
  granularity.
- **Classifier false positives found empirically, not just theoretically** — "cleaning
  campaign" supply contracts and at least one bundled coffee-service listing slipped through a
  keyword-based classifier. A precision-first classifier still needs a validation pass, not a
  one-shot keyword list.
- SpreadsheetML parsing quirks (false UTF-16 declaration, sparse `ss:Index` cells) are fully
  solved and documented in `schema_inspection.md` — not a residual risk.

## 9. Automation feasibility

- **Parsing + classification + extension-signal extraction**: fully automated, fast (full
  239K-row Exemptions file parses in ~12s, classifies in ~2s). This part of the pipeline is
  production-ready as built.
- **Same-incumbent extension/option tracking** (Track A1 / Level 2 intelligence): automatable
  now, with real structured-field backing (`תקנה`), not inference — see §6.
- **Cross-supplier replacement/opportunity detection** (Track A2 / Level 3, the actual product
  differentiator): **not automatable yet at acceptable precision** with the fields available in
  this dataset alone. It needs either (a) a per-site/per-facility disambiguation signal not
  present in Exemptions — candidate sources: text similarity on `שם הליך` beyond simple keyword
  matching, or explicit region/branch extraction — or (b) cross-referencing against the Tenders
  file's procedure numbers where available, or (c) the companies-registry / payments-to-suppliers
  enrichment sources flagged as blocked in `data_sources_to_acquire.md`.

## 10. Gate 1 recommendation

Scored against brief §22's exact thresholds:

- Useful lifecycle intelligence (A+B): 52.5% of the 200-sample — nominally in the 30–60% Yellow
  band, **but this number is inflated by the spurious replacement detection documented in §7**
  and should not be read as "52.5% of lifecycles are forecastable."
- The trustworthy, structurally-backed signal is narrower: **57.5% end-date coverage + 31.5%
  explicit extension/option evidence**, both sourced directly from controlled government fields.
- ≥3-month lead-time warning: 16.5% of sample — **below the ≥30% Green threshold, but this
  number inherits the same reliability problem and is likely both an overcount (spurious links)
  and an undercount (real replacements missed because concurrent-contract noise obscures them)**.
  It cannot be read as a clean measurement either way.

```
GATE 1 = CONDITIONAL / ENRICHMENT
```

**Track A1 (expiry/extension intelligence) has real, structurally-backed support** and could
plausibly ship on its own: extension/option records are directly readable from a controlled
government field, not inferred, and the one clean representative example (§6) shows exactly the
year-over-year renewal pattern the product thesis describes.

**Track A2 (opportunity/replacement forecasting) — the actual differentiator — is not validated
by this experiment.** The automated buyer-level linkage this experiment could feasibly build
produces enough false positives (§7) that its lead-time numbers are not trustworthy evidence
either for or against the underlying thesis. This should not be read as "the idea failed" — the
brief's own Track A1/A2 split (§20) explicitly anticipates this exact split outcome — but it
means the core differentiated claim ("we can tell you a replacement is coming, 3-6 months out")
is unproven, not proven, and building the customer-facing forecasting feature on top of the
current linkage would be premature.

**Recommended enrichment before re-running Gate 1 on Track A2 specifically**: build a
site/branch-level disambiguation layer (candidate approaches listed in §9) and re-run the
replacement-detection logic against a held-out slice of the sample where the true answer can be
manually verified from the source `שם הליך` text, to get a real precision measurement for the
linkage itself — rather than trusting the current buyer-level heuristic.
