"""
Parses the raw Exemptions .xls (SpreadsheetML) into data/processed/exemptions_classified.parquet,
with the `category` column already applied via src/classification/category_classifier.py.

This is the step that turns a fresh download from fetch_latest.py into what every other script
in the pipeline (gen_company_dataset.py, load_data.py) actually reads.
"""
from __future__ import annotations

import os
import sys

import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")
sys.path.insert(0, os.path.join(ROOT, "src"))

from ingestion.parse_spreadsheetml import iter_records
from classification.category_classifier import classify_dataframe

RAW_PATH = os.path.join(ROOT, "data", "raw", "exemptions_raw.xls")
OUT_PATH = os.path.join(ROOT, "data", "processed", "exemptions_classified.parquet")


def main():
    print(f"Parsing {RAW_PATH} ...")
    df = pd.DataFrame(iter_records(RAW_PATH))
    print(f"Parsed {len(df)} rows")

    df["category"] = classify_dataframe(df, "שם הליך", "נושאים")
    print(df["category"].value_counts())

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    df.to_parquet(OUT_PATH, index=False)
    print(f"Wrote {OUT_PATH}")


if __name__ == "__main__":
    main()
