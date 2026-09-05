# Tender Intelligence — Project Brief & Claude Code Handoff

## 1. Project in one sentence

Build a subscription intelligence product for Israeli SMEs that compete for public-sector procurement, initially focused on **cleaning and facilities/maintenance**, by continuously reconstructing government contract lifecycles and surfacing **upcoming commercial opportunities before they become obvious from ordinary tender alerts**.

The product sells **foresight and structured public information**, not consulting or bidding advice.

---

# 2. Why this product exists

Israeli SMEs that sell to government/public-sector buyers need to know:

- Which organizations currently buy their service
- Who currently holds those contracts
- When those contracts are likely to come back to market
- Whether the incumbent has received extensions/options
- Whether a replacement procurement appears to be forming
- Which new tenders are likely to matter to them
- Which competitors currently hold the business
- What the historical procurement lifecycle looks like

Today, much of this information is public, but it is fragmented across:

- government procurement datasets
- tender publications
- contract/extension decisions
- committee protocols
- tender documents
- amendments
- procurement notices

The problem is not necessarily lack of information.

The problem is **continuously connecting the information into a useful commercial timeline**.

---

# 3. Core product thesis

The initial thesis was:

> Public procurement data can be used to predict when existing contracts are likely to expire and therefore when replacement tenders are likely to appear.

The thesis has evolved.

The stronger formulation is:

> **A continuously maintained procurement lifecycle graph can identify public-sector commercial opportunities before or earlier than a conventional tender-alert product.**

The lifecycle looks like:

```text
Original tender
      ↓
Award / supplier
      ↓
Contract
      ↓
Option 1
      ↓
Option 2
      ↓
Extension
      ↓
Procurement preparation / intent
      ↓
Replacement tender
      ↓
Clarifications / amendments
      ↓
New award
      ↓
New contract
```

The valuable product is not simply:

> "Here are today's tenders."

It is:

> **"These existing government contracts are approaching a commercially important transition, and here is why you should pay attention."**

---

# 4. Initial target customer

Start with **Israeli SMEs that bid repeatedly for government/public-sector contracts**.

Initial target characteristics:

- active bidder
- approximately 4–15 relevant bids/year
- operates in one clearly defined service category
- competes against other SMEs
- meaningful contract values
- enough sales value that finding one additional contract matters
- currently uses some combination of:
  - tender aggregators
  - internal monitoring
  - consultants
  - manual government-site searches
  - alerts
  - spreadsheets

Initial category:

## Cleaning + facilities/building maintenance

Cleaning is the first category because it appears repeatedly in the government procurement data and has relatively understandable contract lifecycles.

Do **not** initially include technical maintenance such as:

- medical equipment maintenance
- software maintenance
- machinery maintenance
- elevator maintenance

Those create a different procurement universe.

---

# 5. Business model hypothesis

Subscription SaaS/data product.

Initial pricing hypothesis:

### Single category
₪500–800/month

### Multi-category
₪1,200–2,000/month

### Consultant / multi-client
Custom pricing

Preferred commercial model:

**Annual subscription**, potentially with a discounted paid pilot before annual commitment.

The pricing is still a hypothesis and must be validated with customers.

---

# 6. Constraints

These are hard constraints.

- Founder continues full-time employment.
- Available time: approximately **5–10 hours/week**.
- Near-zero capital initially.
- No meaningful liability exposure.
- Product should not provide professional procurement/legal advice.
- Product should not determine eligibility.
- Product should not write or submit bids.
- Product should not handle tender submissions.
- Product should not make guarantees about winning.
- Product should primarily present factual public information + clearly labelled forecasts/signals.
- Product must be difficult for a customer to replicate by simply asking Claude a question against public files.
- Annual recurring revenue is the target business model.
- There must be a genuine **month-12 go/no-go decision**.

---

# 7. Critical strategic insight: the moat

The moat should NOT be:

> "We use AI to summarize tenders."

Claude can already do that.

The moat hypothesis is:

## A continuously maintained procurement graph

The system should accumulate:

### Buyer
Who is buying?

### Supplier
Who currently provides the service?

### Contract
What is the relationship?

### Tender
What procurement created it?

### Lifecycle
What options/extensions happened?

### Event history
What changed?

### Replacement
What happened next?

### Entity resolution
Are different spellings actually the same company?

