"""
Scrapes mr.gov.il's real, live, public tender search — genuinely open-for-submission tenders,
NOT the historical bulk export (data/raw/tenders_raw.xls), which was confirmed stale (sampled
rows show 2019 publish dates still carrying a "published" status years later — see the
open-tender-sourcing plan for the investigation). This is a different, separate live system:

    https://mr.gov.il/ilgstorefront/he/search/?q=:updateDate:archive:false&s=TENDER&page=N

Server-rendered HTML, no JS/browser automation needed (verified with plain requests). Each
listing row shows title, buyer, publication number, and a status ("פורסם" / "חלף מועד הגשה" —
published / submission deadline passed) directly — no need to visit every detail page just to
know if something's closed. Detail pages (/ilgstorefront/he/p/<publication_number>) additionally
carry the real submission window (מועד תחילת ההגשה / מועד אחרון להגשה).

Delta behavior: the listing itself is cheap and always fully paginated (up to MAX_PAGES, a
politeness/safety bound — sort order isn't reliably recency-based, so we can't assume "stop once
a page is all-known" the way a recency-sorted feed would allow). The real savings this scraper
implements is on the EXPENSIVE part: detail-page fetches are skipped entirely for any
publication_number already known to us — whether previously closed, or already carrying a
correct submit_end date from a prior run. Only genuinely new, domain-relevant, still-open
tenders get a detail-page fetch.

Usage:
    export SUPABASE_URL=... SUPABASE_SERVICE_KEY=...
    python3 src/ingestion/scrape_open_tenders.py
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
import urllib.request
import urllib.error
from datetime import date, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "classification"))
from category_classifier import classify_category  # noqa: E402 (reused, not reinvented)

BASE = "https://mr.gov.il/ilgstorefront/he/search/"
SEARCH_PARAMS = "?q=%3AupdateDate%3Aarchive%3Afalse&text=&s=TENDER"
MAX_PAGES = 60  # politeness/safety bound — see module docstring; ~20 results/page
REQUEST_DELAY_SECONDS = 0.4
VALIDATED_CATEGORIES = {"cleaning", "security", "catering", "gardening", "laundry", "transport"}

HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; TenderIntelligenceBot/1.0; research use)"}

# The listing page's per-item fields appear in VARIABLE order with VARIABLE presence (e.g. the
# submission deadline sometimes appears inline on the listing, sometimes only on the detail
# page) — an earlier version of this parser used one sequential regex spanning title -> buyer ->
# status -> pubdate and silently matched only 7 of 20 real items on a test page (fields after a
# missing/reordered one broke the sequential match). Fixed by splitting into individual
# result-container blocks first, then applying small, independent per-field regexes within each
# block — each field is found-or-None on its own, not dependent on the others' presence/order.
RESULT_BLOCK_RE = re.compile(r'class="result-container">(.*?)</div>\s*</div>\s*</div>\s*<div class="logo-container', re.S)
FIELD_RES = {
    "publication_number": re.compile(r'href="/ilgstorefront/he/p/(\d+)"'),
    "title": re.compile(r'<h2 class="search-results-content-head">([^<]*)</h2>'),
    "buyer": re.compile(r'שם המפרסם:&nbsp;</span><span\s+class="font-weight-normal">([^<]*)</span>'),
    "status": re.compile(r'סטטוס:&nbsp;</span><span\s+class="status\s*font-weight-normal">([^<]*)</span>'),
    "publish_date": re.compile(r'תאריך פרסום:&nbsp;</span><span\s+class="font-weight-normal number">([^<]*)</span>'),
    "listing_submit_end": re.compile(r'מועד אחרון להגשה:&nbsp;</span><span\s+class="[^"]*">([^<]*)</span>'),
}
DETAIL_DATE_RE = {
    "submit_start": re.compile(r'id="firstSubmittingDate">([^<]*)</span>'),
    "submit_end": re.compile(r'id="lastDate">([^<]*)</span>'),
}


def fetch(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", errors="replace")


DATE_RE = re.compile(r'(\d{2}/\d{2}/\d{4})')


def parse_date(s):
    """Site shows dates as DD/MM/YYYY, sometimes with a trailing time separated by a comma
    ("03/09/2026 ,12:00") and sometimes by just a space ("18/10/2026 13:00") — extract the
    date portion with a regex rather than splitting on a specific separator that isn't
    consistent across the site's own templates."""
    if not s:
        return None
    m = DATE_RE.search(s)
    if not m:
        return None
    try:
        return datetime.strptime(m.group(1), "%d/%m/%Y").date().isoformat()
    except ValueError:
        return None


