#!/usr/bin/env python3
"""
Loads every category-scoped company dataset into the Supabase `companies` table via the
REST API, using the service_role key (bypasses RLS — that's expected, this is the only
writer). Run this LOCALLY, never share the service_role key in chat or commit it anywhere.

Usage:
    export SUPABASE_URL="https://<your-project-ref>.supabase.co"
    export SUPABASE_SERVICE_KEY="<service_role key from Project Settings > API>"
    python3 webapp/scripts/load_data.py

Run supabase/schema.sql in the SQL editor first — this script only loads rows, it doesn't
create the table. The table's primary key is (id, category), so each domain's dataset file
adds its own rows without touching other domains' data — safe to re-run per-domain as new
domains are validated and added (see the multi-domain expansion plan).
"""
import json
import os
import sys
import urllib.request
import urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")
BATCH_SIZE = 20

# Explicit whitelist, NOT a glob over data/processed/companies_*.json — a rejected/shelved
# domain's file (e.g. companies_facilities.json, kept only as a research artifact after being
# found not viable) sits in that same directory and must never get silently loaded just because
# it matches the filename pattern. Keep this in sync with
# src/pipeline/refresh_all.py's VALIDATED_CATEGORIES.
VALIDATED_CATEGORIES = ["cleaning", "security", "catering", "gardening", "laundry", "transport", "parking"]
SOURCES = [
    os.path.join(ROOT, "app", "companies.json") if cat == "cleaning"
    else os.path.join(ROOT, "data", "processed", f"companies_{cat}.json")
    for cat in VALIDATED_CATEGORIES
]

COLUMNS = [
    "id", "category", "names", "buyers", "records", "record_count", "full_count",
    "year_min", "year_max", "is_active", "latest_end_obj", "days_to_end",
    "latest_buyer", "latest_amount", "latest_mechanism", "latest_proc_id",
    "gap_flag", "short_ext_flag", "short_ext_buyer", "option_count",
    "continuation_count", "final_option_flag",
]


def load_rows(path):
    with open(path, "r", encoding="utf-8") as f:
        companies = json.load(f)
    rows = [{col: c.get(col) for col in COLUMNS} for c in companies]
    missing_category = [r["id"] for r in rows if not r.get("category")]
    if missing_category:
        raise SystemExit(
            f"{path}: {len(missing_category)} rows have no 'category' field — "
            "regenerate with the current src/lifecycle/gen_company_dataset.py."
        )
    return rows


def post_batch(url, service_key, batch):
    endpoint = f"{url.rstrip('/')}/rest/v1/companies"
    body = json.dumps(batch).encode("utf-8")
    req = urllib.request.Request(endpoint, data=body, method="POST")
    req.add_header("apikey", service_key)
    req.add_header("Authorization", f"Bearer {service_key}")
    req.add_header("Content-Type", "application/json")
    # upsert on the (id, category) primary key so re-running this script is safe
    req.add_header("Prefer", "resolution=merge-duplicates,return=minimal")
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        raise SystemExit(f"Batch failed ({e.code}): {detail}")


def main():
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        sys.exit(
            "Set SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables first "
            "(see the docstring at the top of this file)."
        )

    for path in SOURCES:
        rows = load_rows(path)
        print(f"Loaded {len(rows)} rows from {path}")
        for i in range(0, len(rows), BATCH_SIZE):
            batch = rows[i:i + BATCH_SIZE]
            status = post_batch(url, key, batch)
            print(f"  batch {i // BATCH_SIZE + 1}: rows {i}-{i + len(batch) - 1} -> HTTP {status}")

    print("Done. Verify in the SQL editor with: select category, count(*) from public.companies group by category;")


if __name__ == "__main__":
    main()