### Historical outcomes
What happened after previous contracts?

Over time this creates a structured dataset that is much harder to recreate with a one-off Claude prompt.

---

# 8. Potential product differentiation

Traditional tender aggregator:

> "New tender published."

Consultant:

> "I advise you how to bid."

Proposed product:

> **"We continuously monitor the lifecycle of public-sector contracts and tell you which commercial opportunities are forming."**

Potential alerts:

### Contract approaching end

> Ministry X  
> Cleaning contract  
> Current supplier: ABC Ltd  
> Current authorized term ends: 31 May 2027  
> Confidence: High

### Extension detected

> Existing cleaning contract extended by 6 months.  
> Replacement procurement may be delayed.

### Procurement intent detected

> Buyer documentation indicates preparation of a replacement procurement.

### Opportunity forecast

> High probability of a replacement procurement within 3–6 months.

### New opportunity

> Replacement tender published.  
> Previous incumbent: ABC Ltd.  
> Historical contract value: ₪X.  
> Relevant geography: X.

---

# 9. Phase 0 — Employment/legal runway

Before commercial development:

1. Review employment agreement.
2. Check:
   - moonlighting
   - non-compete
   - IP assignment
   - outside business restrictions
   - "any business" language
   - competing business definitions
3. Determine whether procurement intelligence is outside the employer's field.
4. If ambiguous, consult an Israeli employment lawyer.
5. Decide disclosure posture.

## Gate 0

If employment agreement prohibits the activity:

**STOP.**

Do not develop commercially until resolved.

---

# 10. Phase 1 — Binary data test

Original objective:

> Can public data support useful contract-expiry / opportunity forecasting?

The experiment has now progressed substantially because the founder uploaded the actual current government procurement exports.

## Uploaded source files

### Government Procurement Administration — Exemptions

Uploaded:

`/mnt/data/Exemptions-07082026.zip`

Contains:

`פלט פטורים_B.xls`

Approximate uncompressed size:

**478 MB**

### Government Procurement Administration — Tenders

Uploaded:

`/mnt/data/Tenders-07082026.zip`

Contains:

`פלט מכרזים_B.xls`

Approximate uncompressed size:

**36 MB**

These are the **7 August 2026** government reports.

These files should be treated as the primary experimental data source.

Do not replace them with stale Data.gov data unless specifically needed for historical backfill or schema comparison.

---

# 11. What has already been established about the data

The historical official Data.gov procurement dataset established that government procurement records can contain:

- buyer/ministry
- publishing unit
- procedure number
- procedure/title
- supplier
- supplier company number
- amount
- contract start date
- contract end date
- subject/category

The current August 2026 files now give us the opportunity to test this at scale with current data.

## Important preliminary result

A preliminary 200-record extraction from the current Exemptions file, filtered broadly for cleaning/maintenance-related terms, showed:

| Field | Preliminary result |
|---|---:|
| Contract end date | ~100% |
| Supplier name | ~97% |
| Supplier company number | ~100% |
| Financial amount | ~100% |
| Contract start date | ~32% |

### Interpretation

The most important preliminary finding is:

> **End dates appear substantially more consistently than start dates in the government contract/extension dataset.**

This makes sense because many records represent options/extensions, where the administrative decision is specifically about authorizing the engagement through a defined end date.

### Important caveat

The initial 200-record sample was a broad keyword sample and therefore included multiple types of "maintenance."

It must NOT be treated as a statistically valid category-wide result.

The proper experiment is still required.

---

# 12. What has been proven qualitatively

Recent government procurement records show that public information can expose:

- original contracts
- contract duration
- option periods
- extensions
- incumbent suppliers
- replacement tenders
- tender amendments
- procurement delays
- transitions between suppliers

Several cleaning examples were found during manual research.

The strongest conceptual finding is:

## Extensions are predictive signals.

For example:

```text
Contract approaching end
        ↓
Short extension granted
        ↓
New procurement not yet completed
        ↓
Replacement tender becomes likely
```

An extension is therefore not just historical data.

It can be a **leading indicator of a future opportunity**.

Another important signal is explicit procurement intent:

> Government documentation sometimes indicates that a replacement procurement is being prepared or considered before the current engagement has fully ended.

This is potentially much more valuable than simple expiry-date alerts.

---