def parse_listing_page(html):
    items = []
    for block_m in RESULT_BLOCK_RE.finditer(html):
        block = block_m.group(1)
        fields = {}
        for name, pattern in FIELD_RES.items():
            m = pattern.search(block)
            fields[name] = m.group(1).strip() if m else None
        if not fields["publication_number"]:
            continue
        items.append({
            "publication_number": fields["publication_number"],
            "title": (fields["title"] or "").strip(),
            "buyer": (fields["buyer"] or "").strip(),
            "status": (fields["status"] or "").strip(),
            "publish_date": parse_date(fields["publish_date"]),
            "listing_submit_end": parse_date(fields["listing_submit_end"]),
        })
    return items


def parse_detail_page(html):
    out = {}
    for field, pattern in DETAIL_DATE_RE.items():
        m = pattern.search(html)
        out[field] = parse_date(m.group(1)) if m else None
    return out


def classify_title(title):
    # category_classifier.classify_category takes (title, subjects) — this corpus has no
    # subjects field, so facilities/technical-maintenance (which need it) never match here;
    # that's fine, this scraper only cares about the 6 title-keyword-based domains anyway.
    return classify_category(title, None)


def sb_request(url, key, method, path, body=None, extra_headers=None):
    endpoint = f"{url.rstrip('/')}/rest/v1/{path}"
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(endpoint, data=data, method=method)
    req.add_header("apikey", key)
    req.add_header("Authorization", f"Bearer {key}")
    req.add_header("Content-Type", "application/json")
    for k, v in (extra_headers or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raise SystemExit(f"Supabase {method} {path} failed ({e.code}): {e.read().decode('utf-8', errors='replace')}")


def load_known_publication_numbers(url, key):
    rows = sb_request(url, key, "GET", "open_tenders?select=publication_number,submit_end") or []
    return {r["publication_number"]: r["submit_end"] for r in rows}


def main():
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_KEY"]
    known = load_known_publication_numbers(url, key)
    print(f"{len(known)} tenders already known")

    today = date.today().isoformat()
    new_rows = []
    seen_this_run = set()
    skipped_known = 0
    skipped_offdomain = 0

    for page in range(MAX_PAGES):
        html = fetch(f"{BASE}{SEARCH_PARAMS}&page={page}")
        items = parse_listing_page(html)
        if not items:
            print(f"page {page}: no results, stopping")
            break

        for item in items:
            pub = item["publication_number"]
            seen_this_run.add(pub)

            category = classify_title(item["title"])
            if category not in VALIDATED_CATEGORIES:
                skipped_offdomain += 1
                continue

            if pub in known:
                skipped_known += 1
                continue  # already known — the actual delta savings: no detail-page fetch

            # The listing's status label is inconsistently rendered — plenty of genuinely open,
            # recent tenders show no status at all (confirmed by inspecting raw HTML, not a
            # regex miss). Relying on status == "פורסם" as the primary gate silently drops real
            # open tenders that just don't happen to carry that label. Status is only used here
            # as a cheap, explicit "definitely closed" shortcut; the real source of truth is the
            # submit_end date compared to today.
            if item["status"] == "חלף מועד הגשה":
                continue  # explicitly closed and never seen before — not worth storing

            # the listing sometimes already carries the deadline — only pay for a detail-page
            # fetch when it doesn't (further reduces request volume beyond the known-tender skip)
            if item["listing_submit_end"]:
                submit_start, submit_end = item["publish_date"], item["listing_submit_end"]
            else:
                time.sleep(REQUEST_DELAY_SECONDS)
                detail_html = fetch(f"https://mr.gov.il/ilgstorefront/he/p/{pub}")
                dates = parse_detail_page(detail_html)
                submit_start, submit_end = dates["submit_start"], dates["submit_end"]

            if submit_end and submit_end < today:
                continue  # date-verified closed, never seen before — not worth storing

            new_rows.append({
                "publication_number": pub,
                "category": category,
                "title": item["title"],
                "buyer": item["buyer"],
                "publish_date": item["publish_date"],
                "submit_start": submit_start,
                "submit_end": submit_end,
                "detail_url": f"https://mr.gov.il/ilgstorefront/he/p/{pub}",
                "first_seen": today,
                "last_checked": today,
            })

        time.sleep(REQUEST_DELAY_SECONDS)

    if new_rows:
        sb_request(url, key, "POST", "open_tenders", new_rows, {"Prefer": "resolution=merge-duplicates,return=minimal"})

    print(f"Scanned {len(seen_this_run)} listings across up to {MAX_PAGES} pages")
    print(f"Skipped {skipped_known} already-known, {skipped_offdomain} off-domain")
    print(f"Inserted {len(new_rows)} new open tenders")


if __name__ == "__main__":
    main()
