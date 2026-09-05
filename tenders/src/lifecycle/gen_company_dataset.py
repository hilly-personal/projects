"""Builds the per-supplier company dataset (the shape consumed by app/companies.json and
webapp/app.js) for a given classified category from data/processed/exemptions_classified.parquet.

This generalizes the logic originally used to build the cleaning dataset (app/companies.json)
so the same pipeline — and the same bug fixes already found while validating it — applies to
any category the classifier in src/classification/category_classifier.py produces, starting
with 'facilities'.

Known bug classes fixed here (found and fixed for 'cleaning' earlier in this project; applied
from the start here rather than rediscovered):
- "Latest" record selection must prefer the soonest-expiring currently-active record, or (if
  none active) the most-recent-past-end-date record — NOT the most-recently-*published* record,
  which can pick an unrelated concurrent engagement for suppliers with multiple buyers.
- short_ext_flag / short_ext_buyer / final_option_flag must be scoped to records sharing the
  SAME buyer as the "latest" engagement being described — computing them across a supplier's
  entire cross-buyer history produces evidence that doesn't match the engagement it's cited
  against.
- A record whose title describes a DIFFERENT company winning (contains "אשר זכה") is dropped —
  it is not evidence about the row's own listed supplier.

Usage:
    python3 src/lifecycle/gen_company_dataset.py facilities data/processed/companies_facilities.json
"""
from __future__ import annotations

import json
import sys
from datetime import date, datetime

import pandas as pd

OPTION_MARKERS = ["זכות ברירה", "אופציה"]
CONTINUATION_MARKERS = ["התקשרות המשך"]
FINAL_MARKER = "אחרונה"
INTERMEDIARY_EXCLUSION = "אשר זכה"  # title describes a different company's win, not this row's supplier
MAX_RECORDS_STORED = 20  # earliest + most recent 19, matching the cleaning dataset's cap
SHORT_EXT_RATIO = 0.5  # last extension flagged "short" if < 50% of the one before it, same buyer


def parse_date(s):
    if not s:
        return None
    try:
        return datetime.strptime(s, "%d.%m.%Y").date()
    except (ValueError, TypeError):
        return None


def iso(d):
    return d.isoformat() if d else None