# 13. Critical distinction: expiry vs forecasting

The product has three possible intelligence levels.

## Level 1 — Historical intelligence

> Company X currently holds contract Y.

Useful, but easily replicated.

## Level 2 — Expiry intelligence

> Contract Y ends 31 May 2027.

More useful.

## Level 3 — Opportunity forecasting

> There is a high probability that buyer X will issue a replacement procurement within the next 3–6 months.

This is the actual strategic thesis.

The product should ultimately aim for Level 3.

---

# 14. Revised Gate 1 experiment

We should NOT simply ask:

> "Does the contract have an expiry date?"

Instead test:

> **Can we identify commercially useful lifecycle signals before a replacement procurement becomes obvious?**

For each sampled contract lifecycle, determine:

### A — Explicit

Exact end date and/or explicit replacement signal.

### B — Strongly inferable

Options/extensions make the future opportunity window reasonably clear.

### C — Forecastable but uncertain

No exact expiry, but enough lifecycle evidence to produce a useful probability/window.

### D — Unknown

Insufficient public information.

---

# 15. The proper sample

Use **200 random contract lifecycles** from the actual current population.

Additionally create:

**50 deliberately difficult/stress-test cases.**

Do NOT sample only interesting cases.

Do NOT use search-engine-discovered examples as the statistical sample.

Do NOT use hindsight.

The random sample is the primary Gate 1 evidence.

The 50 stress cases test robustness.

---

# 16. Sampling unit

The correct unit is NOT simply "tender."

It should be:

> **Buyer × service/category × incumbent contract**

One lifecycle can contain many events.

Example:

```text
Buyer: Ministry X
Category: Cleaning

Original tender
    ↓
Supplier ABC
    ↓
Contract
    ↓
Option 1
    ↓
Option 2
    ↓
Extension
    ↓
Replacement tender
    ↓
Supplier XYZ
```

This entire chain is one lifecycle.

Avoid double-counting multiple extension decisions as separate economic opportunities.

---

# 17. Fields to extract

For every lifecycle:

| Field | Description |
|---|---|
| lifecycle_id | Internal identifier |
| buyer | Government buyer |
| category | Cleaning / facilities |
| incumbent | Current supplier |
| supplier_company_id | Company number |
| original_tender_id | Original tender |
| contract_start | Start |
| original_end | Original end |
| maximum_option_end | Maximum known option period |
| extensions | Number |
| extension_dates | Extension timeline |
| extension_reason | If available |
| replacement_tender_id | Linked replacement tender |
| replacement_tender_date | Publication |
| first_replacement_signal | Earliest public evidence |
| new_winner | Subsequent supplier |
| lead_time_days | Warning period |
| classification | A/B/C/D |
| confidence | Confidence score |
| evidence_count | Number of source documents |
| research_time | Manual effort |
| automatable | Yes/no/partial |

---

# 18. Look-ahead bias rule

This is critical.

When reconstructing a historical lifecycle, pretend we are living at date T.

Only information publicly available **on or before T** may be used.

Example:

If tender was published in August 2025, we cannot say:

> "We could have predicted it in January 2025"

unless a January 2025 document contained evidence supporting that conclusion.

The experiment must measure:

> **Earliest actionable public signal**

not simply:

> "When did we eventually discover the answer?"

---

# 19. Lead-time metrics

For every successful forecast, measure:

- >12 months
- 6–12 months
- 3–6 months
- 1–3 months
- <1 month
- only after tender publication

The most important metric:

## Percentage of opportunities where we could have alerted ≥3 months before tender publication.

Secondary:

## Percentage with ≥6 months warning.

---

# 20. Two separate product hypotheses

Test these independently.

## Track A1 — Expiry intelligence

Can we reliably tell:

> "This contract is approaching the end of its currently authorized term."

## Track A2 — Opportunity forecasting

Can we reliably tell:

> "A replacement procurement is likely to emerge."

A1 can succeed while A2 fails.

A2 is more valuable and more differentiated.

---

# 21. Human-effort test

For every lifecycle, measure approximately how long it takes to reconstruct.

This matters because:

> "The information exists"

is not sufficient.

If it takes a human 30 minutes to connect:

- tender
- contract
- supplier
- extension
- committee decision
- replacement tender

then there may be a strong product opportunity.

