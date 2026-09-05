#!/usr/bin/env python3
"""
Loads webapp/buyer_regions.json into the Supabase buyer_regions table. Run once after
supabase/add_regions.sql, and again whenever app/regions.py changes.

Usage:
    export SUPABASE_URL="..."
    export SUPABASE_SERVICE_KEY="..."
    python3 webapp/scripts/load_buyer_regions.py
"""
import json
import os
import sys
import urllib.request
import urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
PATH = os.path.join(HERE, "..", "buyer_regions.json")


def main():
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        sys.exit("Set SUPABASE_URL and SUPABASE_SERVICE_KEY first.")

    with open(PATH, "r", encoding="utf-8") as f:
        rows = json.load(f)

    endpoint = f"{url.rstrip('/')}/rest/v1/buyer_regions"
    req = urllib.request.Request(endpoint, data=json.dumps(rows).encode("utf-8"), method="POST")
    req.add_header("apikey", key)
    req.add_header("Authorization", f"Bearer {key}")
    req.add_header("Content-Type", "application/json")
    req.add_header("Prefer", "resolution=merge-duplicates,return=minimal")
    try:
        with urllib.request.urlopen(req) as resp:
            print(f"Loaded {len(rows)} buyer regions -> HTTP {resp.status}")
    except urllib.error.HTTPError as e:
        raise SystemExit(f"Failed ({e.code}): {e.read().decode('utf-8', errors='replace')}")


if __name__ == "__main__":
    main()
