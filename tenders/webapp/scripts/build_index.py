#!/usr/bin/env python3
"""
Regenerates webapp/name_index.json — a small, safe, MULTI-DOMAIN search index (company id +
names + category + is_active + expiring_soon only) covering every validated domain, not just
cleaning. The onboarding domain selector needs search/example-chips to work for whichever
domain a visitor picks, so this indexes all 6 validated categories in one small file
(companies are cheap to list, ~561 total across all domains) rather than refetching per domain.

Deliberately excludes everything gated: buyers, records, latest_*, exact days_to_end,
option/continuation counts, short_ext_buyer. A company's own name isn't the sensitive part of
this product — its buyer relationships, contract dates, and amounts are — so this file is safe
to ship to anyone, same as the companies_teaser view is safe to query anonymously.

Run this whenever any category-scoped company dataset changes:
    python3 webapp/scripts/build_index.py
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")
OUT = os.path.join(HERE, "..", "name_index.json")

# keep in sync with src/pipeline/refresh_all.py's VALIDATED_CATEGORIES
VALIDATED_CATEGORIES = ["cleaning", "security", "catering", "gardening", "laundry", "transport"]


def main():
    index = []
    for category in VALIDATED_CATEGORIES:
        path = (
            os.path.join(ROOT, "app", "companies.json") if category == "cleaning"
            else os.path.join(ROOT, "data", "processed", f"companies_{category}.json")
        )
        with open(path, "r", encoding="utf-8") as f:
            companies = json.load(f)
        for c in companies:
            index.append({
                "id": c["id"],
                "category": category,
                "names": c["names"],
                "is_active": c["is_active"],
                "expiring_soon": c.get("days_to_end") is not None and c["days_to_end"] <= 150,
            })

    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False)

    print(f"Wrote {len(index)} entries across {len(VALIDATED_CATEGORIES)} domains to {OUT}")


if __name__ == "__main__":
    main()
