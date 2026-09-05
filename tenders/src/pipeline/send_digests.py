"""
Sends the weekly digest email to every user whose stored scope (user_scopes) matches at least
one change_events row from today's pipeline run. Deliberately skips users with zero matches
this run — no "nothing changed" email yet (see the multi-domain/digest plan's note on this).

Run once, at the end of src/pipeline/refresh_all.py, after every domain's detect_changes.py
has already run for today.

Usage:
    export SUPABASE_URL=... SUPABASE_SERVICE_KEY=... RESEND_API_KEY=... DIGEST_FROM_EMAIL=...
    python3 src/pipeline/send_digests.py

DIGEST_FROM_EMAIL must be an address on a domain verified in Resend (Resend rejects sends from
an unverified domain) — until that's set up, Resend's own sandbox sender
(onboarding@resend.dev) works for testing but can only deliver to the account owner's own
verified email address.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.request
import urllib.error
from datetime import date

DOMAIN_LABELS = {
    "cleaning": "ניקיון", "security": "שמירה ואבטחה", "catering": "הסעדה וכיבוד",
    "gardening": "גינון", "laundry": "כביסה", "transport": "הסעות",
}


def sb_get(url, key, path, base="rest/v1"):
    req = urllib.request.Request(f"{url.rstrip('/')}/{base}/{path}", method="GET")
    req.add_header("apikey", key)
    req.add_header("Authorization", f"Bearer {key}")
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        raise SystemExit(f"Supabase GET {path} failed ({e.code}): {e.read().decode('utf-8', errors='replace')}")


def resolve_email(url, key, user_id):
    """user_scopes only stores user_id (correctly — RLS-wise a user's own row shouldn't need
    to duplicate their auth email). The pipeline runs as service_role, which can resolve it via
    GoTrue's admin API — a different base path (auth/v1/admin) from the usual PostgREST one."""
    try:
        user = sb_get(url, key, f"admin/users/{user_id}", base="auth/v1")
        return user.get("email")
    except SystemExit:
        return None


def company_region_match(company_regions, has_national, scope):
    if not scope["districts"]:
        return True  # no district restriction chosen -> everything matches
    if scope["include_national"] and has_national:
        return True
    return any(r in scope["districts"] for r in company_regions)


def send_email(api_key, from_email, to_email, subject, html_body):
    body = json.dumps({
        "from": from_email,
        "to": [to_email],
        "subject": subject,
        "html": html_body,
    }).encode("utf-8")
    req = urllib.request.Request("https://api.resend.com/emails", data=body, method="POST")
    req.add_header("Authorization", f"Bearer {api_key}")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        print(f"  FAILED to send to {to_email}: {e.code} {detail}")
        return None


def render_digest_html(events_by_company, category):
    domain_label = DOMAIN_LABELS.get(category, category)
    rows = []
    for company_id, events in events_by_company.items():
        items = "".join(f"<li>{e['description']}</li>" for e in events)
        rows.append(f"<li style='margin-bottom:10px'>חברה {company_id}<ul>{items}</ul></li>")
    return f"""
    <div dir="rtl" style="font-family:sans-serif; text-align:right; max-width:560px">
      <h2>עדכון שבועי — {domain_label}</h2>
      <p>הנה מה שהשתנה השבוע במעקב שלכם:</p>
      <ul>{"".join(rows)}</ul>
      <p style="color:#888; font-size:.85em">מבוסס אך ורק על רישומים פומביים. אינו מהווה ייעוץ משפטי או ערובה לתוצאה כלשהי.</p>
    </div>
    """


def main():
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_KEY"]
    resend_key = os.environ.get("RESEND_API_KEY")
    from_email = os.environ.get("DIGEST_FROM_EMAIL", "onboarding@resend.dev")
    if not resend_key:
        print("RESEND_API_KEY not set — skipping digest send (this is fine before Resend is wired up).")
        return

    today = date.today().isoformat()
    users = sb_get(url, key, "user_scopes?digest_enabled=eq.true")
    if not users:
        print("No users with digest_enabled — nothing to send.")
        return

    events = sb_get(url, key, f"change_events?event_date=eq.{today}")
    if not events:
        print("No change events today — nothing to send.")
        return

    # company_id -> region info, fetched per category actually used below, cached per category
    region_cache = {}

    sent = 0
    for user in users:
        category = user["category"]
        user_events = [e for e in events if e["category"] == category]
        if not user_events:
            continue

        if category not in region_cache:
            teaser_rows = sb_get(url, key, f"companies_teaser?category=eq.{category}&select=id,regions,has_national_buyer")
            region_cache[category] = {r["id"]: r for r in teaser_rows}
        regions_by_id = region_cache[category]

        scope = {
            "districts": user["districts"], "include_national": user["include_national"],
        }
        matched = {}
        for e in user_events:
            info = regions_by_id.get(e["company_id"], {"regions": [], "has_national_buyer": True})
            if company_region_match(info["regions"], info["has_national_buyer"], scope):
                matched.setdefault(e["company_id"], []).append(e)

        if not matched:
            continue

        email = resolve_email(url, key, user["user_id"])
        if not email:
            print(f"  skipping user {user['user_id']}: could not resolve email via admin API")
            continue

        html = render_digest_html(matched, category)
        status = send_email(resend_key, from_email, email, f"עדכון שבועי — {DOMAIN_LABELS.get(category, category)}", html)
        if status:
            sent += 1

    print(f"Sent {sent} digest email(s) out of {len(users)} subscribed user(s).")


if __name__ == "__main__":
    main()