The customer is paying for **continuous discovery and linkage**, not merely access to public information.

---

# 22. Proposed Gate 1 criteria

## Green — Track A survives

All/most of:

- ≥60% useful lifecycle intelligence
- ≥30% with ≥3 months pre-tender warning
- ≥20% with ≥6 months warning
- ≥70% supplier/entity identification
- lifecycle can be reconstructed with reasonable automation potential
- no catastrophic dependence on one government body/source

## Yellow

- 30–60% useful lifecycle intelligence

Proceed only with a narrower category or enrichment strategy.

## Red

- <30% useful lifecycle intelligence

Kill renewal/opportunity forecasting.

Move to **Track B: award-derived lead generation**.

---

# 23. Track B fallback

If expiry/opportunity forecasting fails, use the same public procurement data for:

> **Award-derived lead generation.**

The product would answer:

- Who just won?
- Who lost?
- Who buys this service?
- How much was awarded?
- Which suppliers are repeatedly winning?
- Which buyers are active?
- Where are new opportunities likely based on historical procurement activity?

Track B requires only the award record and therefore has a lower data dependency.

---

# 24. Phase 2 — Market and competitor analysis

Only after Gate 1.

Tasks:

### Market

- Count active bidders.
- Segment by bidding frequency.
- Estimate annual contract value.
- Build addressable company list.

### Competitors

Research:

- Wizbiz
- Israeli tender aggregators
- tender consultants
- global procurement intelligence products such as Stotles and Tussell
- any Israeli product already doing renewal/opportunity forecasting

Compare:

- data coverage
- alerts
- pricing
- workflow
- forecasting
- competitor intelligence
- lifecycle tracking
- supplier intelligence

---

# 25. Claude replication test

For every planned feature:

Ask:

> Could a customer reproduce this with Claude + public government files?

If yes, either:

1. remove the feature,
2. turn it into a commodity supporting feature,
3. or make the underlying data/product layer the differentiator.

The core product should not depend on:

> "Claude summarizes a tender PDF."

---

# 26. Phase 3 — Customer discovery

Build 30 prospects from the actual procurement population.

Target:

- 4–15 bids/year
- cleaning/facilities
- SMEs
- reachable decision maker

Conduct:

**12–15 × ~20-minute interviews**

Questions:

1. How do you find tenders today?
2. What do you currently pay?
3. Who performs the monitoring?
4. How much time does it consume?
5. When did you last miss an important opportunity?
6. Do you track incumbent suppliers?
7. Do you know when their government contracts expire?
8. Would knowing 3–6 months earlier be valuable?
9. Show them an actual forecast.
10. What would make this worth paying for?

Do not ask only:

> "Would you use this?"

Test actual buying behavior.

Strong signal:

> "Send me the payment link."

---

# 27. Phase 3 Gate

Stop if:

- fewer than 5/15 describe a specific meaningful pain
- nobody identifies a budget/current spend
- nobody expresses willingness to pay
- the forecast does not change their behavior

The purpose is to kill the idea cheaply if necessary.

---

# 28. Phase 4 — Strategy

Only after data + customer validation.

Deliver:

- diagnosis
- guiding policy
- coherent actions
- one category
- one persona
- positioning
- moat thesis
- liability boundary
- 24-month plan

Position explicitly against:

### Aggregators
"alerts"

### Consultants
"advice"

### Product
"continuous procurement intelligence and opportunity forecasting"

---

# 29. Phase 5 — Pricing

Validate:

### Hypothesis

₪500–800/month:

single category

₪1,200–2,000/month:

multi-category

Custom:

consultants / multi-client

Test:

- annual vs monthly
- paid pilot
- value of one additional contract
- current aggregator spend
- internal labor cost
- consultant spend

Initial pilot:

**3 customers × 3 months**

Discounted in exchange for explicit feedback.

---

# 30. Phase 6 — Concierge MVP

Do not build software yet.

The founder manually:

1. builds the dataset
2. identifies lifecycle events
3. produces forecasts
4. delivers them to customers
5. measures time
6. logs questions
7. logs false positives
8. logs missing data

Target:

**2+ paying pilots**

Not merely one.

---

# 31. Concierge Gate

Continue only if:

- ≥2 paying customers
- at least one continues/renews after meaningful delivery
- manual delivery has a credible path to ≤2 hours/customer/month
- customers demonstrate repeated usage/value

