import json, hashlib
from datetime import date
from regions import REGIONS, DISTRICTS

TODAY = date.today()

def parse_iso(s):
    return date.fromisoformat(s) if s else None

def fmt_he_month(d):
    months = ['ינו׳','פבר׳','מרץ','אפר׳','מאי','יוני','יולי','אוג׳','ספט׳','אוק׳','נוב׳','דצמ׳']
    return f"{months[d.month-1]} {d.year}"

def fmt_full_date(d):
    return d.strftime('%d.%m.%Y')

def code_for(cid, idx):
    h = hashlib.sha1(cid.encode()).hexdigest()[:4]
    return f"TI-2026-{h.upper()}"

companies = json.load(open('companies.json', encoding='utf-8'))

def build_opportunity(c):
    recs = [r for r in c['records'] if r['title'] and 'ניקיון' in r['title']]
    if not recs:
        return None
    recs_with_end = [r for r in recs if r['end_obj']]
    if not recs_with_end:
        return None
    latest = None
    is_active = False
    for r in sorted(recs_with_end, key=lambda r: r['end_obj']):
        if parse_iso(r['end_obj']) >= TODAY:
            latest = r; is_active = True
            break
    if not latest:
        latest = max(recs_with_end, key=lambda r: r['end_obj'])
        is_active = False

    end_d = parse_iso(latest['end_obj'])
    gap_flag = not is_active
    days_to_end = (end_d - TODAY).days if is_active else None

    # scoped to the SAME buyer as `latest` — a "final option" flag on a different, unrelated
    # past engagement (different buyer) is not evidence about the current one.
    same_buyer = [r for r in recs_with_end if r['buyer'] == latest['buyer']]
    def is_final_option_text(t):
        return t and 'אחרונה' in t and ('זכות ברירה' in t or 'אופציה' in t)
    final_option = any(
        is_final_option_text(r['title']) or is_final_option_text(r['mechanism'])
        for r in same_buyer
    )
    same_buyer.sort(key=lambda r: r['end_obj'])
    short_ext = False
    if len(same_buyer) >= 2:
        def dur(r):
            s, e = parse_iso(r['start_obj']), parse_iso(r['end_obj'])
            return (e - s).days if s else None
        d_last, d_prev = dur(same_buyer[-1]), dur(same_buyer[-2])
        if d_last and d_prev and d_prev >= 270 and d_last < d_prev * 0.6:
            short_ext = True

    soon = is_active and days_to_end is not None and days_to_end <= 150

    # confidence score, adapted from the brief's own model (base 40 + signals, cap 95)
    score = 40
    if soon: score += 20
    if gap_flag: score += 25
    if final_option: score += 15
    if short_ext: score += 10
    score = min(95, score)

    if not (soon or gap_flag or final_option or short_ext):
        return None  # no real signal — not a genuine opportunity

    # stage classification
    if final_option and (soon or gap_flag):
        stage, stage_step, stage_kind = 'אופציות מוצו', 4, 'amber'
    elif gap_flag:
        stage, stage_step, stage_kind = 'חלון פקיעה נפתח', 3, 'amber'
    elif short_ext:
        stage, stage_step, stage_kind = 'הארכה קצרה — סימן אי-ודאות', 3, 'blue'
    elif soon:
        stage, stage_step, stage_kind = 'מתקרב לתום תקופה', 2, 'blue'
    else:
        stage, stage_step, stage_kind = 'חוזה פעיל', 1, 'neutral'

    # predicted window: for gap, "now"; for soon-active, a window ending near expiry
    if gap_flag:
        window_label = 'כעת'
        window_start = None
    else:
        window_end = end_d
        window_start = date(window_end.year if window_end.month > 2 else window_end.year - 1,
                             ((window_end.month - 3 - 1) % 12) + 1, 1)
        window_label = f"{fmt_he_month(window_start)}–{fmt_he_month(window_end)}"

    earliest = min(recs_with_end, key=lambda r: r['start_obj'] or r['pub_date_obj'] or '9999')
    award_date = parse_iso(earliest['start_obj']) or parse_iso(earliest['pub_date_obj'])

    why = []
    n = 1
    if final_option:
        fo_rec = next((r for r in same_buyer if is_final_option_text(r['title']) or is_final_option_text(r['mechanism'])), None)
        why.append({
            'n': str(n), 't': 'אופציה סומנה במפורש כאחרונה',
            'd': f"רישום פומבי מתאריך {fmt_full_date(parse_iso(fo_rec['pub_date_obj']))} מציין מפורשות שמדובר במימוש אופציה אחרונה — שרשרת האופציות מוצתה.",
            'src': f"מספר הליך {fo_rec['proc_id']} · רשות החשבות הכללית"
        })
        n += 1
    if gap_flag:
        why.append({
            'n': str(n), 't': 'אין רישום המשך פומבי',
            'd': f"התקופה המאושרת האחרונה שנמצאה הסתיימה ב-{fmt_full_date(end_d)}. לא עלה רישום המשך תחת מספר הספק מאז — לא ידוע האם ההתקשרות נמשכה בלי רישום חדש, או שמתגבש הליך חדש.",
            'src': f"מספר הליך {latest['proc_id']} · אחרון שנמצא"
        })
        n += 1
    if short_ext:
        d_last_days = (parse_iso(same_buyer[-1]['end_obj']) - parse_iso(same_buyer[-1]['start_obj'])).days
        d_prev_days = (parse_iso(same_buyer[-2]['end_obj']) - parse_iso(same_buyer[-2]['start_obj'])).days
        why.append({
            'n': str(n), 't': 'הארכה קצרה משמעותית מהקודמת',
            'd': f"ההתקשרות הקודמת הייתה לכ-{d_prev_days} ימים; ההארכה האחרונה הייתה לכ-{d_last_days} ימים בלבד — לרוב סימן שתהליך רכש חדש עדיין לא הושלם.",
            'src': f"מספר הליך {same_buyer[-1]['proc_id']}"
        })
        n += 1
    if soon and not why:
        why.append({
            'n': str(n), 't': 'מועד סיום מאושר מתקרב',
            'd': f"התקופה המאושרת מסתיימת ב-{fmt_full_date(end_d)}, בעוד כ-{days_to_end} ימים, במנגנון \"{latest['mechanism']}\".",
            'src': f"מספר הליך {latest['proc_id']}"
        })

    missing = 'לא זמינה עדיין השוואה מול קדנציית פרסום היסטורית של הגורם המזמין, ולא זמין יומן שינויים — אלה דורשים מספר משיכות נתונים לאורך זמן, ויתווספו ככל שהמאגר יצטבר.'

    # timeline segments
    track = []
    if award_date:
        track.append({'flex': 2, 'label': 'חוזה פעיל', 'date': f"{award_date.year}–{end_d.year}", 'kind': 'neutral'})
    if not gap_flag:
        track.append({'flex': 1.2, 'label': window_label if gap_flag else 'חלון פרסום חזוי', 'date': window_label, 'kind': 'blue'})
    else:
        track.append({'flex': 1, 'label': 'חלון פתוח', 'date': 'כעת', 'kind': 'amber'})
    track.append({'flex': 1, 'label': 'תום תקופה מאושרת', 'date': fmt_full_date(end_d), 'kind': 'neutral-light'})

    facts = [
        {'k': 'מכרז/הליך מקורי', 'v': earliest['proc_id'] or '—'},
        {'k': 'מועד התחלה מוקדם ביותר שנמצא', 'v': fmt_full_date(award_date) if award_date else '—'},
        {'k': 'מספר רישומים ציבוריים', 'v': str(len(recs))},
        {'k': 'מנגנון אחרון', 'v': latest['mechanism'] or '—'},
        {'k': 'ספק מחזיק', 'v': c['names'][0]},
        {'k': 'תום תקופה מאושרת', 'v': fmt_full_date(end_d)},
    ]

    headline_b = (
        f" ללא רישום המשך מאז {fmt_full_date(end_d)} — ייתכן הליך חדש שטרם פורסם."
        if gap_flag else
        f" צפוי להסתיים ב-{fmt_full_date(end_d)}; חלון פרסום סביר {window_label}."
    )

    buyer = latest['buyer'] or 'גורם ממשלתי'
    region_info = REGIONS.get(buyer, {'national': True, 'src': 'מזמין לא ידוע — לא שויך למחוז'})

    return {
        'id': c['id'],
        'code': code_for(c['id'], 0),
        'name': f"שירותי ניקיון — {buyer}",
        'body': buyer,
        'holder': c['names'][0],
        'region': region_info,
        'stage': stage, 'stageStep': stage_step, 'stageKind': stage_kind,
        'window': window_label,
        'conf': score,
        'value': latest['amount'],
        'updated': 'מבוסס נתונים נוכחיים',
        'headlineMark': c['names'][0],
        'headlineB': headline_b,
        'basis': 'ההערכה מבוססת על רישומים פומביים בלבד — ראו את סעיף \"למה אנחנו חושבים כך\".',
        'track': track,
        'facts': facts,
        'why': why,
        'missing': missing,
        'daysToAct': days_to_end if days_to_end is not None else 0,
        'isActive': is_active,
        'gapFlag': gap_flag,
    }

