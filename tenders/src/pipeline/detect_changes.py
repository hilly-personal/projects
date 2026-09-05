"""
Compares a freshly generated category dataset against the last snapshot stored in Supabase's
company_snapshots table, writes any detected differences as company_snapshots + change_events
rows. This is the piece that turns "we re-pull data weekly" into an actual monitoring product —
see design_specs_changelog_and_region.md's change-log spec, which this implements.

First run for any given (id, category) has nothing to diff against — that's a first observation,
not a change, and produces no change_events row (matches the design spec's "observed once,
nothing to compare yet" state).

Usage:
    export SUPABASE_URL=... SUPABASE_SERVICE_KEY=...
    python3 src/pipeline/detect_changes.py cleaning app/companies.json
"""
from __future__ import annotations

import json
import os
import sys
import urllib.request
import urllib.error
from datetime import date

TRACKED_FIELDS = ["is_active", "gap_flag", "short_ext_flag", "final_option_flag", "latest_end_obj", "full_count"]


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


def fetch_latest_snapshots(url, key, category):
    rows = sb_request(url, key, "GET", f"company_snapshots?category=eq.{category}&order=snapshot_date.desc") or []
    latest = {}
    for r in rows:
        if r["id"] not in latest:  # first occurrence per id, since sorted desc
            latest[r["id"]] = r
    return latest


def describe_changes(prev, curr):
    """Returns a list of (type, description) tuples for whatever differs between two snapshots."""
    events = []
    if not prev["is_active"] and curr["is_active"]:
        events.append(("stage_change", "החוזה עבר למצב פעיל"))
    elif prev["is_active"] and not curr["is_active"]:
        events.append(("stage_change", "החוזה כבר אינו מסומן כפעיל"))

    if not prev["gap_flag"] and curr["gap_flag"]:
        events.append(("gap_opened", "אין רישום המשך פומבי — נפתח חלון פקיעה"))
    elif prev["gap_flag"] and not curr["gap_flag"]:
        events.append(("gap_closed", "נמצא רישום המשך — חלון הפקיעה נסגר"))

    if not prev["final_option_flag"] and curr["final_option_flag"]:
        events.append(("new_signal", "אופציה סומנה במפורש כ\"אחרונה\""))

    if not prev["short_ext_flag"] and curr["short_ext_flag"]:
        events.append(("new_signal", "זוהתה הארכה קצרה משמעותית מהקודמת"))

    if curr["full_count"] > prev["full_count"]:
        events.append(("new_signal", f"נמצאו {curr['full_count'] - prev['full_count']} רישומים פומביים חדשים"))

    if prev["latest_end_obj"] != curr["latest_end_obj"]:
        events.append(("record_updated", "תאריך סיום ההתקשרות האחרונה התעדכן"))

    return events


def main():
    category = sys.argv[1]
    dataset_path = sys.argv[2]
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_KEY"]
    today = date.today().isoformat()

    with open(dataset_path, "r", encoding="utf-8") as f:
        companies = json.load(f)

    prior = fetch_latest_snapshots(url, key, category)

    new_snapshots = []
    new_events = []
    first_observations = 0
    for c in companies:
        curr = {f: c.get(f) for f in TRACKED_FIELDS}
        prev = prior.get(c["id"])
        if prev is None:
            first_observations += 1
        else:
            for etype, desc in describe_changes(prev, curr):
                new_events.append({
                    "company_id": c["id"], "category": category, "event_date": today,
                    "type": etype, "description": desc,
                    "source_proc_id": c.get("latest_proc_id"),
                })
        new_snapshots.append({"id": c["id"], "category": category, "snapshot_date": today, **curr})

    if new_snapshots:
        sb_request(url, key, "POST", "company_snapshots", new_snapshots,
                   {"Prefer": "resolution=merge-duplicates,return=minimal"})
    if new_events:
        sb_request(url, key, "POST", "change_events", new_events, {"Prefer": "return=minimal"})

    print(f"{category}: {first_observations} first observations, {len(new_events)} change events detected")


if __name__ == "__main__":
    main()
