# Commercial Infrastructure Costs

Compiled 2026-08-31 via live web research (search, not memory). Real prices, not category placeholders.

**Read this top-to-bottom before spending anything.** This is deliberately split into two tiers because building the full Tier 2 stack right now would be the exact premature-investment mistake this project's own gates (Gate 1, Phase 3 customer discovery, the Phase 6 concierge pilot) are designed to prevent. Per `docs/project_brief.md` §30-32, the next real step after Gate 1 is a **manual concierge pilot with 2+ paying customers** — no software yet. Tier 2 only becomes relevant once that validates paying demand.

---

## Tier 1 — Concierge/pilot stage (what you need right now)

This is what the brief's Phase 6 actually requires: you manually build reports and email them to pilot customers. No customer-facing app, no database, no payment processor.

| Item | Needed? | Cost |
|---|---|---|
| Spreadsheets/CSV/parquet files on your own machine | Yes — this is your "database" for now | $0 |
| Email (personal or existing business email) to deliver reports | Yes | $0 |
| Payment collection (bank transfer / invoice, no processor) | Yes | $0 |
| Domain name | Optional — adds legitimacy for a pilot pitch, not required | ~$15-65/yr (.co.il) if you want it now |
| Professional email address (you@yourdomain instead of gmail) | Optional, same reasoning | ~$7-8.40/mo (Google Workspace) if you want it now |

**Total Tier 1: $0/month if you skip the optional domain/email, or roughly $8-15/month if you want to look more official for pilot outreach.** Everything else on this page is Tier 2 and should wait until 2+ people have actually paid you.

---

## Tier 2 — Full self-serve SaaS (only after paying pilots validate demand)

### 1. Legal & business setup