def build(df: pd.DataFrame, category: str, today: date) -> list[dict]:
    cat = df[df["category"] == category].copy()
    cat = cat[cat["שם הליך"].fillna("").apply(lambda t: INTERMEDIARY_EXCLUSION not in t)]
    cat = cat.dropna(subset=["מספר חפ ספק"])

    cat["pub_date"] = cat["תאריך פרסום"].apply(parse_date)
    cat["start_date"] = cat["תאריך תחילת תקופת התקשרות"].apply(parse_date)
    cat["end_date"] = cat["תאריך סיום תקופת התקשרות"].apply(parse_date)
    cat = cat.dropna(subset=["pub_date"])
    cat = cat.sort_values("pub_date")

    companies = []
    for supplier_id, grp in cat.groupby("מספר חפ ספק"):
        grp = grp.sort_values("pub_date")
        names = [n for n in grp["שם ספק"].dropna().unique().tolist()]
        buyers = sorted(grp["שם המשרד"].dropna().unique().tolist())
        if not names or not buyers:
            continue

        all_records = []
        for _, r in grp.iterrows():
            all_records.append({
                "proc_id": str(r["מספר פרסום"]) if pd.notna(r["מספר פרסום"]) else None,
                "buyer": r["שם המשרד"] if pd.notna(r["שם המשרד"]) else None,
                "title": r["שם הליך"] if pd.notna(r["שם הליך"]) else None,
                "mechanism": r["תקנה"] if pd.notna(r["תקנה"]) else None,
                "pub_date_obj": iso(r["pub_date"]),
                "start_obj": iso(r["start_date"]),
                "end_obj": iso(r["end_date"]),
                # source data carries trailing whitespace on this field ("12744.00 ") — strip
                # it, or the SQL view's anchored numeric regex (amount_raw ~ '^[0-9...]+$')
                # silently rejects every single value and the magic-quadrant chart goes empty.
                "amount": str(r["היקף כספי"]).strip() if pd.notna(r["היקף כספי"]) else None,
                "_start": r["start_date"], "_end": r["end_date"],
            })

        full_count = len(all_records)
        years = [datetime.fromisoformat(r["pub_date_obj"]).year for r in all_records if r["pub_date_obj"]]
        year_min, year_max = (min(years), max(years)) if years else (None, None)

        # cap stored records: earliest + most recent (MAX_RECORDS_STORED - 1)
        if full_count > MAX_RECORDS_STORED:
            stored = [all_records[0]] + all_records[-(MAX_RECORDS_STORED - 1):]
        else:
            stored = all_records

        # "latest" engagement: soonest-expiring currently-active record, else most-recent-past-end
        active_candidates = [r for r in all_records if r["_start"] and r["_end"] and r["_start"] <= today <= r["_end"]]
        past_candidates = [r for r in all_records if r["_end"] and r["_end"] < today]
        if active_candidates:
            latest = min(active_candidates, key=lambda r: r["_end"])
            is_active = True
        elif past_candidates:
            latest = max(past_candidates, key=lambda r: r["_end"])
            is_active = False
        else:
            latest = all_records[-1]
            is_active = False

        days_to_end = (latest["_end"] - today).days if is_active and latest["_end"] else None
        gap_flag = (not is_active) and bool(past_candidates)

        latest_buyer = latest["buyer"]

        # buyer-scoped signals: only records sharing the SAME buyer as the "latest" engagement
        same_buyer_records = [r for r in all_records if r["buyer"] == latest_buyer]

        short_ext_flag = False
        short_ext_buyer = None
        durations = [
            (r["_start"], (r["_end"] - r["_start"]).days)
            for r in same_buyer_records if r["_start"] and r["_end"]
        ]
        durations.sort(key=lambda t: t[0])
        if len(durations) >= 2:
            prev_dur, last_dur = durations[-2][1], durations[-1][1]
            if prev_dur > 0 and last_dur < prev_dur * SHORT_EXT_RATIO:
                short_ext_flag = True
                short_ext_buyer = latest_buyer

        final_option_flag = any(
            FINAL_MARKER in f"{r['mechanism'] or ''} {r['title'] or ''}"
            and any(m in f"{r['mechanism'] or ''} {r['title'] or ''}" for m in OPTION_MARKERS)
            for r in same_buyer_records
        )

        # company-wide (not buyer-scoped) pattern counts, matching the narrative's own wording
        option_count = sum(
            1 for r in all_records
            if any(m in f"{r['mechanism'] or ''} {r['title'] or ''}" for m in OPTION_MARKERS)
        )
        continuation_count = sum(
            1 for r in all_records
            if any(m in (r["mechanism"] or "") for m in CONTINUATION_MARKERS)
        )

        def strip(r):
            return {k: v for k, v in r.items() if not k.startswith("_")}

        companies.append({
            "id": str(supplier_id),
            "category": category,
            "names": names,
            "buyers": buyers,
            "records": [strip(r) for r in stored],
            "record_count": len(stored),
            "full_count": full_count,
            "year_min": year_min,
            "year_max": year_max,
            "is_active": is_active,
            "latest_end_obj": iso(latest["_end"]),
            "days_to_end": days_to_end,
            "latest_buyer": latest_buyer,
            "latest_amount": latest["amount"],
            "latest_mechanism": latest["mechanism"],
            "latest_proc_id": latest["proc_id"],
            "gap_flag": gap_flag,
            "short_ext_flag": short_ext_flag,
            "short_ext_buyer": short_ext_buyer,
            "option_count": option_count,
            "continuation_count": continuation_count,
            "final_option_flag": final_option_flag,
        })

    return companies


def main():
    category = sys.argv[1] if len(sys.argv) > 1 else "facilities"
    out_path = sys.argv[2] if len(sys.argv) > 2 else f"data/processed/companies_{category}.json"
    today = date.today()

    df = pd.read_parquet("data/processed/exemptions_classified.parquet")
    companies = build(df, category, today)

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(companies, f, ensure_ascii=False)

    print(f"category={category}: {len(companies)} companies -> {out_path}")
    print(f"  is_active: {sum(c['is_active'] for c in companies)}")
    print(f"  gap_flag: {sum(c['gap_flag'] for c in companies)}")
    print(f"  short_ext_flag: {sum(c['short_ext_flag'] for c in companies)}")
    print(f"  final_option_flag: {sum(c['final_option_flag'] for c in companies)}")


if __name__ == "__main__":
    main()