If nobody pays after serious attempts:

**STOP.**

---

# 32. Phase 7 — Product requirements

Only after revenue.

Automate the three most expensive manual tasks.

Likely candidates:

1. document ingestion
2. supplier/entity resolution
3. lifecycle linking / expiry inference

Core schema:

```text
Buyer
Supplier
Contract
Tender
Award
Category
Lifecycle Event
Forecast
```

Delivery should probably begin with:

**email digest + simple web interface**

rather than a large dashboard.

---

# 33. Phase 8 — V1

Only after validation.

Potential architecture:

```text
Government sources
       ↓
Ingestion
       ↓
Raw document/data store
       ↓
Normalization
       ↓
Entity resolution
       ↓
Contract lifecycle graph
       ↓
Forecasting / confidence
       ↓
Opportunity ranking
       ↓
Email alerts
       ↓
Web application
```

Critical technical challenge:

## Entity resolution

Supplier names may appear in different forms.

Need canonical:

```text
company_number → canonical_supplier
```

Supplier company number should be preferred over name matching wherever available.

---

# 34. Forecasting architecture

Do not start with a complex ML model.

V1 can use deterministic rules + confidence scoring.

Potential signals:

- contract end approaching
- options remaining
- options exhausted
- short extension granted
- repeated extensions
- procurement preparation language
- new tender preparation
- new tender publication
- historical lifecycle duration
- buyer's historical procurement cycle
- incumbent tenure
- prior replacement behavior

Example:

```text
Base confidence: 40

+20 contract approaching end
+15 options exhausted
+15 extension granted
+20 replacement procurement mentioned
+20 replacement tender preparation detected

= 130 → cap at 99%
```

The actual scoring model should be validated experimentally rather than assumed.

---

# 35. Liability boundary

The product should never claim:

- eligibility
- legal compliance
- probability of winning
- bid correctness
- procurement legality
- recommendation to bid
- guaranteed opportunity
- guaranteed contract renewal

Instead:

> "Public-source intelligence"

> "Estimated opportunity window"

> "Confidence score"

> "Source evidence"

> "Forecast, not guarantee"

The product's job is to surface information and signals.

The customer makes the commercial decision.

---

# 36. Phase 9 — Months 9–12

Target:

**10 paying customers**

Measure:

- churn
- annual retention
- acquisition cost
- sales cycle
- support time
- operational hours/week
- forecast accuracy
- false positives
- second-category performance
- consultant channel

Test:

**Category #2**

using the same product/data pipeline.

Test:

**Consultant resale channel**

with one consultant serving multiple clients.

---

# 37. Month-12 decision

Original plan:

> 10+ annual customers + churn <20% + second category validated + <10 hrs/week → consider leaving job.

Recommended stronger interpretation:

### Small side business

5–10 customers, low effort, positive economics.

Keep alongside employment.

### Strong Go

10+ annual customers, low churn, repeatable acquisition, second category validated, operational load <10 hours/week.

Consider meaningful transition.

### Serious Go

20+ customers / ~₪30K+ MRR, repeatable acquisition and low operational burden.

Leaving full-time employment becomes a credible option.

### Stop

<5 customers or sales require heroic effort.

Do not rationalize the business.

---

# 38. 24-month roadmap

## Months 1–3

Legal + data validation

**Deliverable:** Gate 1

## Months 3–4

Market + competitor research

## Months 4–6

Customer discovery

**Deliverable:** validated persona/JTBD

## Months 6–7

Pricing + positioning

## Months 7–10

Concierge MVP

**Deliverable:** paying pilots

## Months 10–12

Product requirements + first automation

## Months 12–18

V1 product

## Months 18–24

Scale category + customers + channel

---

# 39. Current project status

## Phase 0

🟡 Legal review still required.

## Phase 1

🟢 Strong preliminary evidence that government data contains useful contract lifecycle information.

🟢 Current August 2026 raw files obtained.

🟢 Contract end dates appear highly available in preliminary sample.

🟢 Supplier/company identifiers appear strong.

🟢 Extensions/options exist.

🟢 Replacement tender information exists.

🟢 Procurement-intent signals exist.

🟡 Proper 200-record random sample still required.

🟡 Pre-tender lead-time distribution still required.

