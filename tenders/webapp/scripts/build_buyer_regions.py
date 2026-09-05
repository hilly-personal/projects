#!/usr/bin/env python3
"""
Exports app/regions.py's REGIONS dict to webapp/buyer_regions.json for loading into the
buyer_regions Supabase table (see supabase/schema.sql).

This table exists so the onboarding location filter can work WITHOUT ever exposing buyer
names to anonymous visitors: companies_teaser computes a company's district scope by joining
its (locked, anon-invisible) buyers against this table server-side, and only the resulting
district/national classification — not the buyer names themselves — appears in the teaser
output. Region coverage was verified at 100% across all 6 validated domains' combined buyer
set (66 buyers) before this was considered safe to build on.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")
sys.path.insert(0, os.path.join(ROOT, "app"))

from regions import REGIONS

OUT = os.path.join(HERE, "..", "buyer_regions.json")


def main():
    rows = []
    for buyer, info in REGIONS.items():
        rows.append({
            "buyer": buyer,
            "region": info.get("region"),
            "is_national": bool(info.get("national", False)),
        })
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False)
    print(f"Wrote {len(rows)} buyer region mappings to {OUT}")


if __name__ == "__main__":
    main()
