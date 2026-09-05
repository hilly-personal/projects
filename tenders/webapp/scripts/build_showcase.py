#!/usr/bin/env python3
"""
Generates webapp/showcase.json — 1-3 "see the full value" example reports that are always
shown unlocked, even to anonymous visitors, so a first-time visitor can see exactly what
signup unlocks before deciding to sign up.

These are anonymized composites, not real company exposure: each one starts from a real
company's record pattern (real dates, real amounts, real mechanism text, real signal flags —
that's the point, it has to look like genuine output, not a mockup) but the company name and
every buyer name are replaced with clearly-labeled demo text. This sidesteps the exact problem
webapp/supabase/schema.sql exists to prevent — showing a real company's buyer relationships and
timeline to an anonymous visitor — while still letting the product demonstrate real depth.

Run whenever app/companies.json changes and you want to refresh the showcase set:
    python3 webapp/scripts/build_showcase.py
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
COMPANIES_JSON = os.path.join(HERE, "..", "..", "app", "companies.json")
OUT = os.path.join(HERE, "..", "showcase.json")

# real company ids chosen for illustrative signal diversity (see build_showcase.py's
# selection run: final_option_flag+active, gap_flag, short_ext_flag+expiring — the three
# "high" urgency badge types the product highlights), each mapped to a demo label + a
# consistent set of fake buyer names (same buyer -> same fake name, so the anonymized
# timeline still reads coherently).
SOURCES = [
    {
        # gap_flag, richest example (full_count=54, 15 buyers) after the title-only classifier fix
        "real_id": "511412041",
        "demo_id": "DEMO-1",
        "demo_name": "חברה לדוגמה — אלפא בע\"מ",
        "buyer_map_prefix": "גורם מזמין לדוגמה",
    },
    {
        # short_ext_flag, richest example (full_count=14, 8 buyers) after the classifier fix
        "real_id": "513283838",
        "demo_id": "DEMO-2",
        "demo_name": "חברה לדוגמה — בטא בע\"מ",
        "buyer_map_prefix": "גורם מזמין לדוגמה",
    },
    {
        # approaching-end (medium), active — same company as before, still illustrative after
        # the fix even though its final_option_flag no longer applies post-correction
        "real_id": "512370693",
        "demo_id": "DEMO-3",
        "demo_name": "חברה לדוגמה — גמא בע\"מ",
        "buyer_map_prefix": "גורם מזמין לדוגמה",
    },
]


def anonymize(c, spec):
    buyer_map = {}
    def fake_buyer(real):
        if real not in buyer_map:
            buyer_map[real] = f"{spec['buyer_map_prefix']} {len(buyer_map) + 1}"
        return buyer_map[real]

    records = []
    for r in c["records"]:
        records.append({
            "proc_id": f"DEMO-{len(records)+1}",
            "buyer": fake_buyer(r["buyer"]) if r.get("buyer") else None,
            "title": "שירותים (כותרת לדוגמה, מבוססת על רישום אמיתי)",
            "mechanism": r.get("mechanism"),
            "pub_date_obj": r.get("pub_date_obj"),
            "start_obj": r.get("start_obj"),
            "end_obj": r.get("end_obj"),
            "amount": r.get("amount"),
        })

    return {
        "id": spec["demo_id"],
        "names": [spec["demo_name"]],
        "buyers": [fake_buyer(b) for b in c["buyers"]],
        "records": records,
        "record_count": c["record_count"],
        "full_count": c["full_count"],
        "year_min": c["year_min"],
        "year_max": c["year_max"],
        "is_active": c["is_active"],
        "latest_end_obj": c["latest_end_obj"],
        "days_to_end": c["days_to_end"],
        "latest_buyer": fake_buyer(c["latest_buyer"]) if c.get("latest_buyer") else None,
        "latest_amount": c["latest_amount"],
        "latest_mechanism": c["latest_mechanism"],
        "latest_proc_id": "DEMO-latest",
        "gap_flag": c["gap_flag"],
        "short_ext_flag": c["short_ext_flag"],
        "short_ext_buyer": fake_buyer(c["short_ext_buyer"]) if c.get("short_ext_buyer") else None,
        "option_count": c["option_count"],
        "continuation_count": c["continuation_count"],
        "final_option_flag": c["final_option_flag"],
        "is_showcase": True,
    }


def main():
    with open(COMPANIES_JSON, "r", encoding="utf-8") as f:
        companies = {c["id"]: c for c in json.load(f)}

    showcase = []
    for spec in SOURCES:
        c = companies.get(spec["real_id"])
        if not c:
            print(f"WARNING: source id {spec['real_id']} not found, skipping")
            continue
        showcase.append(anonymize(c, spec))

    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(showcase, f, ensure_ascii=False)

    print(f"Wrote {len(showcase)} showcase entries to {OUT}")
    for s in showcase:
        print(" -", s["id"], s["names"][0], "buyers:", s["buyers"])


if __name__ == "__main__":
    main()