🟡 Current nationwide automation feasibility still required.

## Gate 1

**NOT PASSED YET.**

The idea is promising but should not be treated as validated until the random sample is completed.

---

# 40. Immediate next task for Claude Code

Do NOT start building the customer-facing application yet.

First perform the **Phase 1 data experiment** using the uploaded files.

### Step 1

Unzip:

```text
/mnt/data/Exemptions-07082026.zip
/mnt/data/Tenders-07082026.zip
```

### Step 2

Inspect the XLS schemas.

Document:

- column names
- data types
- encoding
- row count
- date formats
- missingness
- duplicate patterns
- procedure IDs
- supplier IDs
- buyer IDs

### Step 3

Build a reproducible classifier for:

```text
Cleaning
Facilities / building maintenance
Technical maintenance
Other
```

Start conservative.

False positives are worse than false negatives for this experiment.

### Step 4

Build the full cleaning/facilities population.

### Step 5

Create a reproducible random sample of **200 contract lifecycles**.

Record the random seed.

The result must be reproducible.

### Step 6

Join the sample against the Tenders dataset.

Investigate:

- procedure number
- buyer
- title
- dates
- supplier
- category
- textual similarity

### Step 7

For every lifecycle, determine:

- contract end
- options
- extensions
- replacement tender
- earliest detectable replacement signal

### Step 8

Calculate:

- A/B/C/D
- expiry coverage
- useful lifecycle coverage
- ≥3 month lead time
- ≥6 month lead time
- ≥12 month lead time
- supplier identification
- tender linkage
- false positives
- manual research effort

### Step 9

Produce:

```text
phase1_report.md
```

with:

1. methodology
2. dataset statistics
3. sample methodology
4. classification results
5. lead-time distribution
6. representative examples
7. failure cases
8. data-quality issues
9. automation feasibility
10. Gate 1 recommendation

### Step 10

Do not proceed to product development based on assumptions.

The report must explicitly say:

```text
GATE 1 = PASS
```

or

```text
GATE 1 = CONDITIONAL / ENRICHMENT
```

or

```text
GATE 1 = FAIL
```

with the evidence.

---

# 41. Product development should begin only after this

If Gate 1 and customer discovery pass, then build the smallest useful product.

The first version should probably be:

```text
User defines:
    category
    geography
    buyer types
    contract-value range

System produces:

    TOP OPPORTUNITIES

    Buyer
    Current supplier
    Contract status
    Expected opportunity window
    Confidence
    Why we think this
    Evidence
    Historical contract value
    Relevant tender history

    [Track this buyer]
    [View evidence]
```

Then deliver the highest-value changes through email.

Do not start with:

- complex dashboards
- dozens of filters
- AI chat
- bid generation
- CRM
- automated proposal writing
- generic tender search
- dozens of categories

The product's first job is simply:

> **Tell an SME about a commercially relevant government opportunity earlier than they would otherwise know about it.**

---

# 42. Core success metric

The north-star metric should not be:

> number of tenders indexed.

It should be:

## Actionable lead time

> **Median number of days between our first actionable signal and publication/opening of the relevant commercial opportunity.**

Secondary metrics:

- forecast precision
- forecast recall
- false-positive rate
- customer engagement with alerts
- opportunities investigated
- opportunities bid on
- customer retention
- revenue per customer

---

# 43. Guiding principle

The project should continuously ask:

> **Are we creating information advantage, or merely making public information prettier?**

If the answer is merely prettier:

**kill the feature.**

If the answer is:

> "We continuously connect public events into a signal the customer could not reasonably maintain themselves."

then keep building.

---

# 44. Current handoff instruction to Claude Code

You are taking over an early-stage validation project.

**Do not assume product-market fit.**

**Do not start by building a polished SaaS UI.**

The current priority is the Phase 1 data experiment.

The raw government procurement files are available locally.

Your first responsibility is to turn those files into a rigorous, reproducible assessment of whether Israeli government procurement data can support a commercially useful contract-lifecycle / opportunity-forecasting product.

Only after the data thesis is quantitatively validated should application architecture and implementation begin.

The project's central question is:

> **Can we identify meaningful public-sector commercial opportunities materially earlier than a target SME could discover them using ordinary tender monitoring or Claude against public documents?**

Everything else is secondary.