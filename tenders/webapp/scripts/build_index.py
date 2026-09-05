#!/usr/bin/env python3
"""
Regenerates webapp/name_index.json from app/companies.json — a small, safe
search index (company id + names + is_active + expiring_soon only) that ships
in the static site for client-side fuzzy search and empty-state example chips.

Deliberately excludes everything gated: buyers, records, latest_*, exact
days_to_end, option/continuation counts, short_ext_buyer. A company's own
name isn't the sensitive part of this product — its buyer relationships,
contract dates, and amounts are — so this file is safe to ship to anyone,
same as the companies_teaser view is safe to query anonymously.

Run this whenever app/companies.json changes:
    python3 webapp/scripts/build_index.py
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
COMPANIES_JSON = os.path.join(HERE, "..", "..", "app", "companies.json")
OUT = os.path.join(HERE, "..", "name_index.json")


def main():
    with open(COMPANIES_JSON, "r", encoding="utf-8") as f:
        companies = json.load(f)

    index = [
        {
            "id": c["id"],
            "names": c["names"],
            "is_active": c["is_active"],
            "expiring_soon": c.get("days_to_end") is not None and c["days_to_end"] <= 150,
        }
        for c in companies
    ]

    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False)

    print(f"Wrote {len(index)} entries to {OUT}")


if __name__ == "__main__":
    main()
