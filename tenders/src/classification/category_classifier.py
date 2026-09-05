"""Conservative category classifier for the cleaning/facilities Phase 1
experiment. Precision is prioritized over recall per the project brief
(false positives are worse than false negatives for this experiment).

Findings that shaped this (see reports/schema_inspection.md):
- 'נושאים' (subjects) is a controlled-vocabulary tag field, not free text.
  'שירותי בנייה ואחזקת מבנים' (construction & building-maintenance services)
  is the official tag closest to "facilities", but manual inspection showed
  it is heavily mixed with construction/renovation work, not just
  cleaning-adjacent facilities upkeep — so it is kept as a SEPARATE,
  explicitly lower-confidence bucket rather than merged into Cleaning.
- Bare 'אחזקה' (maintenance) is overwhelmingly technical maintenance
  (software, medical equipment, vehicles, HVAC, fire/security systems) when
  sampled directly — confirms the brief's own instruction to exclude
  technical maintenance, and argues against using 'אחזקה' as a keyword at all.

Correction: CLEANING_KEYWORDS must be matched against the record TITLE only, not
title+subjects combined. 'נושאים' is a coarse, broadly-applied tag list — a record
can carry "שירותי ניקיון" purely because it falls under a multi-service framework
tender it has nothing to do with (confirmed by manual inspection: engineering and
computing companies surfaced as "cleaning" suppliers this way). Matching subjects
too inflated the cleaning population 767 -> the corrected, trustworthy 133 distinct
suppliers once restricted to title-only matching. See business_viability_review.md's
2026-08-31 correction for the full before/after. This does NOT apply to
FACILITIES_TAG / TECHNICAL_MAINTENANCE_KEYWORDS below, which intentionally use the
subjects field as a controlled-vocabulary tag, not a keyword-in-free-text match.
"""
from __future__ import annotations

import pandas as pd

CLEANING_KEYWORDS = ["ניקיון"]

# Additional recurring-service domains, same title-only precision-first approach as cleaning.
# Each was precision-sampled against real titles before being trusted (see
# this-is-a-brief-piped-metcalfe.md's multi-domain expansion plan for the samples) — this is
# NOT a mechanical "run the pipeline on more tags" exercise; the facilities tag-based attempt
# failed precisely because it skipped this step.
SECURITY_KEYWORDS = ["שמירה", "אבטחה"]  # 992 title matches, precision-sampled clean
CATERING_KEYWORDS = ["הסעדה", "כיבוד"]  # 368 title matches, precision-sampled clean
GARDENING_KEYWORDS = ["גינון"]  # 287 title matches, precision-sampled clean (often bundled with cleaning)
LAUNDRY_KEYWORDS = ["כביסה", "כביסת"]  # 175 title matches, precision-sampled clean

# Transportation needed a refinement: raw "הסעות"/"הסעה" matches include software-system
# contracts ("מערכת לניהול הסעות") and armored-vehicle security transport, not the shuttle/
# transport SERVICE this domain means. Excluding those terms took 246 matches to 235 clean ones.
TRANSPORT_KEYWORDS = ["הסעות", "הסעה"]
TRANSPORT_EXCLUDE_KEYWORDS = ["תוכנה", "תוכנת", "מערכת", "ממוגן", "לוגיסטיקה"]

# Pest control ("הדברה") was tested and REJECTED: in this dataset the term is dominated by
# agricultural/environmental research (crop pest studies, water-contamination monitoring,
# university research contracts) rather than building/facility pest-control services. Even
# after excluding obvious agricultural terms, the remainder was still mostly research —
# no keyword gave usable precision. Not included as a domain; do not re-add without a real
# fix (see the multi-domain expansion plan's precision-sample notes).

FACILITIES_TAG = "אחזקת מבנים"  # matched only against נושאים (controlled tags), not free title text

TECHNICAL_MAINTENANCE_KEYWORDS = [
    "ציוד רפואי",
    "מעליות",
    "מעלית",
    "תוכנה",
    "תוכנת",
    "מחשוב",
    "מחשב",
    "רכבים",
    "רכב תפעולי",
    "גילוי אש",
    "כיבוי אש",
    "מיזוג אוויר",
    "מיזוג אשת",
    "משאבות חום",
    "דיאליזה",
    "מנ\"מ",
    "מכשירי מים",
]


def classify_category(title: str | None, subjects: str | None) -> str:
    title = title or ""
    subjects = subjects or ""
    combined = f"{title} {subjects}"

    is_technical = any(kw in combined for kw in TECHNICAL_MAINTENANCE_KEYWORDS)

    if any(kw in title for kw in CLEANING_KEYWORDS):  # title-only, see module docstring correction
        return "cleaning"
    if any(kw in title for kw in SECURITY_KEYWORDS):  # title-only, same precision reasoning
        return "security"
    if any(kw in title for kw in CATERING_KEYWORDS):
        return "catering"
    if any(kw in title for kw in GARDENING_KEYWORDS):
        return "gardening"
    if any(kw in title for kw in LAUNDRY_KEYWORDS):
        return "laundry"
    if any(kw in title for kw in TRANSPORT_KEYWORDS) and not any(kw in title for kw in TRANSPORT_EXCLUDE_KEYWORDS):
        return "transport"
    if FACILITIES_TAG in subjects and not is_technical:
        return "facilities"
    if is_technical:
        return "technical_maintenance"
    return "other"


def classify_dataframe(df: pd.DataFrame, title_col: str, subjects_col: str) -> pd.Series:
    return df.apply(
        lambda r: classify_category(r.get(title_col), r.get(subjects_col)), axis=1
    )
