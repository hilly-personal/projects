# Schema Inspection — mr.gov.il Tenders & Exemptions (07.08.2026 export)

## File format (both files)

Both source files are named `.xls` but are actually **SpreadsheetML 2003 XML**
(`xmlns="urn:schemas-microsoft-com:office:spreadsheet"`), not binary XLS or OOXML XLSX.

Two quirks required custom parsing (`src/ingestion/parse_spreadsheetml.py`):

1. **False encoding declaration**: the XML prolog declares `encoding="utf-16"`,
   but the actual bytes are UTF-8 with a BOM. A parser that trusts the
   declaration will fail or mis-decode. Fixed by patching the prolog bytes
   before parsing.
2. **Sparse, index-addressed cells**: `<Row ss:Index="N">` and
   `<Cell ss:Index="N">` are not guaranteed sequential — a row can jump from
   column 3 straight to column 7 if columns 4–6 are empty, and the cell's
   real column is its `ss:Index`, not its position among siblings. A naive
   positional parser silently misaligns columns whenever this happens. Fixed
   by tracking the running column index explicitly and only trusting
   `ss:Index` when present.

Parsing uses `lxml.etree.iterparse` with element clearing so the 478MB
Exemptions file streams in bounded memory rather than loading a full DOM.

## Tenders file (`data/raw/tenders_raw.xls` → `data/processed/tenders.parquet`)

- **24,572 rows**, 17 columns, parsed in <1s.
- **2,601 duplicate publication numbers** (מספר פרסום) — same procedure appears
  more than once (likely status updates over time; not yet deduplicated).
- Columns and missingness:

| Column (Hebrew) | English | Missing % |
|---|---|---:|
| מספר פרסום | Publication number | 0.0% |
| שם המשרד | Ministry | 0.5% |
| שם יחידה מפרסמת | Publishing unit | 0.0% |
| סוג הליך | Procedure type | 0.0% |
| מספר הליך | Procedure number | 0.1% |
| שם הליך | Procedure name/title | 0.0% |
| סטטוס | Status | 0.0% |
| תאריך פרסום | Publication date | 0.2% |
| תאריך עדכון | Update date | 0.1% |
| תאריך אחרון להגשת השגות | Objection deadline date | 0.1% |
| שעה אחרונה להגשת השגות | Objection deadline time | 0.7% |
| שם הסל | "Basket"/framework name | **99.9%** |
| שם ספק זוכה | Winning supplier name | **99.6%** |
| מספר חפ ספק | Supplier company number | **99.6%** |
| תאריך תחילת תקופת התקשרות | Contract start date | **99.6%** |
| תאריך סיום תקופת התקשרות | Contract end date | **99.6%** |
| נושאים | Subjects/tags | 11.0% |

**Confirms the prior-session finding at full scale, not just a small sample**:
the Tenders file's award/incumbent/contract-date fields are essentially empty
(<0.5% populated). This file is usable for procedure identification,
publication metadata, and category/subject tagging — **not** for who won or
when a contract runs.

## Exemptions file (`data/raw/exemptions_raw.xls` → `data/processed/exemptions.parquet`)

- **239,549 rows**, 22 columns, parsed in ~12s.
- **29,281 duplicate publication numbers** — same underlying reasons as
  Tenders (status/decision updates over time).
- Date range (תאריך פרסום, publication date): **2005-01-01 to 2026-08-06**
  (55 rows unparseable with the standard `DD.MM.YYYY` format — negligible).
- Has 5 columns Tenders does not: לינק לטקסטים (link to source text/evidence
  document), תקנה (the specific exemption regulation clause — this is the
  richest single field for classifying lifecycle-event type), מהות החלטה
  (nature of the decision), גורם מאשר (approving authority), and critically
  **היקף כספי / מטבע (financial amount / currency)**, which the Tenders file
  lacks entirely.

