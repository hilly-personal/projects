"""
Finds and downloads the current month's Exemptions report from mr.gov.il.

The download URL changes every month (dated filename + a signed `context` token) — see
data_sources_to_acquire.md's note on this. There's no stable, bookmarkable URL, so this
re-discovers the current one from the source page's HTML every run rather than hardcoding
last month's link.

Only the Exemptions report is fetched — the Tenders report's award/supplier/date fields are
>99% empty (confirmed in reports/schema_inspection.md during the original Phase 1 investigation),
so it isn't part of the classification/lifecycle pipeline and re-downloading it would just be
478MB+ of unused bandwidth on every run.
"""
from __future__ import annotations

import os
import re
import zipfile
import urllib.request

SOURCE_PAGE = "https://mr.gov.il/ilgstorefront/he/news/details/230920201036"
URL_PATTERN = re.compile(
    r"https://mr\.gov\.il/ilgstorefront/medias/Exemptions-\d{8}\.zip\?context=[A-Za-z0-9]+"
)

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")
RAW_DIR = os.path.join(ROOT, "data", "raw")


def find_current_url() -> str:
    req = urllib.request.Request(SOURCE_PAGE, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        html = resp.read().decode("utf-8", errors="replace")
    match = URL_PATTERN.search(html)
    if not match:
        raise SystemExit(
            f"Could not find an Exemptions ZIP link on {SOURCE_PAGE} — "
            "the page structure may have changed; needs a look, not a blind retry."
        )
    return match.group(0)


def download_and_extract(url: str) -> str:
    os.makedirs(RAW_DIR, exist_ok=True)
    zip_path = os.path.join(RAW_DIR, "exemptions_latest.zip")
    print(f"Downloading {url}")
    urllib.request.urlretrieve(url, zip_path)

    with zipfile.ZipFile(zip_path) as z:
        names = [n for n in z.namelist() if n.lower().endswith((".xls", ".xlsx"))]
        if not names:
            raise SystemExit(f"No .xls file found inside {zip_path} — contents: {z.namelist()}")
        extracted = z.extract(names[0], RAW_DIR)

    out_path = os.path.join(RAW_DIR, "exemptions_raw.xls")
    os.replace(extracted, out_path)
    os.remove(zip_path)
    print(f"Extracted -> {out_path} ({os.path.getsize(out_path) / 1e6:.1f} MB)")
    return out_path


def main():
    url = find_current_url()
    path = download_and_extract(url)
    print(f"OK: {path}")


if __name__ == "__main__":
    main()
