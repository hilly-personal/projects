# Phase 0 — Employment/Legal Runway Checklist

This is a hard gate (brief §9): if the employment agreement prohibits this activity, **stop** commercial development until resolved — independent of how strong the data or market findings are. Do this in parallel with the TAM/interview work, not after it.

## Self-review — walk your actual employment agreement against these

Go clause-by-clause and note the exact wording (paraphrasing hides ambiguity):

- [ ] **Moonlighting** — is any outside work restricted, or only work that competes/conflicts?
- [ ] **Non-compete** — during employment and post-employment: what's the defined scope (industry, customer type, geography), and does government-procurement data intelligence plausibly fall inside it?
- [ ] **IP assignment** — does it cover only work product created using employer time/resources/tools, or is there broader "anything you create while employed" language? (If broad: does it carve out unrelated personal projects?)
- [ ] **Outside business restrictions** — any clause specifically about starting or holding equity in an outside business, with or without employer consent?
- [ ] **"Any business" language** — watch for unusually broad phrasing (e.g., restricting *any* business activity, not just competing ones) — common in Israeli employment contracts and easy to skim past.
- [ ] **Competing business definition** — check how "competitor" or "competing business" is defined. Government procurement intelligence is a different field from most employers, but check if the employer's field is defined broadly enough to arguably include "any data/SaaS product" or "any B2B analytics tool."
- [ ] **Confidentiality carve-outs** — does anything in the confidentiality clause touch skills/knowledge generally applicable outside the specific employer (relevant if your day job involves data engineering or analytics — make sure the tender-intelligence approach isn't built using employer trade secrets/methods).

## Outcome of the self-review

- **Clearly permitted** (no moonlighting restriction, no applicable non-compete, IP assignment scoped to employer work only) → proceed, but keep records of when this project's work happened (own time, own equipment) in case it's ever questioned.
- **Ambiguous or restrictive language found** → do not proceed commercially. Get a paid consult with an Israeli employment lawyer — cheap relative to the risk, and the brief explicitly calls for this.

## Questions to bring to an Israeli employment lawyer (if needed)

Prepared so the consult is short and targeted rather than open-ended:

1. Does my employment agreement's non-compete/outside-business clause plausibly cover a government-procurement-data SaaS product, given my employer's actual field is [state it]?
2. Does the IP assignment clause extend to work done entirely on personal time/equipment, unrelated to my job duties?
3. If ambiguous, what disclosure posture do you recommend — proactive disclosure to the employer, or none required at this stage (e.g., before any revenue/customers)?
4. Is there a safe way to structure this (e.g., delaying formal incorporation, keeping it pre-revenue) while the ambiguity is unresolved?
5. Any Israel-specific case law or norms on "any business" clauses being read narrowly by courts vs. literally?

## Status

**Contract reviewed 2026-08-31** (SysAid Technologies Ltd., Product Manager, signed May 2022). Findings against the self-review questions above:

- **Non-compete (Exhibit A §4(b))** — scoped to businesses "similar to, or in competition with" SysAid's business, defined narrowly as ITSM/Service Desk/Help Desk software. Government-procurement tender intelligence is a different field — **low risk**, this clause likely doesn't reach this project.
- **Moonlighting (§1.3)** — broad and *not* limited to competing businesses: "the Employee may not be engaged, whether for consideration or for no consideration, in other businesses or other labor-consuming activities without the prior written notice to the Company." Requires *notice* (not consent). **Applies regardless of entity ownership** — it's about personal engagement/labor, not who's on the cap table. **Not yet satisfied.**
- **Conflict of interest (§4.7)** — explicitly extends to "an immediate family member" having "any direct or indirect personal interest" in a business that could conflict with SysAid's. **Directly relevant if the business is structured under a spouse** — the clause anticipates exactly that scenario and creates a disclosure duty, not an exemption. Given the field difference, likely a low-friction disclosure, but it hasn't happened.
- **IP assignment (Exhibit A §3(b))** — scoped to work related to SysAid's business, made using SysAid's equipment/resources, or arising from assigned tasks/duties. Does not appear to reach this project as currently planned (different field, own time/equipment) — **low risk**, contingent on staying that way.

**Net**: routing ownership through a spouse meaningfully de-risks the non-compete but does **not** resolve the moonlighting notice or the family-member conflict-of-interest disclosure — both trigger on personal involvement/relationship, not entity structure. A short written notice to SysAid is the likely low-friction path given the field difference, but it's an unmet obligation, not a non-issue. Still recommend a quick employment-lawyer sanity check on §1.3's exact enforceability before treating this as resolved, per the questions above.
