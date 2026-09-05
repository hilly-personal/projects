"""
Full recurring data-refresh pipeline: download this month's government data, reclassify,
rebuild every validated domain's company dataset, and reload into Supabase.

Run manually:
    export SUPABASE_URL="..."
    export SUPABASE_SERVICE_KEY="..."
    python3 src/pipeline/refresh_all.py

Run on a schedule via .github/workflows/refresh_data.yml (weekly — mr.gov.il updates monthly,
weekly gives margin without hammering their server).

VALIDATED_CATEGORIES is the list of domains that passed the precision-sample check (see
this-is-a-brief-piped-metcalfe.md's multi-domain expansion plan) — adding a new domain here
without first sampling its titles the way security/catering/gardening/laundry/transport were
checked (and pest control was rejected) would silently ship unverified data.
"""
from __future__ import annotations

import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")

VALIDATED_CATEGORIES = ["cleaning", "security", "catering", "gardening", "laundry", "transport"]


def run(*args, **kwargs):
    print(f"$ {' '.join(args)}")
    subprocess.run(args, check=True, cwd=ROOT, **kwargs)


def main():
    if not os.environ.get("SUPABASE_URL") or not os.environ.get("SUPABASE_SERVICE_KEY"):
        sys.exit("Set SUPABASE_URL and SUPABASE_SERVICE_KEY before running this.")

    run(sys.executable, "src/ingestion/fetch_latest.py")
    run(sys.executable, "src/ingestion/build_classified.py")

    for category in VALIDATED_CATEGORIES:
        out = "app/companies.json" if category == "cleaning" else f"data/processed/companies_{category}.json"
        run(sys.executable, "src/lifecycle/gen_company_dataset.py", category, out)

    run(sys.executable, "webapp/scripts/build_index.py")
    run(sys.executable, "webapp/scripts/build_showcase.py")
    run(sys.executable, "webapp/scripts/load_data.py")

    print("Refresh complete.")


if __name__ == "__main__":
    main()