**Business entity** — Israel has three tiers:
- **עוסק פטור (exempt dealer)**: free to open, no cost to maintain, but only allowed while annual revenue stays under **₪122,833/year (2026 threshold)**. No monthly VAT reporting — just one annual report. This is almost certainly your correct starting point.
- **עוסק מורשה (licensed dealer)**: required once you cross that revenue threshold, or if the product ever counts as a listed regulated profession (it doesn't). Registration itself is simple/free at Mas Hachnasa + Bituach Leumi + VAT authority, but ongoing bookkeeping becomes mandatory — see below.
- **חברה בע"מ (Ltd. company)**: a separate legal entity, relevant later if you want liability separation or investors. Registration fee at the Companies Registrar plus annual reporting — meaningfully more overhead than an עוסק. Not needed at 5-10 customers.

**Bookkeeping (מנהל חשבונות)** — once you're an עוסק מורשה: **~₪250+VAT/month (~$70-75/mo)**, roughly **₪3,000/year**, plus the annual tax report brings the yearly total to **~₪3,800+VAT (~$1,050/yr)**. This is legally required once you're not exempt anymore, and it is the single largest recurring cost on this whole page — bigger than all your hosting/database/email infrastructure combined. Budget for it before anything else.

**Israel's e-invoicing allocation-number system (חשבונית ישראל)** — as of June 2026 this applies to any invoice over **₪5,000** (the threshold has been stepping down: ₪25,000 → ₪20,000 → ₪10,000 → ₪5,000). It's a **free government system**, not a cost — but it's a mandatory API/process step for invoices above that amount once you're an עוסק מורשה or company. Your bookkeeper typically handles this.

**Terms of Service / Privacy Policy**: DIY generator (Termly) is **free** for one basic policy, or **$10-15/month** for their Starter/Pro+ tier if you need updates/multiple docs. A lawyer-reviewed version (recommended once you're taking payments and making forward-looking forecasts people might rely on financially) typically runs **several hundred to ~$1,500 one-time** for a SaaS ToS/Privacy Policy — get a real quote when you're there; this wasn't independently verified this session.

**Professional liability / E&O insurance** — worth a quote once you have paying customers, precisely because the product's core value prop is a forward-looking "forecast." Not a pre-revenue necessity. No verified Israeli quote found this session — flag as a to-do for the concierge-pilot stage, not now.

### 2. Domain & branding
**.co.il**: ~$25-65/year depending on registrar. **.com**: typically ~$10-20/year. Either is fine; .co.il signals "Israeli business" more clearly to your target customers.

### 3. Hosting (where the app/pipeline runs)
**Railway** — good fit for a Python backend + scheduled pipeline jobs: **$5/month Hobby plan** (includes $5 of usage — many small apps land near $5-20/month total), or **$20/month Pro**. **Vercel** is the alternative if the frontend becomes the bigger piece (Hobby is free but personal-project-only per their terms; Pro is $20/seat/month) — less natural fit for a Python data pipeline, more natural for a Next.js-style customer dashboard later.

### 4. Database
**Supabase** — free tier: 500MB storage, unlimited API requests, includes auth (useful — you don't need a separate auth service). Realistically covers you through the pilot stage and early paying customers. **Pro plan: $25/month** once you outgrow it (500MB fills up faster than people expect once you're storing evidence records). This also gives you authentication for free, so no separate auth line item is needed.

### 5. File/document storage (evidence PDFs, source documents)
**Cloudflare R2**: $0.015/GB/month, **zero egress fees** (unlike AWS S3, which also charges $0.09/GB to serve files out). At the document volumes this product needs early on (a few GB), this is **effectively $1-5/month**, if not covered by a free allowance.

### 6. Payments / subscription billing — the one that needs real care
**Stripe cannot pay out directly to an Israeli bank account** — a real, structural limitation, not a minor inconvenience. Don't build on Stripe as primary.

Israeli-friendly alternatives:
- **Tranzila**: no monthly/setup fee, **1.5-3% per transaction**, supports recurring billing, pays out in ILS to an Israeli bank account. Good default choice.
- **Cardcom**: **~1.2-1.4% per transaction**, optional invoicing add-on around **₪59/month (~$16)**, stronger native recurring-billing support — worth it specifically because this is a subscription product.
- **PayPal**: technically works, but Israeli recurring billing requires the *payer* to have their own PayPal account linked, which adds friction for a first-time SME customer; also now routes through PayPal Israel Payment Services Ltd. with 18% VAT on fees as of July 2026. Treat as a secondary option, not primary.
- **PayPlus**: mentioned in the Israeli market but no reliable current pricing surfaced this session — get a direct quote if you shortlist it.

**Recommendation: Cardcom or Tranzila as the actual biller, given Stripe's payout limitation.**

### 7. Email
**Transactional (opportunity alerts to customers)**: **Amazon SES** — $0.10 per 1,000 emails, no monthly fee. At realistic early volumes (a few hundred to low thousands of alert emails/month) this is **pennies to a few dollars/month**. Cheapest option by a wide margin; SendGrid's cheapest paid tier alone is $19.95/month for comparison.

**Professional domain email** (you@yourcompany.co.il): **Google Workspace Business Starter — $7/user/month annual, $8.40/month billed monthly.**

### 8. Auth/security
No separate paid service needed — Supabase's free/Pro tier includes auth. SSL/HTTPS is free by default on every host mentioned above (Railway, Vercel, Supabase all provision it automatically).

### 9. Monitoring/error tracking
**Sentry free Developer tier**: 5,000 errors/month, 1 user, 30-day retention — **$0**, sufficient through the pilot and early-SaaS stage. Paid tiers ($26-80/month) only become relevant with real usage volume and a team, neither of which applies yet.

### 10. Customer support tooling
At under 20 customers: **plain email or WhatsApp is genuinely enough — $0.** Don't buy a helpdesk tool (Intercom, Zendesk, etc.) before you have enough support volume to justify it; nothing here recommends one.

### 11. AI/LLM API costs (for later phases: document classification/summarization)
Current Claude API pricing: **Sonnet 5 — $2/$10 per million input/output tokens; Haiku 4.5 — $1/$5 per million tokens** (Haiku is the right choice for high-volume, lower-complexity classification work like this). Illustrative estimate: classifying/summarizing ~2,000 government procurement records/month at ~1,500 tokens each on Haiku 4.5 lands in the **~$5-15/month** range. This scales roughly linearly with document volume — recompute once real volume is known.

**Important distinction**: this is a separate cost from whatever Claude Code / Superset subscription you're already paying to have Claude build the product itself — see #12.

### 12. Development cost — the one most non-developers building via AI tools don't budget for
You're not hiring a developer — you're using Claude Code (via your existing Superset/Claude subscription) to build this yourself. That subscription **is** your engineering cost right now, and it's a sunk cost you're already paying regardless of this project. **The real cost to watch is if this scales into heavy, sustained engineering work** — more complex features, more debugging, more iteration — which shows up as more usage against that subscription (or a higher tier of it), not as a separate line item you'll see coming. This is the single most commonly overlooked cost in "AI builds my SaaS" projects: it doesn't disappear, it just moves into a subscription bill you're not tracking against this specific project. Worth periodically asking "how much of my Claude usage this month was tender-intelligence work" once the project has real running costs to weigh against real revenue.

### 13. Ongoing data costs
The mr.gov.il and data.gov.il sources this product depends on remain free, public government data — **$0**, confirmed in `data_sources_to_acquire.md`. No hidden fee found.

---

## Total estimated monthly cost

### Tier 1 — Concierge/pilot stage
**$0-15/month.** ($0 if you skip the optional domain/professional email until you have a paying pilot; ~$8-15/month if you want the added legitimacy now.)

### Tier 2 — Early SaaS stage (5-10 paying customers)
| Category | Monthly cost |
|---|---:|
| Hosting (Railway) | $10-20 |
| Database (Supabase, likely still free tier) | $0-25 |
| File storage (R2) | $1-5 |
| Payments (Cardcom add-on, optional) | $0-16 (+1.2-3% of revenue, not fixed) |
| Email (SES + Workspace) | ~$10 |
| Domain (amortized) | ~$3 |
| Monitoring (Sentry free) | $0 |
| Support tooling | $0 |
| AI/LLM (Claude API) | $5-15 |
| Bookkeeping (עוסק מורשה, mandatory once past exempt threshold) | ~$70-75 |
| **Total** | **~$100-170/month** |

Plus a one-time legal cost (ToS/Privacy Policy) somewhere in the **$0-1,500** range depending on DIY-vs-lawyer choice, and payment-processor fees of **1.2-3% of revenue** (not fixed monthly).

**Sanity check against the brief's own pricing hypothesis (₪500-2,000/month per customer):** at 5-10 paying customers, infrastructure + bookkeeping costs (~₪365-620/month) run somewhere between roughly the revenue of one customer and a small fraction of total revenue — a genuinely healthy ratio if the pricing hypothesis holds, and a real number to re-check once actual customer count and pricing are known rather than assumed.