| Column (Hebrew) | English | Missing % |
|---|---|---:|
| מספר פרסום | Publication number | 0.0% |
| שם המשרד | Ministry | 0.0% |
| שם יחידה מפרסמת | Publishing unit | 0.0% |
| סוג הליך | Procedure type | 0.0% |
| שם הליך | Procedure name/title | 0.0% |
| לינק לטקסטים | Link to source text | 0.0% |
| סטטוס | Status | 0.0% |
| מהות החלטה | Decision nature | 0.0% |
| תאריך פרסום | Publication date | 0.0% |
| תאריך עדכון | Update date | 0.0% |
| תקנה | Exemption regulation clause | 0.1% |
| גורם מאשר | Approving authority | 0.4% |
| נושאים | Subjects/tags | 18.7% |
| שם ספק | Supplier name | 27.6% |
| מטבע | Currency | 31.4% |
| מספר חפ ספק | Supplier company number | 38.1% |
| תאריך תחילת תקופת התקשרות | Contract start date | 43.1% |
| תאריך סיום תקופת התקשרות | Contract end date | 43.1% |
| היקף כספי | Financial amount | 46.5% |
| תאריך אחרון להגשת השגות | Objection deadline date | 70.6% |
| מספר הליך | Procedure number | 82.5% |
| שעה אחרונה להגשת השגות | Objection deadline time | 93.4% |

**This is the primary substantive data source for the product.** Supplier
identity, contract dates, and financial value are present at meaningful
rates (54–72%) here, versus essentially absent in Tenders.

### `סוג הליך` (procedure type) value counts

| Value | Count |
|---|---:|
| התקשרות בפטור במכרז או בהליך תחרותי אחר (exemption-from-tender engagement) | 167,764 |
| פרסום כוונה להתקשרות (published intent to engage) | 68,874 |
| פרסום מיזם ללא כוונת רווח (non-profit initiative) | 2,842 |
| פרסום עקרונות הסכם מסגרת עם חברה ממשלתית (gov-company framework agreement) | 61 |
| פרסום התקשרות המשטרה עם בעל רעיון ייחודי (police unique-idea engagement) | 8 |

### `מהות החלטה` (decision nature) value counts

| Value | Count |
|---|---:|
| התקשרות מאושרת (engagement approved) | 174,097 |
| טרם התקבלה החלטת ועדה (committee decision pending) | 64,840 |
| התקשרות לא מאושרת (engagement not approved) | 559 |

### `תקנה` (exemption regulation clause) — top values, and what they imply for LifecycleEvent typing

This is the key field for classifying lifecycle-event type without needing
NLP on free text:

| Clause (abbreviated) | Count | Likely LifecycleEvent |
|---|---:|---|
| תקנה 3(29) - ספק יחיד (sole supplier) | 96,940 | AWARD (new sole-source) |
| תקנה 25(1)/25(6)/25(7)/25(20) - land-rights grants | ~45,500 combined | (mostly out of scope — land/real-estate rights, not service contracts) |
| תקנה 3(4)(ב) variants - "same conditions as first engagement" | ~29,200 combined | **EXTENSION / RENEWAL** |
| תקנה 3ג - מימוש זכות ברירה (exercise of option) | 12,217 | **OPTION** |
| התקשרות המשך (חוק ישן) (continuation engagement, old law) | 6,588 | **EXTENSION** (legacy) |
| תקנה 3(30) - מיזם משותף (joint venture) | 5,293 | AWARD |
| תקנה 3(1) - value ≤ ₪50,000 | 2,838 | AWARD (low-value) |

The extension/option/continuation clauses alone (~48,000 records) are direct,
structured evidence of the exact lifecycle signal the product is built
around — no free-text inference needed to detect "this is a renewal, not a
fresh award."

## Immediate implication for the classifier and lifecycle work

- Category classification (cleaning/facilities vs. other) should run primarily
  against `שם הליך` (procedure title) and `נושאים` (subjects), on **both**
  files, since a lifecycle needs the Tenders-side original procurement
  context even though Tenders lacks award data.
- Lifecycle-event typing should use the Exemptions file's `תקנה` field as the
  primary signal, falling back to keyword matching on `שם הליך` (e.g. "הארכת
  חוזה" = contract extension) only for the residual clauses not covered above.
- Entity resolution should prefer `מספר חפ ספק` (company number) over
  `שם ספק` (name) wherever populated (61.9% of Exemptions rows), consistent
  with the brief's own instruction.