opps = []
for c in companies:
    o = build_opportunity(c)
    if o:
        opps.append(o)

opps.sort(key=lambda o: -o['conf'])
print(f"Generated {len(opps)} opportunities", flush=True)
top = opps[:40]
json.dump(top, open('opportunities.json', 'w', encoding='utf-8'), ensure_ascii=False)
print("wrote opportunities.json, top 40 of", len(opps))

# Coverage stats computed over the FULL real opportunity population (all 112 with a genuine
# signal), not just the top-40 shown by default — this is what backs the Settings screen's
# "covered N of TOTAL" honestly, instead of hardcoded example counts.
district_counts = {d: 0 for d in DISTRICTS}
national_count = 0
for o in opps:
    r = o['region']
    if r.get('national'):
        national_count += 1
    elif r.get('region') in district_counts:
        district_counts[r['region']] += 1
meta = {
    'totalOpportunities': len(opps),
    'totalCompanies': len(companies),
    'districtCounts': district_counts,
    'nationalCount': national_count,
    'districts': DISTRICTS,
}
json.dump(meta, open('meta.json', 'w', encoding='utf-8'), ensure_ascii=False)
print("meta:", meta)
for o in opps[:5]:
    print(o['id'], o['conf'], o['stage'], o['holder'], o['body'])
