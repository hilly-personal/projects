# Data Sources to Acquire — Israeli Government Procurement

Compiled 2026-08-31 via live web research (search + fetch), not memory. Every URL below was found through search and, where marked ✅ Verified, confirmed reachable by fetching it directly. Where a source could not be verified, that's stated plainly rather than guessed.

**This supersedes the "two files" framing.** Those two files ARE identified below (§1) — they're the mr.gov.il monthly exports, not a one-off dataset. Some other sources here may turn out to already be folded into those exports; where that's uncertain, it's flagged.

**Important tooling note**: `mr.gov.il` is directly fetchable by me (WebFetch reached it fine). `data.gov.il` and `gov.il` are **not** — every path tried on those two domains returned 404/403 to my fetch tool, consistently, across dataset pages, API endpoints, and localized URLs. That's not proof they're unreachable by a browser (they clearly work for people — search engines index them, and they're linked from working pages), but it does mean **I cannot pull them myself and you'll need to download and hand them to me** for anything hosted there. For mr.gov.il items, I may actually be able to fetch those directly when we build — hand them over anyway for now so we're not blocked on that assumption.

---

## 1. Central tender/procurement portal (mr.gov.il) — ✅ Verified, HIGH PRIORITY

This is almost certainly the source of the two files already analyzed in a prior session.

- [ ] **דוח מכרזים (Tenders Report)** — ZIP containing Excel, all government tender engagements, updated monthly (current file dated 07.08.2026)
  `https://mr.gov.il/ilgstorefront/medias/Tenders-07082026.zip?context=bWFzdGVyfHJvb3R8MjM1OTk2MHxhcHBsaWNhdGlvbi96aXB8aGVlL2hmMi85NDAyNTQ0OTc5OTk4LnppcHw3YTJjZjU2ZDE0OGJiNmVhYWViMjczYjM2YTU3ZDViNDc4YTUwZjVmYzM2OGM3Nzc4NTc5MTFhMDI1ZjQ2ZDgy`
- [ ] **דוח פטורים (Exemptions Report)** — ZIP containing Excel, all government exemption-from-tender engagements, same monthly cadence
  `https://mr.gov.il/ilgstorefront/medias/Exemptions-07082026.zip?context=bWFzdGVyfHJvb3R8MjYwNzQ4Nzd8YXBwbGljYXRpb24vemlwfGhjZC9oN2EvOTQwMjU0NTA0NTUzNC56aXB8ZTQxMTViYjE5Y2Y3YmVkNWIwMDc1OGY1ZjEzZDU1YjhmNGZiYzFhMzVjMjgwNGUzODViY2FkOWUzMDIzOGE3MQ`
- **Note**: these URLs contain a dated filename (`-07082026`) and a signed `context` token. **This link will likely rot next month** when the file is regenerated — re-fetch it fresh from the source page each time rather than bookmarking the URL long-term: `https://mr.gov.il/ilgstorefront/he/news/details/230920201036`
- [ ] **Live dashboard system** (desktop only, not a bulk export, worth a look for filter/breakdown ideas): `https://www.mr.gov.il/hybrisbo`
- Format: Excel inside ZIP (prior session found the underlying file mislabeled `.xls` but actually SpreadsheetML XML with a falsified encoding declaration — expect the same again)
- Maps to: `Procurement`/`Tender`, `LifecycleEvent` (TENDER_PUBLISHED, NEW_AWARD, REPLACEMENT_SIGNAL), and the Exemptions file specifically to (AWARD, EXTENSION, OPTION, RENEWAL)
- Includes hospital buyers (Sheba, Wolfson, Assaf Harofeh already found in this data per the prior TAM pass) — **no separate hospital-sector source needed**, they procure through this central system.

## 2. data.gov.il datasets — 🔴 Blocked for me, need manual download

Found via search, could not fetch directly (domain returns 404 to my tool on every path tried — dataset pages, `/api/3/action/package_show`, localized `/he/` paths). Please download these manually:

- [ ] **Tenders dataset** — `https://data.gov.il/dataset/tenders` — likely mirrors §1's Tenders report; useful as a cross-check or if it has a different/wider field set. **Not verified beyond the URL existing in search results.**
- [ ] **Exemptions dataset** — `https://data.gov.il/dataset/exemptions` — same caveat, likely mirrors §1's Exemptions report.
- [ ] **Companies registry (מאגר חברות - רשם החברות)** — `https://data.gov.il/dataset/ica_companies` — bulk file of all registered companies: company number, canonical name, status, incorporation date, address. **This is the highest-value new source found** — it's exactly what `Supplier.company_number` / `canonical_name` / entity resolution needs, and nothing in §1 covers it.
- [ ] **List of government companies (רשימת החברות הממשלתיות)** — `https://data.gov.il/dataset/gsa` (also linked as `https://data.gov.il/he/datasets/mof/gsa/2d5abbad-4809-4900-b74f-b2f8b40bcfb8`) — useful for classifying `Buyer` type (is this buyer a government company vs. ministry vs. municipality).
- [ ] Search the catalog yourself for anything else relevant while you're in there (query terms to try: `תשלומים`, `רכש`, `התקשרויות`, `ספקים`) — I could only search from outside, you'll see the actual catalog UI.

**Gap found, not resolved**: I looked specifically for a general "payments to all government suppliers" dataset (to cross-validate actual incumbent/contract-value data, since the prior session found the Tenders file's winning-supplier field was nearly empty). I did not find one — only a narrower "payments to welfare frameworks" dataset (`data.gov.il/dataset/payments-to-welfare-frameworks`), which is a different, narrower thing. If this exists, it's likely also on data.gov.il under a name I didn't guess — worth a manual catalog search for `תשלומים לספקים` or `מוסר תשלומים` while you're there.

## 3. Company registry — direct site (redundant with §2, skip unless §2 fails)

- `https://ica.justice.gov.il/` — the registrar's own site. Free lookups are **per-company** (search by number/name), not bulk — not useful at our scale. The bulk file is §2's `ica_companies` dataset; only fall back to this if that download doesn't work.

## 4. Municipal-level procurement — 🟡 Confirmed fragmented, no official bulk source

Actively checked whether an aggregator exists. Conclusion: **no official unified dataset for municipal tenders was found.** What exists instead:

- `masham.org.il/bids` — מרכז השלטון המקומי (the local-government-affiliated procurement body) publishes its own **framework tenders** for municipalities to use — this is a real, usable source, but it's a curated framework-agreement list, not a full record of every municipality's individual procurement activity.
- Private aggregators (Wizbiz, GOVO, mashcal.co.il, rashuiot.co.il) scrape/republish municipal notices — these are **competitors identified in the viability review**, not a legitimate data source for us (re-scraping a competitor's aggregation is both fragile and a bad foundation to build a "we have better data" pitch on).
- **Net**: municipal-level lifecycle data (e.g., the Tel Aviv Municipality cleaning-contract example from the brief) is NOT centrally available — it would require per-municipality outreach or scraping each municipality's own tenders page individually. This is a real gap in the "infrastructure that can support several MVPs" thesis and should be named as such, not glossed over — don't download anything here yet, just know this bucket is thin.

## 5. Government-owned companies with their own procurement — 🟡 Live tender pages, no bulk export found

Each of these publishes tenders on its own site; none showed a bulk historical export in my search — likely relevant later, not for the cleaning/facilities MVP now (these are utility/infrastructure-heavy buyers, not the SME cleaning-contractor segment):

- [ ] Mekorot (water): `https://www.mekorot.co.il/מכרזים/`
- [ ] Israel Electric Corporation: `https://www.iec.co.il/content/suppliers/content-pages/tendersinfo`
- [ ] Airports Authority: `https://www.iaa.gov.il/en/tenders-and-contracts/tenders-archive/` (archive) and `/active-tenders/` (current)
- [ ] Israel Railways: `https://rail.co.il/?page=generalAuctions`
- [ ] Israel Post: `https://israelpost.co.il/` (has a tenders/recruitment section, exact sub-path not confirmed)
- [ ] Government supplier portal (Sigma) — general index, may link out to several of the above: `https://govextra.gov.il/sigma/suppliers/home/`

**Not for the MVP build** — flagging for completeness per your "everything we'll offer" ask, not recommending download yet.

## 6. Defense procurement — 🟡 Public listings exist, bulk export not found, likely more restricted

- `https://sapakim.mod.gov.il/procurementManager` — Ministry of Defense procurement (מנה"ר) supplier portal
- `https://www.online.mod.gov.il/Online2016/Pages/General/Balam/BalamList.aspx` — tender listing
- No bulk/export capability found for either. Defense procurement is also structurally the most likely to have genuine access restrictions (classification, security-sensitive contracts). **Low priority** — the cleaning/facilities MVP category is unlikely to lean on defense-sector contracts, and this is the one bucket where I'd actively deprioritize spending download effort.

## 7. Official gazette (Reshumot / ילקוט פרסומים) — 🟡 Likely redundant, one exception noted

- `nevo.co.il` and `olaw.org.il` both host PDF copies of ילקוט הפרסומים (the government gazette), which is where exemption-from-tender notices are formally published by law. This is very likely the same underlying legal-notice data that ends up in §1's Exemptions report — **not recommending you download gazette PDFs in bulk**, it's PDF-only and would need re-parsing what mr.gov.il already gives you structured.
- **One exception worth a manual check**: Israel Land Authority (רשות מקרקעי ישראל) publishes its **own** exemption-notice page separately: `https://land.gov.il/Land_Tenders/Pages/ptor.aspx`. Land-authority exemptions may or may not be folded into the central mr.gov.il Exemptions export — I could not confirm either way. If land/facility-lease contracts matter to the product later, worth a spot-check comparing a few ILA notices against the mr.gov.il file to see if they're already there.

## 8. Hospitals — no separate source needed

Confirmed: government hospitals (Sheba, Wolfson, Assaf Harofeh, etc.) procure through the central mr.gov.il system — they already showed up as buyers in the prior session's analysis of the Exemptions file. §1 covers this bucket; no additional source required.

---

## Prioritized shortlist — get these first for the cleaning/facilities MVP

1. **§1 — mr.gov.il Tenders + Exemptions ZIPs** (re-download fresh even if you have the old ones — this month's files, dated 07.08.2026, are newer than whatever was analyzed before)
2. **§2 — Companies registry (`ica_companies`)** — this is the single highest-value *new* addition: it's what turns fuzzy supplier-name matching into real entity resolution via company number, which the prior session flagged as a hard, unsolved problem (spelling variants across records).
3. **§2 — Government companies list (`gsa`)** — small file, cheap to grab, helps classify buyer types correctly from day one.
4. **§2 — manual catalog search on data.gov.il** for any general supplier-payments dataset (the gap noted above) — 10 minutes of poking around the catalog UI could close a real hole in the data model.

Everything in §4–§7 is genuinely lower priority or a confirmed gap (not just deprioritized) — don't spend download time there yet; §5–§6 in particular are "nice to have for later category expansion," not needed for the cleaning/facilities-in-government-ministries MVP this data model is being built for right now.
