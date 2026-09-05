"""Builds buyer x category x incumbent-supplier lifecycles from the
classified Exemptions population, per project_brief.md §16-17.

Approach (documented for the Phase 1 report):
- The Exemptions file is the substantive source (see schema_inspection.md —
  Tenders' award/date/supplier fields are >99% empty). Lifecycles are built
  from Exemptions records only for this experiment.
- A "supplier engagement" is the set of Exemptions records sharing the same
  (buyer, category, resolved_supplier_key), sorted chronologically. Multiple
  records within one engagement (award, extension, option exercises) are
  collapsed into a single lifecycle per brief §16 ("avoid double-counting
  multiple extension decisions as separate economic opportunities").
- A "replacement" is detected when a DIFFERENT resolved_supplier_key appears
  for the same (buyer, category) with its first record dated after the prior
  engagement's last known contract end (or last record date if no end date
  is available).
- Lifecycle-event typing uses the תקנה (regulation clause) field, which is
  structured, not free text — see schema_inspection.md for the mapping.
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field

import numpy as np
import pandas as pd

EXTENSION_CLAUSE_MARKERS = [
    "בתנאים זהים לתנאי ההתקשרות הראשונה",  # "same conditions as the first engagement" family
    "התקשרות המשך",
    "מימוש זכות ברירה",
]
AWARD_CLAUSE_MARKERS = [
    "ספק יחיד",
    "מיזם משותף",
]

PENDING_STATUS = "טרם התקבלה החלטת ועדה"


def parse_date(s):
    if s is None:
        return pd.NaT
    return pd.to_datetime(s, format="%d.%m.%Y", errors="coerce")


def normalize_name(name: str | None) -> str | None:
    if not name:
        return None
    n = unicodedata.normalize("NFKC", name)
    n = re.sub(r'["\'׳״()]', "", n)
    n = re.sub(r"\s+", " ", n).strip()
    n = re.sub(r"^(חברת|חב'|בע\"מ|בעמ)\s*", "", n)
    n = re.sub(r"\s*(בע\"מ|בעמ)$", "", n)
    return n or None


def event_type_from_clause(clause: str | None, title: str | None) -> str:
    clause = clause or ""
    title = title or ""
    if any(m in clause for m in EXTENSION_CLAUSE_MARKERS):
        return "EXTENSION"
    if "הארכ" in title:
        return "EXTENSION"
    if any(m in clause for m in AWARD_CLAUSE_MARKERS):
        return "AWARD"
    return "AWARD_OR_OTHER"


@dataclass
class Lifecycle:
    lifecycle_id: str
    buyer: str
    category: str
    incumbent: str | None
    supplier_company_id: str | None
    contract_start: pd.Timestamp
    original_end: pd.Timestamp
    maximum_option_end: pd.Timestamp
    extensions: int
    extension_dates: list = field(default_factory=list)
    replacement_incumbent: str | None = None
    replacement_first_signal_date: pd.Timestamp | None = None
    replacement_confirmed_date: pd.Timestamp | None = None
    lead_time_days: float | None = None
    evidence_count: int = 0
    record_ids: list = field(default_factory=list)


def build_lifecycles(ex_classified: pd.DataFrame, category: str) -> list[Lifecycle]:
    df = ex_classified[ex_classified["category"] == category].copy()
    df["pub_date"] = df["תאריך פרסום"].apply(parse_date)
    df["start_date"] = df["תאריך תחילת תקופת התקשרות"].apply(parse_date)
    df["end_date"] = df["תאריך סיום תקופת התקשרות"].apply(parse_date)
    df["supplier_norm"] = df["שם ספק"].apply(normalize_name)
    df["resolved_supplier_key"] = df["מספר חפ ספק"].fillna(df["supplier_norm"])
    df["event_type"] = df.apply(
        lambda r: event_type_from_clause(r.get("תקנה"), r.get("שם הליך")), axis=1
    )
    df = df.dropna(subset=["resolved_supplier_key", "pub_date"])
    df = df.sort_values("pub_date")

    engagements = []
    for (buyer, supplier_key), grp in df.groupby(["שם המשרד", "resolved_supplier_key"]):
        grp = grp.sort_values("pub_date")
        contract_start = grp["start_date"].min()
        if pd.isna(contract_start):
            contract_start = grp["pub_date"].min()
        original_end = grp["end_date"].dropna()
        original_end = original_end.iloc[0] if len(original_end) else pd.NaT
        maximum_option_end = grp["end_date"].max()
        extension_rows = grp[grp["event_type"] == "EXTENSION"]
        engagements.append(
            {
                "buyer": buyer,
                "supplier_key": supplier_key,
                "incumbent_name": grp["שם ספק"].dropna().iloc[0] if grp["שם ספק"].notna().any() else None,
                "company_id": grp["מספר חפ ספק"].dropna().iloc[0] if grp["מספר חפ ספק"].notna().any() else None,
                "first_seen": grp["pub_date"].min(),
                "last_seen": grp["pub_date"].max(),
                "contract_start": contract_start,
                "original_end": original_end,
                "maximum_option_end": maximum_option_end,
                "extensions": len(extension_rows),
                "extension_dates": extension_rows["pub_date"].tolist(),
                "evidence_count": len(grp),
                "record_ids": grp["מספר פרסום"].tolist(),
                "has_pending_signal": (grp["מהות החלטה"] == PENDING_STATUS).any(),
                "pending_dates": grp.loc[grp["מהות החלטה"] == PENDING_STATUS, "pub_date"].tolist(),
            }
        )

    eng_df = pd.DataFrame(engagements)
    lifecycles: list[Lifecycle] = []
    for buyer, grp in eng_df.groupby("buyer"):
        grp = grp.sort_values("first_seen").reset_index(drop=True)
        for i, row in grp.iterrows():
            lc = Lifecycle(
                lifecycle_id=f"{buyer}::{category}::{row['supplier_key']}::{row['first_seen'].date() if pd.notna(row['first_seen']) else 'na'}",
                buyer=buyer,
                category=category,
                incumbent=row["incumbent_name"],
                supplier_company_id=row["company_id"],
                contract_start=row["contract_start"],
                original_end=row["original_end"],
                maximum_option_end=row["maximum_option_end"],
                extensions=row["extensions"],
                extension_dates=row["extension_dates"],
                evidence_count=row["evidence_count"],
                record_ids=row["record_ids"],
            )
            # look for a later engagement at the same buyer = replacement
            later = grp.iloc[i + 1:]
            known_end = row["maximum_option_end"]
            if pd.isna(known_end):
                known_end = row["last_seen"]
            # Only treat a later engagement as a plausible replacement if its
            # first record falls in a realistic transition window around the
            # known contract end (-180d to +730d). Without this window, any
            # unrelated *concurrent* supplier contract at the same buyer for
            # the same category (a large ministry commonly runs several in
            # parallel for different sites) gets wrongly linked as a
            # "replacement," producing nonsensical negative lead times.
            window_start = known_end - pd.Timedelta(days=180)
            window_end = known_end + pd.Timedelta(days=730)
            replacement_candidates = later[
                (later["first_seen"] > row["last_seen"])
                & (later["first_seen"] >= window_start)
                & (later["first_seen"] <= window_end)
            ]
            if len(replacement_candidates):
                repl = replacement_candidates.iloc[0]
                lc.replacement_incumbent = repl["incumbent_name"]
                lc.replacement_confirmed_date = repl["first_seen"]
                # earliest actionable signal: prefer a pending-committee-decision
                # record on THIS engagement dated before the replacement's first
                # record (look-ahead-bias safe: only signals dated <= replacement date)
                pending_before = [d for d in row["pending_dates"] if d <= repl["first_seen"]]
                if pending_before:
                    lc.replacement_first_signal_date = min(pending_before)
                else:
                    lc.replacement_first_signal_date = repl["first_seen"]
                if pd.notna(known_end):
                    lc.lead_time_days = (repl["first_seen"] - known_end).days
            lifecycles.append(lc)
    return lifecycles


def classify_abcd(lc: Lifecycle) -> str:
    has_end = pd.notna(lc.maximum_option_end)
    has_replacement = lc.replacement_confirmed_date is not None
    if has_end and has_replacement:
        return "A"
    if has_end and (lc.extensions >= 1):
        return "B"
    if has_end or lc.extensions >= 1 or lc.evidence_count >= 2:
        return "C"
    return "D"
