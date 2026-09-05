const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const TODAY = new Date();
// TODO: paste your Stripe Payment Link URLs here (create one price per plan in Stripe)
const STRIPE_LINKS = {
  single: 'REPLACE_WITH_STRIPE_PAYMENT_LINK_SINGLE',
  multi: 'REPLACE_WITH_STRIPE_PAYMENT_LINK_MULTI',
};
const PROMO_DEADLINE = new Date('2026-09-30');
const PROMO_PCT = 30;
function promoDaysLeft(){ return Math.max(0, Math.ceil((PROMO_DEADLINE - TODAY) / 86400000)); }
function promoPrice(regular){ return Math.round(regular * (1 - PROMO_PCT/100) / 10) * 10; }
const PLANS = [
  { key: 'single', name: 'מנוי קטגוריה בודדת', desc: 'מעקב רציף אחרי הקטגוריה שבחרתם בלבד', regular: 690 },
  { key: 'multi', name: 'מנוי רב-קטגורי', desc: 'מעקב על פני כל 7 הקטגוריות הזמינות', regular: 1490 },
];

const TIERS = [
  { key: 'leading', label: 'שחקן מוביל', test: c => c.full_count >= 15 || c.buyers.length >= 4 },
  { key: 'established', label: 'שחקן יציב', test: c => c.full_count >= 5 || c.buyers.length >= 2 },
  { key: 'rising', label: 'כוח עולה', test: () => true },
];
function tierOfFull(c){ return TIERS.find(t => t.test(c)); }
const TIER_LABELS = { leading: 'שחקן מוביל', established: 'שחקן יציב', rising: 'כוח עולה' };

// ---------- onboarding scope: domain / location / deal-size ----------
// All 7 are real, validated, live domains (see the multi-domain expansion plan) — every one
// of these is actually queryable in Supabase, not a "coming soon" placeholder.
const DOMAINS = [
  { key: 'cleaning', label: 'ניקיון' },
  { key: 'security', label: 'שמירה ואבטחה' },
  { key: 'catering', label: 'הסעדה וכיבוד' },
  { key: 'gardening', label: 'גינון' },
  { key: 'laundry', label: 'כביסה' },
  { key: 'transport', label: 'הסעות' },
  { key: 'parking', label: 'חניה' },
];
const DISTRICTS = ['ירושלים', 'תל אביב', 'מרכז', 'חיפה', 'צפון', 'דרום', 'יהודה ושומרון'];
const DEALSIZE_OPTIONS = [
  { bucket: 1, label: 'עסקאות קטנות' },
  { bucket: 2, label: 'עסקאות בינוניות' },
  { bucket: 3, label: 'עסקאות גדולות' },
  { bucket: 4, label: 'עסקאות גדולות מאוד' },
];
const DEFAULT_SCOPE = { category: 'cleaning', districts: [], includeNational: true, dealSizes: [1,2,3,4] };

function loadScope(){
  try {
    const raw = localStorage.getItem('ti_scope');
    if (!raw) return null;
    const s = JSON.parse(raw);
    return { ...DEFAULT_SCOPE, ...s };
  } catch(e) { return null; }
}
function saveScope(scope){ try { localStorage.setItem('ti_scope', JSON.stringify(scope)); } catch(e) {} }

// Signed-in users get their scope persisted server-side (user_scopes table) so the weekly
// digest can be sent to them independent of whether they're currently browsing — localStorage
// alone can't do that. Anonymous visitors keep the localStorage-only behavior above unchanged.
async function loadServerScope(){
  if (!session) return null;
  const { data, error } = await sb.from('user_scopes').select('*').eq('user_id', session.user.id).maybeSingle();
  if (error || !data) return null;
  return { category: data.category, districts: data.districts, includeNational: data.include_national, dealSizes: data.deal_sizes };
}
async function saveServerScope(scope){
  if (!session) return;
  await sb.from('user_scopes').upsert({
    user_id: session.user.id, category: scope.category, districts: scope.districts,
    include_national: scope.includeNational, deal_sizes: scope.dealSizes, updated_at: new Date().toISOString(),
  });
}

let SCOPE = loadScope();
function currentCategory(){ return (SCOPE || DEFAULT_SCOPE).category; }

// applies the location + deal-size portion of SCOPE to a set of teaser rows (client-side —
// the category filter itself already happened server-side via the query). Full-mode rows
// don't get filtered here since a signed-in company profile view should show its real data
// regardless of the visitor's own scope preferences.
function applyScope(rows, mode){
  if (mode !== 'teaser' || !SCOPE) return rows;
  return rows.filter(c => {
    const districtOk = SCOPE.districts.length === 0
      || (c.regions || []).some(r => SCOPE.districts.includes(r))
      || (SCOPE.includeNational && c.has_national_buyer);
    const dealOk = !c.dealsize_bucket || SCOPE.dealSizes.length === 0 || SCOPE.dealSizes.includes(c.dealsize_bucket);
    return districtOk && dealOk;
  });
}

let NAME_INDEX = [];
let session = null; // supabase session, null = anonymous
let currentReportId = null; // id of the company currently shown in #report, or null if on the empty state

// ---------- formatting helpers ----------
function fmtDate(iso){
  if (!iso) return '—';
  const [y,m,d] = iso.split('-');
  const months = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
  return `${parseInt(d)} ב${months[parseInt(m)-1]} ${y}`;
}
function fmtAmount(a){
  if (!a) return null;
  const n = parseFloat(a);
  if (isNaN(n)) return null;
  return '₪' + Math.round(n).toLocaleString('en-US');
}
// K/M-abbreviated form (₪1.2M) — used wherever a figure could plausibly run into the millions
// (per-opportunity value, market-map cumulative volume) so it stays readable at a glance.
function shekelShort(n){
  if (!n) return '—';
  if (n >= 1000000) return '₪' + (n / 1000000).toFixed(n >= 10000000 ? 0 : 1).replace(/\.0$/, '') + 'M';
  if (n >= 1000) return '₪' + Math.round(n / 1000) + 'K';
  return '₪' + Math.round(n);
}
function fmtShortDate(iso){
  if (!iso) return '';
  const [y,m] = iso.split('-');
  const months = ['ינו׳','פבר׳','מרץ','אפר׳','מאי','יוני','יולי','אוג׳','ספט׳','אוק׳','נוב׳','דצמ׳'];
  return `${months[parseInt(m)-1]} ${y}`;
}

// ---------- search (against the safe name index only — id/names/is_active/expiring_soon) ----------
function normalize(s){
  return (s||'').replace(/["'׳״]/g,'').replace(/בע["']?מ\.?/g,'').replace(/\s+/g,' ').trim().toLowerCase();
}
function score(query, entry){
  const q = normalize(query);
  if (!q) return 0;
  if (entry.idNorm === query.trim()) return 100;
  let best = 0;
  for (const n of entry.norms){
    if (n === q) best = Math.max(best, 95);
    else if (n.includes(q)) best = Math.max(best, 70 + Math.min(20, q.length));
    else {
      const qTokens = q.split(' ').filter(Boolean);
      const nTokens = n.split(' ').filter(Boolean);
      const hits = qTokens.filter(t => nTokens.some(nt => nt.includes(t))).length;
      if (qTokens.length && hits === qTokens.length) best = Math.max(best, 55);
      else if (hits > 0) best = Math.max(best, 25 + hits * 8);
    }
  }
  return best;
}
function search(query){
  if (!query || query.trim().length < 2) return [];
  return NAME_INDEX.filter(c => c.category === currentCategory())
    .map(c => ({ c, s: score(query, { norms: c.names.map(normalize), idNorm: c.id }) }))
    .filter(x => x.s > 20)
    .sort((a,b) => b.s - a.s)
    .slice(0, 6);
}

// ---------- data fetch layer ----------
let SHOWCASE = []; // anonymized "see the full value" examples — always rendered unlocked,
                    // regardless of auth. Never real company data, see scripts/build_showcase.py.

// Every query is scoped to a domain — the `companies` table holds one row per (company,
// category) pair, since a company can be active in one domain and in a renewal gap in
// another. currentCategory() reads the onboarding-selected domain (defaults to 'cleaning'
// until a visitor picks one).

async function fetchCompany(id){
  const demo = SHOWCASE.find(d => d.id === id);
  if (demo) return { mode: 'full', data: demo, isShowcase: true };
  if (session){
    const { data, error } = await sb.from('companies').select('*').eq('id', id).eq('category', currentCategory()).maybeSingle();
    if (error) throw error;
    return { mode: 'full', data };
  }
  const { data, error } = await sb.from('companies_teaser').select('*').eq('id', id).eq('category', currentCategory()).maybeSingle();
  if (error) throw error;
  return { mode: 'teaser', data };
}
async function fetchAll(){
  if (session){
    const { data, error } = await sb.from('companies').select('*').eq('category', currentCategory());
    if (error) throw error;
    return { mode: 'full', data: data || [] };
  }
  const { data, error } = await sb.from('companies_teaser').select('*').eq('category', currentCategory());
  if (error) throw error;
  return { mode: 'teaser', data: applyScope(data || [], 'teaser') };
}
async function fetchMarketStats(){
  const { data, error } = await sb.from('market_stats').select('*').eq('category', currentCategory()).maybeSingle();
  if (error || !data) return { total: NAME_INDEX.length, active: 0, buyers: 0 };
  return data;
}

// open_tenders is fully public (no gating — see webapp/supabase/add_open_tenders.sql for why:
// an open tender is a public invitation to bid, not a specific supplier's exposed contract
// status). Real submit_end dates only, filtered client-side against today in case a stale row
// slips through before the next scrape run prunes it.
async function fetchOpenTenders(){
  const { data, error } = await sb.from('open_tenders').select('*').eq('category', currentCategory()).order('submit_end', { ascending: true });
  if (error || !data) return [];
  const todayIso = TODAY.toISOString().slice(0, 10);
  return data.filter(t => !t.submit_end || t.submit_end >= todayIso);
}

// ---------- opportunity classification ----------
function daysSince(iso){ return Math.round((TODAY - new Date(iso)) / 86400000); }

function classifyOpportunityFull(c){
  const recentGap = c.gap_flag && c.latest_end_obj && daysSince(c.latest_end_obj) <= 730;
  const soon = c.is_active && c.days_to_end != null && c.days_to_end <= 150;
  if (c.final_option_flag && (soon || recentGap)){
    return { level: 'high', badge: 'אופציות מוצו', why: `אצל ${c.latest_buyer || 'הגורם המזמין'}, לפחות אופציה אחת סומנה במפורש כ"אחרונה" — שרשרת האופציות שם מוצתה.` };
  }
  if (recentGap){
    return { level: 'high', badge: 'ללא רישום המשך', why: `התקופה המאושרת האחרונה הסתיימה ב-${fmtDate(c.latest_end_obj)} ולא נמצא רישום המשך פומבי מאז.` };
  }
  if (soon && c.short_ext_flag){
    return { level: 'high', badge: 'הארכה קצרה + מתקרב לסיום', why: `ההארכה האחרונה הייתה קצרה משמעותית מהקודמת, וגם התקופה הנוכחית מסתיימת בעוד כ-${c.days_to_end} ימים.` };
  }
  if (soon){
    return { level: 'medium', badge: 'מתקרב לסיום', why: `התקופה המאושרת מול ${c.latest_buyer || 'הגורם המזמין'} מסתיימת בעוד כ-${c.days_to_end} ימים.` };
  }
  return null;
}
// Teaser variant: same badge levels, but the "why" text and every field carry zero
// third-party specifics — no buyer name, no exact day count, no date.
function classifyOpportunityTeaser(c){
  if (c.final_option_flag && (c.expiring_soon || c.gap_flag)){
    return { level: 'high', badge: 'אופציות מוצו', why: 'לפחות אופציה אחת סומנה במפורש כ"אחרונה" — שרשרת האופציות שם מוצתה.' };
  }
  if (c.gap_flag){
    return { level: 'high', badge: 'ללא רישום המשך', why: 'התקופה המאושרת האחרונה שנמצאה הסתיימה, ולא נמצא רישום המשך פומבי מאז.' };
  }
  if (c.expiring_soon && c.short_ext_flag){
    return { level: 'high', badge: 'הארכה קצרה + מתקרב לסיום', why: 'ההארכה האחרונה הייתה קצרה משמעותית מהקודמת, וגם התקופה הנוכחית מתקרבת לסיום.' };
  }
  if (c.expiring_soon){
    return { level: 'medium', badge: 'מתקרב לסיום', why: 'התקופה המאושרת מתקרבת לסיום בחודשים הקרובים.' };
  }
  return null;
}

function findOpportunities(mode, all, self){
  const pool = [];
  const selfBuyers = new Set(mode === 'full' && self ? self.buyers : []);
  for (const c of all){
    if (self && c.id === self.id) continue;
    const opp = mode === 'full' ? classifyOpportunityFull(c) : classifyOpportunityTeaser(c);
    if (!opp) continue;
    const overlap = mode === 'full' && c.buyers.some(b => selfBuyers.has(b));
    const levelScore = opp.level === 'high' ? 100 : 50;
    const urgency = mode === 'full' && c.is_active && c.days_to_end != null ? (200 - c.days_to_end) : 150;
    const score = levelScore + urgency + (overlap ? 40 : 0);
    pool.push({ c, opp, overlap, score });
  }
  pool.sort((a,b) => b.score - a.score);
  return pool.slice(0, 6);
}

// The showcase examples ARE the "real value, before signup" proof for this section — full
// detail, real dates/durations/patterns, anonymized names — rather than a grid of blur-bar
// placeholders that (fairly) read as meaningless to a first-time visitor.
function showcaseOpportunityCards(){
  return SHOWCASE.map(c => {
    const opp = classifyOpportunityFull(c);
    if (!opp) return '';
    return `<div class="opp-card ${opp.level} showcase-opp" data-id="${c.id}" data-name="${c.names[0]}">
      <span class="opp-badge">${opp.badge}</span>
      <span class="opp-demo-tag">📊 דוגמה אמיתית — נתונים אמיתיים, שם בדוי</span>
      <div class="opp-buyer">${c.latest_buyer || c.buyers[0] || 'גורם מזמין'}</div>
      <div class="opp-supplier">מוחזק כרגע ע״י <b>${c.names[0]}</b></div>
      <div class="opp-why">${opp.why}</div>
    </div>`;
  }).filter(Boolean).join('');
}

// Real, currently-open tenders scraped from mr.gov.il's live public search — see
// src/ingestion/scrape_open_tenders.py. Fully public, unlike the renewal-signal opportunities
// below: an open tender is an invitation to bid, not a specific supplier's exposed status.
function daysUntil(iso){
  if (!iso) return null;
  return Math.round((new Date(iso) - TODAY) / 86400000);
}
// "New since your last visit" — compares open_tenders.first_seen (already stored per tender)
// against a remembered last-visit date. Server-side for signed-in users (user_scopes, so the
// count is consistent across devices), localStorage for anonymous visitors. Both sides use a
// plain date (not a timestamp), matching first_seen's own granularity — a second visit later
// the same day won't re-flag that day's batch as new again, which is the intended behavior, not
// a bug.
const OPEN_TENDERS_LAST_VISIT_KEY = 'ti_open_tenders_last_visit';
function loadLastVisitLocal(){ try { return localStorage.getItem(OPEN_TENDERS_LAST_VISIT_KEY); } catch(e){ return null; } }
function saveLastVisitLocal(iso){ try { localStorage.setItem(OPEN_TENDERS_LAST_VISIT_KEY, iso); } catch(e) {} }
async function loadServerLastVisit(){
  if (!session) return null;
  const { data, error } = await sb.from('user_scopes').select('open_tenders_last_visit').eq('user_id', session.user.id).maybeSingle();
  if (error || !data) return null;
  return data.open_tenders_last_visit;
}
async function saveServerLastVisit(iso){
  if (!session) return;
  await sb.from('user_scopes').upsert({ user_id: session.user.id, open_tenders_last_visit: iso });
}

function renderOpenTenders(tenders){
  if (!tenders.length){
    return `<div class="opp-empty">לא זיהינו כרגע מכרזים פתוחים בתחום זה. הסריקה מתעדכנת מספר פעמים ביום.</div>`;
  }
  return `<div class="opp-grid">${tenders.slice(0, 6).map(t => {
    const days = daysUntil(t.submit_end);
    const urgent = days !== null && days <= 7;
    return `<a class="opp-card open-tender ${urgent ? 'high' : 'medium'}" href="${t.detail_url}" target="_blank" rel="noopener">
      <span class="opp-badge">${days !== null ? `עוד ${days} ימים להגשה` : 'מועד הגשה לא זמין'}</span>
      <div class="opp-buyer">${t.buyer}</div>
      <div class="opp-why">${t.title}</div>
      <span class="open-tender-link">לצפייה במכרז ↗</span>
    </a>`;
  }).join('')}</div>`;
}

function renderOpportunities(mode, all, self){
  const opps = findOpportunities(mode, all, self);
  const showcaseCards = mode === 'teaser' ? showcaseOpportunityCards() : '';
  if (!opps.length && !showcaseCards){
    return `<div class="opp-grid"><div class="opp-empty">לא זיהינו כרגע הזדמנויות עם סימנים חזקים בתחום. המאגר מתעדכן ככל שנוסיף מקורות נתונים.</div></div>`;
  }
  if (mode === 'full'){
    const cards = opps.map(({c, opp, overlap}) => `<div class="opp-card ${opp.level}">
        <span class="opp-badge">${opp.badge}</span>
        <div class="opp-buyer">${c.latest_buyer || c.buyers[0] || 'גורם ממשלתי'}</div>
        <div class="opp-supplier">מוחזק כרגע ע״י <b>${c.names[0]}</b></div>
        <div class="opp-why">${opp.why}</div>
        ${overlap ? `<span class="opp-overlap">גורם מוכר — גם ${self.names[0]} עבדה מול ${self.buyers.find(b => c.buyers.includes(b))}</span>` : ''}
      </div>`).join('');
    return `<div class="opp-grid">${cards}</div>`;
  }
  const moreNote = opps.length
    ? `<div class="opp-more-note">מצאנו עוד ${opps.length} הזדמנויות אמיתיות עם סימנים דומים — <button class="eye-cta inline" data-action="focus-auth"><span class="eye-icon">👁</span>התחברו לצפייה בזיהוי המלא</button></div>`
    : '';
  return `<div class="opp-grid">${showcaseCards}</div>${moreNote}`;
}

// ---------- magic-quadrant chart ----------
function median(arr){
  const s = [...arr].sort((a,b) => a-b);
  const m = Math.floor(s.length/2);
  return s.length % 2 ? s[m] : (s[m-1] + s[m]) / 2;
}
function companyDomainStatsFull(c){
  // No title keyword filter here — c.records is already scoped to the row's own category by
  // the generator (src/lifecycle/gen_company_dataset.py), same reasoning as the SQL teaser
  // view. A hardcoded 'ניקיון' filter here would silently zero out every non-cleaning domain.
  const MIN_PLAUSIBLE_AMOUNT = 1000;
  const amounts = c.records
    .map(r => parseFloat(r.amount))
    .filter(n => !isNaN(n) && n >= MIN_PLAUSIBLE_AMOUNT);
  if (!c.records.length || !amounts.length) return null;
  return {
    id: c.id, name: c.names[0], volume: c.records.length, dealSize: median(amounts),
    years: TODAY.getFullYear() - c.year_min + 1, buyerCount: c.buyers.length, tier: tierOfFull(c).label,
  };
}
function hashStr(s){ let h = 0; for (let i=0;i<s.length;i++) h = (h*31 + s.charCodeAt(i)) | 0; return Math.abs(h); }

function renderQuadrant(mode, all, highlightId){
  if (mode === 'full'){
    const QUADRANT_DATA = all.map(companyDomainStatsFull).filter(Boolean);
    if (!QUADRANT_DATA.length) return `<div class="note">אין עדיין מספיק נתונים להצגת מפת שחקנים.</div>`;
    const highlighted = QUADRANT_DATA.find(d => d.id === highlightId);
    const Q_X_MAX = Math.max(...QUADRANT_DATA.map(d => d.volume));
    const Q_Y_VALS = QUADRANT_DATA.map(d => d.dealSize);
    const Q_Y_LOG_MIN = Math.log10(Math.min(...Q_Y_VALS));
    const Q_Y_LOG_MAX = Math.log10(Math.max(...Q_Y_VALS));
    const Q_PAD = 8, Q_SPAN = 84;
    const qX = v => Q_PAD + (v / Q_X_MAX) * Q_SPAN;
    const qY = d => {
      const t = (Math.log10(d) - Q_Y_LOG_MIN) / (Q_Y_LOG_MAX - Q_Y_LOG_MIN || 1);
      return (Q_PAD + Q_SPAN) - t * Q_SPAN;
    };
    let dots = '';
    for (const d of QUADRANT_DATA){
      const isYou = d.id === highlightId;
      const x = qX(d.volume), y = qY(d.dealSize);
      dots += `<div class="quad-dot ${isYou ? 'you' : ''}" style="left:${x}%; top:${y}%"
        data-name="${d.name}" data-volume="${d.volume}" data-size="${fmtAmount(d.dealSize) || '—'}"
        data-years="${d.years}" data-buyers="${d.buyerCount}" data-tier="${d.tier}"></div>`;
      if (isYou) dots += `<div class="quad-dot-label" style="left:${x}%; top:${y}%">${d.name}</div>`;
    }
    return `
      <div class="quad-wrap">
        <div class="quad-plot" id="quad-plot">
          <div class="quad-zone tr">שחקנים מובילים</div>
          <div class="quad-zone tl">מומחי עסקאות גדולות</div>
          <div class="quad-zone br">שחקני נפח</div>
          <div class="quad-zone bl">כוחות מתפתחים</div>
          <div class="quad-divider v"></div><div class="quad-divider h"></div>
          ${dots}
          <div class="quad-axis-label x">מספר מכרזים שזכו בהם (נפח) ←</div>
          <div class="quad-axis-label y">→ גודל עסקה חציוני</div>
          <div class="quad-tooltip" id="quad-tooltip"></div>
        </div>
        <div class="quad-legend">
          <span><i class="sw" style="background:var(--accent)"></i>חברה בתחום</span>
          ${highlightId ? '<span><i class="sw" style="background:var(--accent2)"></i>החברה שהוצגה</span>' : ''}
        </div>
        <div class="quad-caption">מיקום מבוסס על כל הרישומים הציבוריים בתחום שנבחר. ${QUADRANT_DATA.length} חברות מוצגות. ציר גודל העסקה בסקאלה לוגריתמית.</div>
        ${highlightId && !highlighted ? `<div class="note">לא נמצא מספיק נתוני עסקאות בעלות סכום תקף כדי למקם חברה זו בתרשים.</div>` : ''}
      </div>`;
  }

  // teaser mode: quartile-bucketed, de-identified — no names, no exact figures, hover shows tier only
  const rows = all.filter(c => c.volume_bucket && c.dealsize_bucket);
  if (!rows.length) return `<div class="note">אין עדיין מספיק נתונים להצגת מפת שחקנים.</div>`;
  let dots = '';
  for (const d of rows){
    const isYou = d.id === highlightId;
    const jx = (hashStr(d.id + 'x') % 60) / 100, jy = (hashStr(d.id + 'y') % 60) / 100;
    const x = 8 + (d.volume_bucket - 1) * 21 + jx * 15;
    const y = 8 + (4 - d.dealsize_bucket) * 21 + jy * 15;
    dots += `<div class="quad-dot ${isYou ? 'you' : ''}" style="left:${x}%; top:${y}%"
      data-tier="${TIER_LABELS[d.tier] || d.tier}"></div>`;
  }
  return `
    <div class="quad-wrap">
      <div class="quad-plot" id="quad-plot">
        <div class="quad-zone tr">שחקנים מובילים</div>
        <div class="quad-zone tl">מומחי עסקאות גדולות</div>
        <div class="quad-zone br">שחקני נפח</div>
        <div class="quad-zone bl">כוחות מתפתחים</div>
        <div class="quad-divider v"></div><div class="quad-divider h"></div>
        ${dots}
        <div class="quad-axis-label x">נפח מכרזים (רבעון יחסי) ←</div>
        <div class="quad-axis-label y">→ גודל עסקה (רבעון יחסי)</div>
        <div class="quad-tooltip" id="quad-tooltip"></div>
      </div>
      <div class="quad-legend"><span><i class="sw" style="background:var(--accent)"></i>חברה בתחום</span></div>
      <div class="quad-caption">מיקום מבוסס על רבעון יחסי (לא מספרים מדויקים) — ${rows.length} חברות. התחברו לצפייה במיקום המדויק ובשמות.</div>
    </div>`;
}

function wireQuadrantTooltip(container, mode){
  const tip = container.querySelector('#quad-tooltip');
  if (!tip) return;
  container.querySelectorAll('.quad-dot').forEach(dot => {
    dot.addEventListener('mouseenter', () => {
      if (mode === 'full'){
        tip.innerHTML = `<b>${dot.dataset.name}</b>
          <div class="row"><span>מכרזים שזכתה בהם</span><span class="ltr">${dot.dataset.volume}</span></div>
          <div class="row"><span>גודל עסקה חציוני</span><span class="ltr">${dot.dataset.size}</span></div>
          <div class="row"><span>שנות פעילות</span><span class="ltr">${dot.dataset.years}</span></div>
          <div class="row"><span>גורמים מזמינים</span><span class="ltr">${dot.dataset.buyers}</span></div>
          <div class="row"><span>סיווג</span><span>${dot.dataset.tier}</span></div>`;
      } else {
        tip.innerHTML = `<b><span class="redact-bar" style="width:80px"></span></b><div class="row"><span>סיווג</span><span>${dot.dataset.tier}</span></div><div class="row eye-row">👁 לחצו לצפייה בשם ובנתונים המדויקים</div>`;
      }
      const left = parseFloat(dot.style.left), top = parseFloat(dot.style.top);
      const flipX = left > 65, flipY = top < 25;
      tip.style.left = flipX ? 'auto' : `calc(${left}% + 14px)`;
      tip.style.right = flipX ? `calc(${100-left}% + 14px)` : 'auto';
      tip.style.top = flipY ? `calc(${top}% + 14px)` : 'auto';
      tip.style.bottom = flipY ? 'auto' : `calc(${100-top}% + 14px)`;
      tip.classList.add('show');
    });
    dot.addEventListener('mouseleave', () => tip.classList.remove('show'));
  });
}

// ---------- narrative (profile note) ----------
function buildNarrativeFull(c){
  const name = c.names[0];
  const parts = [];
  if (c.is_active){
    const days = c.days_to_end;
    parts.push(`<strong>ההתקשרות מול ${c.latest_buyer || 'הגורם המזמין'} מאושרת כרגע עד ${fmtDate(c.latest_end_obj)}</strong>${days!=null ? ` (עוד כ-${days} ימים)` : ''}, במנגנון "${c.latest_mechanism || 'לא צוין'}".`);
  } else if (c.gap_flag){
    parts.push(`<strong>התקופה המאושרת האחרונה שנמצאה הסתיימה ב-${fmtDate(c.latest_end_obj)}</strong>, ומאז לא עלה רישום המשך פומבי תחת מספר הספק הרשום.`);
  }
  if (c.short_ext_flag) parts.push('שימו לב: ההארכה האחרונה שנמצאה הייתה קצרה משמעותית מזו שקדמה לה — לרוב סימן לכך שתהליך רכש חדש עדיין לא הושלם.');
  if (c.final_option_flag) parts.push(`לפחות באחת מההתקשרויות של ${name}, האופציה סומנה במפורש כ"אחרונה" — כלומר שרשרת האופציות שם מוצתה.`);
  if (c.option_count + c.continuation_count >= 4) parts.push(`בסך הכל זיהינו דפוס של ${c.option_count} מימושי אופציה ו-${c.continuation_count} המשכים בתנאים זהים מול ${c.buyers.length} גורמים ממשלתיים מאז ${c.year_min}.`);
  if (!parts.length) parts.push(`נמצאו ${c.full_count} רישום/ים פומבי/ים, אך לא מספיק פעילות עדכנית כדי לזהות חלון הזדמנות ספציפי כרגע.`);
  return parts.join(' ');
}
function buildNarrativeTeaser(c){
  const parts = [];
  if (c.is_active) parts.push('<strong>יש להתקשרות פעילה כרגע.</strong> תאריך הסיום, הגורם המזמין והמנגנון נעולים.');
  else if (c.gap_flag) parts.push('<strong>לא נמצא רישום המשך פומבי מאז תום התקופה האחרונה שנמצאה.</strong> הפרטים נעולים.');
  if (c.short_ext_flag) parts.push('שימו לב: ההארכה האחרונה שנמצאה הייתה קצרה משמעותית מזו שקדמה לה.');
  if (c.final_option_flag) parts.push('לפחות באחת מההתקשרויות, האופציה סומנה במפורש כ"אחרונה".');
  if (!parts.length) parts.push(`נמצאו ${c.full_count} רישום/ים פומבי/ים, אך לא מספיק פעילות עדכנית כדי לזהות חלון הזדמנות ספציפי כרגע.`);
  return parts.join(' ');
}

// ---------- report ----------
async function renderReport(id){
  currentReportId = id;
  document.getElementById('empty').hidden = true;
  document.getElementById('market-map').hidden = true;
  document.getElementById('dossier').hidden = true;
  document.getElementById('nomatch').hidden = true;
  document.getElementById('suggest').hidden = true;
  const reportEl = document.getElementById('report');
  reportEl.hidden = false;
  reportEl.innerHTML = `<div class="loading">טוען…</div>`;
  document.querySelector('.search-wrap').scrollIntoView({ behavior: 'smooth', block: 'start' });

  let mode, c, isShowcase;
  try {
    const res = await fetchCompany(id);
    mode = res.mode; c = res.data; isShowcase = !!res.isShowcase;
  } catch (e) {
    reportEl.innerHTML = `<div class="note">שגיאה בטעינת הנתונים. נסו שוב בעוד רגע.</div>`;
    return;
  }
  if (!c){ reportEl.innerHTML = `<div class="note">לא נמצאו נתונים עבור חברה זו.</div>`; return; }

  const nameMain = c.names[0];
  const tierKey = mode === 'full' ? tierOfFull(c).key : c.tier;
  const tierLabel = mode === 'full' ? tierOfFull(c).label : TIER_LABELS[c.tier];

  let stats;
  try { stats = await fetchMarketStats(); } catch(e) { stats = { total: '—', active: '—', buyers: '—' }; }

  let allRes;
  try { allRes = await fetchAll(); } catch(e) { allRes = { mode, data: [] }; }

  const activeCard = mode === 'full'
    ? (c.is_active || c.gap_flag ? `
        <div class="card ${!c.is_active && c.gap_flag ? 'gap' : ''}">
          <span class="badge">${c.is_active ? 'מועד סיום מאושר מתקרב' : 'אין רישום פומבי חדש יותר'}</span>
          <dl class="factgrid">
            <div class="fact"><dt>גורם מזמין אחרון</dt><dd>${c.latest_buyer || '—'}</dd></div>
            <div class="fact"><dt>${c.is_active ? 'תום תקופה מאושרת' : 'תום התקופה האחרונה שנמצאה'}</dt><dd class="ltr">${fmtDate(c.latest_end_obj)}</dd></div>
            <div class="fact"><dt>מנגנון אחרון</dt><dd>${c.latest_mechanism || '—'}</dd></div>
            <div class="fact"><dt>מספר הליך</dt><dd class="ltr">${c.latest_proc_id || '—'}</dd></div>
          </dl>
        </div>` : '')
    : (c.is_active || c.gap_flag ? `
        <div class="card ${!c.is_active && c.gap_flag ? 'gap' : ''}">
          <span class="badge">${c.is_active ? 'מועד סיום מאושר מתקרב' : 'אין רישום פומבי חדש יותר'}</span>
          <dl class="factgrid">
            <div class="fact"><dt>גורם מזמין אחרון</dt><dd><span class="redact-bar" style="width:100px"></span></dd></div>
            <div class="fact"><dt>${c.is_active ? 'תום תקופה מאושרת' : 'תום התקופה האחרונה שנמצאה'}</dt><dd><span class="redact-bar" style="width:80px"></span></dd></div>
            <div class="fact"><dt>מנגנון אחרון</dt><dd><span class="redact-bar" style="width:120px"></span></dd></div>
            <div class="fact"><dt>מספר הליך</dt><dd><span class="redact-bar" style="width:70px"></span></dd></div>
          </dl>
          <button class="eye-cta" style="margin-top:14px" data-action="focus-auth" aria-label="לחצו לצפייה בפרטים המלאים"><span class="eye-icon">👁</span>לחצו לצפייה בפרטים המלאים</button>
        </div>` : '');

  const timelineBlock = mode === 'full'
    ? `<div class="timeline" style="margin-top:20px">${c.records.slice(-5).reverse().map(r => `
        <div class="tl-item ${r === c.records[c.records.length-1] ? 'flag' : ''}">
          <div class="tl-date ltr">${fmtShortDate(r.pub_date_obj)}</div>
          <div class="tl-buyer">${r.buyer || '—'}</div>
          <div class="tl-desc">${r.title || ''}</div>
          <div class="tl-meta">
            <span class="pill">${r.mechanism || '—'}</span>
            ${fmtAmount(r.amount) ? `<span class="pill amt">${fmtAmount(r.amount)}</span>` : ''}
          </div>
        </div>`).join('')}</div>
       ${c.full_count > c.record_count ? `<div class="timeline-note">מוצגים ${c.record_count} מתוך ${c.full_count} רישומים פומביים שנמצאו.</div>` : ''}`
    : `<div class="timeline redacted-timeline" style="margin-top:20px">
        ${[0,1,2].map(() => `
          <div class="tl-item">
            <div class="tl-date"><span class="redact-bar" style="width:52px"></span></div>
            <div class="tl-buyer"><span class="redact-bar" style="width:140px"></span></div>
            <div class="tl-desc"><span class="redact-bar" style="width:200px"></span></div>
          </div>`).join('')}
        <button class="eye-cta" data-action="focus-auth" aria-label="לחצו לצפייה בציר הזמן המלא"><span class="eye-icon">👁</span>${c.full_count} רישומים פומביים — לחצו לצפייה בציר הזמן המלא</button>
      </div>`;

  reportEl.innerHTML = `
    ${isShowcase ? `<div class="showcase-banner">📊 דוגמה להמחשה — הנתונים (תאריכים, סכומים, דפוסי חתימה) מבוססים על חברה אמיתית במאגר, אך שם החברה וכל גורם מזמין הוחלפו בתווית בדויה. כך נראה דוח מלא לאחר התחברות.</div>` : ''}
    <div class="report-meta">
      <div>
        <h2>${nameMain}</h2>
        <div class="subline">${isShowcase ? `${c.full_count} רישומים פומביים (מבוסס על חברה אמיתית)` : `ח.פ. <span class="ltr">${c.id}</span> · ${c.full_count} רישומים פומביים`} · ${c.year_min}–${c.year_max}</div>
      </div>
      <div class="report-actions">
        <button class="icon-btn" id="btn-print">🖨 שמירה כ-PDF</button>
        <button class="icon-btn" id="btn-share">🔗 שיתוף קישור</button>
      </div>
    </div>
    <div class="stat-strip">
      <div class="stat stat-clickable" data-action="open-quadrant-lightbox"><b class="ltr">${stats.active}</b><span>חברות עם התקשרות פעילה כרגע</span></div>
      <div class="stat stat-clickable" data-action="open-quadrant-lightbox"><b class="ltr">${stats.buyers}</b><span>גורמים ממשלתיים שונים במעקב</span></div>
      <div class="stat stat-clickable" data-action="open-quadrant-lightbox"><b class="ltr">${stats.total}</b><span>חברות ${(DOMAINS.find(d => d.key === currentCategory()) || {}).label || ''} שזוהו במאגר</span></div>
    </div>
    <section>
      <div class="section-label">הזדמנויות שאנחנו עוקבים אחריהן עכשיו</div>
      ${renderOpportunities(allRes.mode, allRes.data, mode === 'full' ? c : null)}
    </section>
    <section id="quad-section">
      <div class="section-label">מפת השחקנים בתחום</div>
      ${renderQuadrant(allRes.mode, allRes.data, c.id)}
    </section>
    <section>
      <div class="section-label">פרופיל החברה</div>
      <div class="tier-badge ${tierKey}">${tierLabel} · פעילים מאז ${c.year_min}</div>
      ${activeCard}
      <div class="note" style="margin-top:14px"><strong>זה לא תחזית ודאית — זה אומדן מבוסס דפוס.</strong> ${mode === 'full' ? buildNarrativeFull(c) : buildNarrativeTeaser(c)}</div>
      ${timelineBlock}
    </section>
    <section class="pilot" id="pilot-form">
      <h3>הצטרפו למנוי</h3>
      <div class="promo-badge"><span class="dot2"></span>מחיר השקה — בתוקף עד ${fmtDate(PROMO_DEADLINE.toISOString().slice(0,10))} (עוד ${promoDaysLeft()} ימים)</div>
      <p>זו רק דוגמה אחת שנוצרה אוטומטית. במנוי אנחנו עוקבים באופן אישי ורציף אחרי הקטגוריה והגורמים המזמינים שרלוונטיים לכם, ומתריעים לפני שהזדמנות הופכת למכרז גלוי.</p>
      <div class="plans" id="plans">
        ${PLANS.map((p, i) => `
          <div class="plan ${i===0 ? 'selected' : ''}" data-plan="${p.key}">
            <div class="plan-name">${p.name}</div>
            <div class="plan-desc">${p.desc}</div>
            <div class="plan-price">
              <span class="now ltr">₪${promoPrice(p.regular)}</span>
              <span class="was ltr">₪${p.regular}</span>
            </div>
            <div class="plan-cadence">לחודש · חיוב שנתי · לאחר תקופת ההשקה: ₪${p.regular}/חודש</div>
          </div>`).join('')}
      </div>
      <div class="pilot-form">
        <input id="p-name" type="text" placeholder="שם מלא" value="">
        <input id="p-email" type="email" placeholder="אימייל">
        <input id="p-phone" type="tel" placeholder="טלפון">
        <button id="p-submit">המשך לתשלום ולהרשמה</button>
      </div>
      <p class="pilot-note">התשלום מאובטח ומתבצע דרך Stripe. מנוי שנתי, ניתן לביטול כל עוד לא עברתם את תקופת ההתחייבות שמצוינת בתנאים.</p>
    </section>
  `;

  let selectedPlan = PLANS[0].key;
  [...document.querySelectorAll('.plan')].forEach(el => {
    el.onclick = () => { selectedPlan = el.dataset.plan; document.querySelectorAll('.plan').forEach(p => p.classList.toggle('selected', p === el)); };
  });
  document.getElementById('btn-print').onclick = () => window.print();
  document.getElementById('btn-share').onclick = async () => {
    const url = new URL(location.href);
    url.searchParams.set('c', c.id);
    url.searchParams.set('cat', currentCategory());
    const shareData = { title: `תדרוך ${nameMain}`, text: `תדרוך מודיעין ציבורי עבור ${nameMain}`, url: url.toString() };
    try { if (navigator.share) await navigator.share(shareData); else { await navigator.clipboard.writeText(url.toString()); alert('הקישור הועתק'); } } catch(e) {}
  };
  wireQuadrantTooltip(document.getElementById('quad-section'), allRes.mode);
  wireFocusAuthTriggers(reportEl);
  wireShowcaseOppClicks(reportEl);
  // scoped to the whole report, not just #quad-section — the clickable stat cards this wires
  // (data-action="open-quadrant-lightbox") live in the sibling .stat-strip above it, a
  // pre-existing bug that happened to never surface: the old empty-state landing had its own
  // separately-wired stat cards that a plain `document.querySelector` always found first in
  // tests, masking this narrower container never actually catching a click on the report's own.
  wireQuadrantLightbox(reportEl, allRes.mode, allRes.data, c.id);
  document.getElementById('p-name').value = localStorage.getItem('ti_name') || '';
  document.getElementById('p-email').value = localStorage.getItem('ti_email') || session?.user?.email || '';
  document.getElementById('p-phone').value = localStorage.getItem('ti_phone') || '';
  document.getElementById('p-submit').onclick = () => {
    const name = document.getElementById('p-name').value.trim();
    const email = document.getElementById('p-email').value.trim();
    const phone = document.getElementById('p-phone').value.trim();
    try {
      localStorage.setItem('ti_name', name);
      localStorage.setItem('ti_email', email);
      localStorage.setItem('ti_phone', phone);
      localStorage.setItem('ti_plan', selectedPlan);
    } catch(e) {}
    const link = STRIPE_LINKS[selectedPlan];
    if (link && link.startsWith('http')){
      const u = new URL(link);
      if (email) u.searchParams.set('prefilled_email', email);
      location.href = u.toString();
    } else {
      alert('טופס התשלום עדיין לא מחובר — פרטיכם נשמרו, ניצור קשר לסגירת ההרשמה.');
    }
  };
}

// ---------- search wiring ----------
function showCompany(id, name){
  document.getElementById('q').value = name || '';
  renderReport(id);
}
function doSearch(){
  const q = document.getElementById('q').value;
  const results = search(q);
  if (results.length === 1 && results[0].s >= 70){
    showCompany(results[0].c.id, results[0].c.names[0]);
    return;
  }
  if (results.length === 0){
    currentReportId = null;
    document.getElementById('empty').hidden = true;
    document.getElementById('report').hidden = true;
    document.getElementById('suggest').hidden = true;
    document.getElementById('nomatch').hidden = false;
    document.getElementById('nm-name').value = q;
    document.querySelector('.search-wrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  const box = document.getElementById('suggest');
  box.innerHTML = results.map(r => `<button data-id="${r.c.id}" data-name="${r.c.names[0]}">${r.c.names[0]} <span class="id ltr">${r.c.id}</span></button>`).join('');
  box.hidden = false;
  [...box.querySelectorAll('button')].forEach(btn => { btn.onclick = () => showCompany(btn.dataset.id, btn.dataset.name); });
}

// ---------- auth ----------
function renderAuthState(){
  const status = document.getElementById('account-status');
  if (session){
    status.hidden = false;
    document.getElementById('auth-user-email').textContent = session.user.email || '';
    document.getElementById('auth-modal').hidden = true; // close the modal on successful sign-in
  } else {
    status.hidden = true;
  }
}
function openAuthModal(){
  document.getElementById('auth-modal').hidden = false;
  document.getElementById('auth-email')?.focus();
}
function closeAuthModal(){ document.getElementById('auth-modal').hidden = true; }

function wireAuth(){
  document.getElementById('auth-submit').onclick = async () => {
    const email = document.getElementById('auth-email').value.trim();
    if (!email) return;
    document.getElementById('auth-submit').disabled = true;
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.href.split('#')[0] } });
    document.getElementById('auth-submit').disabled = false;
    if (error){ alert('שגיאה בשליחת הקישור: ' + error.message); return; }
    document.getElementById('auth-sent-email').textContent = email;
    document.getElementById('auth-sent').hidden = false;
  };
  document.getElementById('auth-signout').onclick = async () => { await sb.auth.signOut(); };
  document.getElementById('auth-modal-close').onclick = closeAuthModal;
  document.getElementById('auth-modal').addEventListener('click', (e) => { if (e.target.id === 'auth-modal') closeAuthModal(); });
  document.getElementById('quadrant-lightbox-close').onclick = closeQuadrantLightbox;
  document.getElementById('quadrant-lightbox').addEventListener('click', (e) => { if (e.target.id === 'quadrant-lightbox') closeQuadrantLightbox(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape'){ closeAuthModal(); closeQuadrantLightbox(); } });
  sb.auth.onAuthStateChange(async (_event, newSession) => {
    session = newSession;
    renderAuthState();
    if (session){
      // reconcile server vs local scope: server wins if it exists (it's what the digest
      // pipeline reads), otherwise push whatever local scope exists up as this account's
      // first server-side scope.
      const serverScope = await loadServerScope();
      if (serverScope){ SCOPE = serverScope; saveScope(SCOPE); }
      else if (SCOPE){ await saveServerScope(SCOPE); }
      if (SCOPE) await syncFeedScopeFromAccount();
    }
    // re-render whatever's currently on screen with the new auth level
    if (currentReportId) renderReport(currentReportId);
    else renderCurrentPage();
  });
}

// shared by every render path: any element marked data-action="focus-auth" opens the sign-in
// popup instead of scrolling to a static box — the popup only appears at the moment someone
// actually tries to unlock something, per the "shouldn't be a wall of text up front" feedback.
function wireFocusAuthTriggers(container){
  [...container.querySelectorAll('[data-action="focus-auth"]')].forEach(el => { el.onclick = openAuthModal; });
}
// showcase opportunity cards are clickable — they open the same full anonymized report as the
// showcase chips, so this section carries real, followable substance, not just a badge.
function wireShowcaseOppClicks(container){
  [...container.querySelectorAll('.showcase-opp')].forEach(el => {
    el.onclick = () => showCompany(el.dataset.id, el.dataset.name);
  });
}

// ---------- empty state ----------
async function renderEmptyState(){
  // symmetric with renderReport's own `#empty.hidden = true` — without this, once any report
  // had ever been viewed, #empty stayed hidden forever (nothing previously un-hid it, since the
  // app never had a real "back to feed" path before the new nav tab added one).
  currentPage = 'feed';
  document.getElementById('empty').hidden = false;
  document.getElementById('market-map').hidden = true;
  document.getElementById('dossier').hidden = true;
  document.getElementById('showcase-chips').innerHTML = SHOWCASE.map(d =>
    `<button class="showcase-chip" data-id="${d.id}" data-name="${d.names[0]}">📊 ${d.names[0]}</button>`
  ).join('');
  [...document.querySelectorAll('.showcase-chip')].forEach(btn => { btn.onclick = () => showCompany(btn.dataset.id, btn.dataset.name); });

  const inScope = NAME_INDEX.filter(c => c.category === currentCategory());
  const active = inScope.filter(c => c.is_active);
  const pool = active.filter(c => c.expiring_soon).length >= 5 ? active.filter(c => c.expiring_soon) : active;
  const shown = [];
  const copy = [...pool];
  while (shown.length < 5 && copy.length){ shown.push(copy.splice(Math.floor(Math.random()*copy.length), 1)[0]); }
  document.getElementById('examples').innerHTML = shown.map(c => `<button class="example-chip" data-id="${c.id}" data-name="${c.names[0]}">${c.names[0]}</button>`).join('');
  [...document.querySelectorAll('.example-chip')].forEach(btn => { btn.onclick = () => showCompany(btn.dataset.id, btn.dataset.name); });

  let openTenders; try { openTenders = await fetchOpenTenders(); } catch(e) { openTenders = []; }
  document.getElementById('open-tenders').innerHTML = renderOpenTenders(openTenders);
  const lastVisit = session ? await loadServerLastVisit() : loadLastVisitLocal();
  const newSinceLastVisit = lastVisit ? openTenders.filter(t => t.first_seen > lastVisit).length : 0;
  const newBadge = document.getElementById('new-tenders-badge');
  if (newBadge){
    newBadge.hidden = newSinceLastVisit === 0;
    newBadge.textContent = newSinceLastVisit > 0 ? `🆕 ${newSinceLastVisit} חדשים מאז הביקור האחרון` : '';
  }
  const todayIso = TODAY.toISOString().slice(0, 10);
  if (session) await saveServerLastVisit(todayIso); else saveLastVisitLocal(todayIso);

  await renderFeed();
  wireFocusAuthTriggers(document.getElementById('empty'));
}

// ---------- quadrant lightbox ----------
function openQuadrantLightbox(mode, all, highlightId){
  const content = document.getElementById('quadrant-lightbox-content');
  content.innerHTML = renderQuadrant(mode, all, highlightId);
  wireQuadrantTooltip(content, mode);
  document.getElementById('quadrant-lightbox').hidden = false;
}
function closeQuadrantLightbox(){ document.getElementById('quadrant-lightbox').hidden = true; }
function wireQuadrantLightbox(container, mode, all, highlightId){
  [...container.querySelectorAll('[data-action="open-quadrant-lightbox"]')].forEach(el => {
    el.onclick = () => openQuadrantLightbox(mode, all, highlightId);
  });
}

// ---------- account scope <-> feed scope sync ----------
// The account-level SCOPE (single category, drives onboarding/digest) and the feed's own
// browsing filter (feedApplied, multi-category, localStorage-only — see below) are separate by
// design. Whenever SCOPE itself changes (first-run submit, sign-in reconciliation), the feed
// filter is force-reset to match it — otherwise a stale feed-level filter from a previous
// session/category would silently survive an explicit account-scope change.
function deriveFeedScopeFromAccountScope(){
  const s = SCOPE || DEFAULT_SCOPE;
  return {
    cats: [s.category],
    dists: s.includeNational ? ['ארצי'].concat(s.districts) : s.districts.slice(),
    sizes: s.dealSizes.slice(),
  };
}
async function syncFeedScopeFromAccount(){
  feedApplied = deriveFeedScopeFromAccountScope();
  saveFeedScope(feedApplied);
}

// ---------- first-run onboarding, full page (design "1b — editorial split") ----------
// Categories are multi-select on this screen (the live panel previews the combined match
// count as you pick several), but the rest of the app is single-category throughout —
// SCOPE.category and the server-side user_scopes.category column are both a scalar, not an
// array (confirmed against schema.sql/add_user_scopes.sql before building this). On submit,
// only the FIRST selected category becomes the real, persisted SCOPE; the rest are dropped.
// True multi-category persistence (schema migration + digest pipeline + magic-quadrant
// rework) is tracked as roadmap tech debt, not solved in this pass.
const FR_DISTS = ['ארצי', ...DISTRICTS];
let frRows = null; // companies_teaser rows across every onboarding domain, fetched once
let frState = { cats: [], dists: [], sizes: [] };
let frShown = { count: 0, target: null };
let frRaf = null;

async function loadFrRows(){
  if (frRows) return frRows;
  const { data, error } = await sb.from('companies_teaser').select('*').in('category', DOMAINS.map(d => d.key));
  frRows = error ? [] : (data || []);
  return frRows;
}

// Real "opportunities matching this scope" — reuses the same classifyOpportunityTeaser
// definition already used for the "כמה מהחוזים שאנחנו עוקבים אחריהם עכשיו" section, and the
// same regions/has_national_buyer/dealsize_bucket fields applyScope() already relies on.
// Unlike the design mock's placeholder weighted-multiplication estimate (which shows 0 until
// all three steps are filled), an empty district/size selection here means "unrestricted" —
// consistent with applyScope()'s real semantics elsewhere in this file, and more useful: the
// count becomes real the moment a single category is picked, then narrows as you add filters.
function frMatches(sel, { ignoreSizes } = {}){
  if (!sel.cats.length || !frRows) return [];
  const realDists = sel.dists.filter(d => d !== 'ארצי');
  const includeNational = sel.dists.includes('ארצי');
  return frRows.filter(c => {
    if (!sel.cats.includes(c.category)) return false;
    if (classifyOpportunityTeaser(c) === null) return false;
    const districtOk = realDists.length === 0
      || (c.regions || []).some(r => realDists.includes(r))
      || (includeNational && c.has_national_buyer);
    const dealOk = ignoreSizes || !c.dealsize_bucket || sel.sizes.length === 0 || sel.sizes.includes(c.dealsize_bucket);
    return districtOk && dealOk;
  });
}

// The design shows a real, animated ₪ median contract value here — but anonymous visitors
// only ever get a 1-4 size-quartile bucket (companies_teaser.dealsize_bucket), never a real
// amount (schema.sql deliberately withholds it to avoid leaking an exact company's contract
// value). Rather than fabricate a ₪ figure, this shows the most common real bucket among
// matching companies — honest, and computable with zero new backend work. Deliberately
// ignores the size-step selection itself so it stays informative even after narrowing.
function frDominantSizeLabel(sel){
  const rows = frMatches(sel, { ignoreSizes: true });
  const counts = {};
  rows.forEach(c => { if (c.dealsize_bucket) counts[c.dealsize_bucket] = (counts[c.dealsize_bucket] || 0) + 1; });
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  if (!top) return '—';
  const opt = DEALSIZE_OPTIONS.find(o => o.bucket === parseInt(top[0], 10));
  return opt ? opt.label : '—';
}

// Eases the live count toward its new target instead of snapping, same tween pattern as the
// design source (om-cta/tweenB) — a small, cheap, real fidelity touch, not decoration.
function frTween(){
  const target = frMatches(frState).length;
  if (frShown.target === target) return;
  frShown.target = target;
  cancelAnimationFrame(frRaf);
  const from = frShown.count || 0, start = performance.now(), dur = 560;
  const step = now => {
    const p = Math.min(1, (now - start) / dur), eased = 1 - Math.pow(1 - p, 3);
    frShown.count = from + (target - from) * eased;
    const el = document.getElementById('fr-count');
    if (el) el.textContent = Math.round(frShown.count).toLocaleString('en-US');
    if (p < 1) frRaf = requestAnimationFrame(step);
  };
  frRaf = requestAnimationFrame(step);
}

function frStatus(){
  if (!frState.cats.length) return { ready: false, hint: 'בחרו קטגוריה אחת לפחות כדי להמשיך' };
  if (!frState.dists.length) return { ready: false, hint: 'הוסיפו אזור אחד לפחות' };
  if (!frState.sizes.length) return { ready: false, hint: 'סמנו גודל עסקה אחד לפחות' };
  return { ready: true, hint: 'ניתן לשנות בכל עת מההגדרות' };
}

function frToggle(field, val){
  const cur = frState[field];
  frState[field] = cur.includes(val) ? cur.filter(x => x !== val) : cur.concat([val]);
  renderFirstRun();
}

function renderFirstRun(){
  document.getElementById('fr-cats').innerHTML = DOMAINS.map(d => {
    const on = frState.cats.includes(d.key);
    return `<button type="button" class="fr-chip cat${on ? ' on' : ''}" data-field="cats" data-val="${d.key}">${d.label}</button>`;
  }).join('');
  document.getElementById('fr-dists').innerHTML = FR_DISTS.map(dst => {
    const on = frState.dists.includes(dst);
    return `<button type="button" class="fr-chip dist${on ? ' on' : ''}" data-field="dists" data-val="${dst}">${dst}</button>`;
  }).join('');
  document.getElementById('fr-sizes').innerHTML = DEALSIZE_OPTIONS.map(o => {
    const on = frState.sizes.includes(o.bucket);
    return `<button type="button" class="fr-row${on ? ' on' : ''}" data-field="sizes" data-val="${o.bucket}">
      <span class="fr-row-left"><span class="fr-dot"></span><span class="fr-row-label">${o.label}</span></span>
    </button>`;
  }).join('');

  document.getElementById('fr-step-dists').classList.toggle('fr-locked', frState.cats.length === 0);
  document.getElementById('fr-step-sizes').classList.toggle('fr-locked', frState.cats.length === 0 || frState.dists.length === 0);

  const st = frStatus();
  frTween();
  document.getElementById('fr-count-label').textContent = st.ready ? 'הזדמנויות פתוחות תואמות' : 'ההיקף יתעדכן ככל שתבחרו';
  const doneSteps = [frState.cats.length > 0, frState.dists.length > 0, frState.sizes.length > 0];
  document.getElementById('fr-meter').innerHTML = doneSteps.map(done => `<span class="fr-meter-bar${done ? ' on' : ''}"></span>`).join('');
  document.getElementById('fr-median').textContent = frState.cats.length ? frDominantSizeLabel(frState) : '—';

  const groups = [
    { title: 'קטגוריות', items: DOMAINS.filter(d => frState.cats.includes(d.key)).map(d => d.label) },
    { title: 'אזור', items: frState.dists.slice() },
    { title: 'גודל עסקה', items: DEALSIZE_OPTIONS.filter(o => frState.sizes.includes(o.bucket)).map(o => o.label) },
  ];
  document.getElementById('fr-summary').innerHTML = groups.map(g => `
    <div>
      <div class="fr-summary-title">${g.title}</div>
      <div class="fr-summary-items">${g.items.length
        ? g.items.map(l => `<span class="fr-pill">${l}</span>`).join('')
        : '<span class="fr-pill-empty">עדיין לא נבחר</span>'}</div>
    </div>`).join('');

  const cta = document.getElementById('fr-cta');
  cta.disabled = !st.ready;
  document.getElementById('fr-hint').textContent = frState.cats.length > 1
    ? `נתחיל מ״${DOMAINS.find(d => d.key === frState.cats[0]).label}״ — מעקב על כמה קטגוריות בו-זמנית בדרך`
    : st.hint;
}

function wireFirstRun(){
  document.getElementById('onboarding-firstrun').addEventListener('click', e => {
    const btn = e.target.closest('[data-field]');
    if (!btn) return;
    const field = btn.dataset.field;
    const val = field === 'sizes' ? parseInt(btn.dataset.val, 10) : btn.dataset.val;
    frToggle(field, val);
  });
  document.getElementById('fr-cta').onclick = async () => {
    if (!frStatus().ready) return;
    const realDists = frState.dists.filter(d => d !== 'ארצי');
    SCOPE = {
      category: frState.cats[0],
      districts: realDists,
      includeNational: frState.dists.includes('ארצי'),
      dealSizes: frState.sizes.slice(),
    };
    saveScope(SCOPE);
    if (session) await saveServerScope(SCOPE);
    document.getElementById('onboarding-firstrun').hidden = true;
    document.getElementById('app-shell').hidden = false;
    await syncFeedScopeFromAccount();
    renderEmptyState();
  };
}

// ---------- opportunity feed (design "Opportunity Feed") ----------
// 'free' (signed-in, not paying) is a real, fully-built tier below — exercised directly in
// tests — but not reachable via real session state yet: Cardcom payment collection is still
// deferred, so is_paying is never wired to a real event. No existing signed-in user loses
// access because of this redesign; every signed-in session is treated as 'sub' until that
// ships for real (see ROADMAP.md).
function computeAccessTier(){ return !session ? 'anon' : 'sub'; }

function fmtDots(iso){
  if (!iso) return '';
  const [y,m,d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

// Derived "signal strength" (ביטחון) — NOT a calibrated probability, just an honest continuous
// score built from the exact same flags classifyOpportunityFull/Teaser already use for their
// high/medium badge. Full mode adds a continuous proximity bonus from real days_to_end/gap-age;
// teaser mode deliberately withholds that (see classifyOpportunityTeaser's own comment: no exact
// day count for anonymous visitors) — a smoothly-varying number would let an anonymous visitor
// binary-search the exact day count for a specific third-party company.
function opportunityConfidence(c, mode, opp){
  let s = opp.level === 'high' ? 70 : 40;
  if (mode === 'full'){
    const recentGap = c.gap_flag && c.latest_end_obj && daysSince(c.latest_end_obj) <= 730;
    const soon = c.is_active && c.days_to_end != null && c.days_to_end <= 150;
    if (soon) s += Math.round(30 * (150 - c.days_to_end) / 150);
    else if (recentGap) s += Math.round(30 * (1 - Math.min(1, daysSince(c.latest_end_obj) / 730)));
  }
  if (c.final_option_flag) s += 15;
  if (c.short_ext_flag) s += 10;
  return Math.max(0, Math.min(100, s));
}
// Real record amount, floored the same as the quadrant median (companyDomainStatsFull) —
// government data carries literal "1" placeholders for undisclosed amounts.
function opportunityValue(c){
  const n = parseFloat(c.latest_amount);
  return (!isNaN(n) && n >= 1000) ? n : null;
}
function opportunityWindow(c, mode){
  const soon = mode === 'full' ? (c.is_active && c.days_to_end != null) : c.expiring_soon;
  if (mode === 'full' && soon) return `בעוד כ-${c.days_to_end} ימים`;
  if (soon) return 'מתקרב לסיום';
  if (c.gap_flag) return mode === 'full' ? `הסתיים ב-${fmtDate(c.latest_end_obj)}` : 'ללא רישום המשך פומבי';
  return '—';
}
// Full mode: real dated stages from the company's own latest record — genuine milestones, not
// fabricated. Teaser mode gets null (rendered as a plain, unlabeled proportion bar) — exact
// dates for a named third-party company are exactly what classifyOpportunityTeaser exists to
// keep from anonymous visitors; showing them here would undo that.
function opportunityTrack(c, mode){
  if (mode !== 'full' || !c.records || !c.records.length) return null;
  const latest = c.records.find(r => r.proc_id === c.latest_proc_id) || c.records[c.records.length - 1];
  const stages = [];
  if (latest.pub_date_obj) stages.push({ label: 'פורסם', date: fmtDots(latest.pub_date_obj), kind: 'neutral' });
  if (latest.start_obj) stages.push({ label: 'תחילת תקופה', date: fmtDots(latest.start_obj), kind: 'neutral' });
  if (latest.end_obj) stages.push({ label: 'מסתיים', date: fmtDots(latest.end_obj), kind: c.is_active ? 'amber' : 'neutral' });
  return stages.length ? stages : null;
}

// The feed's own multi-category browsing filter — separate from the account-level SCOPE
// (single-category, drives onboarding/digest — see ROADMAP.md's multi-category tech debt).
// This is a page-level, localStorage-only preference: broadening it to several categories here
// never changes what digest emails or the account's saved scope are keyed to.
const FEED_SCOPE_KEY = 'ti_feed_scope';
function loadFeedScope(){
  try {
    const raw = localStorage.getItem(FEED_SCOPE_KEY);
    if (raw) return JSON.parse(raw);
  } catch(e) {}
  return deriveFeedScopeFromAccountScope();
}
function saveFeedScope(fs){ try { localStorage.setItem(FEED_SCOPE_KEY, JSON.stringify(fs)); } catch(e) {} }

let feedApplied = loadFeedScope();
let feedDraft = null;
let feedRows = null;
let feedRowsMode = null;
let feedSort = 'conf';
let feedBand = 'all';
let feedHighConf = false;
let feedShown = { count: 0, target: null };
let feedRaf = null;

const FEED_BANDS = [
  { k: 'all', label: 'כל הטווחים', test: () => true },
  { k: 's', label: 'עד ₪100K', test: n => n < 100000 },
  { k: 'm', label: '₪100K–1M', test: n => n >= 100000 && n < 1000000 },
  { k: 'l', label: '₪1M ומעלה', test: n => n >= 1000000 },
];

async function loadFeedRows(){
  const wantMode = session ? 'full' : 'teaser';
  if (feedRows && feedRowsMode === wantMode) return feedRows;
  const table = wantMode === 'full' ? 'companies' : 'companies_teaser';
  const { data, error } = await sb.from(table).select('*').in('category', DOMAINS.map(d => d.key));
  feedRows = error ? [] : (data || []);
  feedRowsMode = wantMode;
  return feedRows;
}

function feedInScope(o, sel){
  if (!sel.cats.includes(o.category)) return false;
  const realDists = sel.dists.filter(d => d !== 'ארצי');
  const includeNational = sel.dists.includes('ארצי');
  const districtOk = realDists.length === 0
    || (o.regions || []).some(r => realDists.includes(r))
    || (includeNational && o.has_national_buyer);
  const dealOk = !o.dealsize_bucket || sel.sizes.length === 0 || sel.sizes.includes(o.dealsize_bucket);
  return districtOk && dealOk;
}

function feedDominantSizeLabel(rows){
  const counts = {};
  rows.forEach(c => { if (c.dealsize_bucket) counts[c.dealsize_bucket] = (counts[c.dealsize_bucket] || 0) + 1; });
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  if (!top) return '—';
  const opt = DEALSIZE_OPTIONS.find(o => o.bucket === parseInt(top[0], 10));
  return opt ? opt.label : '—';
}

function buildOpportunities(mode, rows, sel){
  const classify = mode === 'full' ? classifyOpportunityFull : classifyOpportunityTeaser;
  return rows.filter(c => feedInScope(c, sel)).map(c => {
    const opp = classify(c);
    if (!opp) return null;
    const domainLabel = (DOMAINS.find(d => d.key === c.category) || {}).label || c.category;
    return {
      id: c.id, category: c.category,
      name: mode === 'full' ? (c.latest_buyer || (c.buyers && c.buyers[0]) || 'גורם ממשלתי') : `הזדמנות בתחום ${domainLabel}`,
      holder: mode === 'full' ? c.names[0] : null,
      stage: opp.badge, stageKind: opp.level === 'high' ? 'amber' : 'neutral', gapFlag: !!c.gap_flag,
      conf: opportunityConfidence(c, mode, opp),
      value: mode === 'full' ? opportunityValue(c) : null,
      window: opportunityWindow(c, mode),
      region: c.has_national_buyer ? ('ארצי' + ((c.regions || []).length ? ' · ' + c.regions[0] : '')) : ((c.regions || [])[0] || 'לא משויך לאזור'),
      track: opportunityTrack(c, mode),
      why: mode === 'full' ? opp.why : null,
      daysToEnd: mode === 'full' ? c.days_to_end : null,
    };
  }).filter(Boolean);
}

function feedSortFns(){
  return {
    conf: (a, b) => b.conf - a.conf,
    value: (a, b) => (b.value || 0) - (a.value || 0),
    recent: (a, b) => {
      if (a.daysToEnd != null && b.daysToEnd != null) return a.daysToEnd - b.daysToEnd;
      if (a.daysToEnd != null) return -1;
      if (b.daysToEnd != null) return 1;
      return b.conf - a.conf;
    },
  };
}

function feedTween(target){
  if (feedShown.target === target) return;
  feedShown.target = target;
  cancelAnimationFrame(feedRaf);
  const from = feedShown.count || 0, start = performance.now(), dur = 520;
  const step = now => {
    const p = Math.min(1, (now - start) / dur), eased = 1 - Math.pow(1 - p, 3);
    feedShown.count = from + (target - from) * eased;
    const el = document.getElementById('feed-shown-count');
    if (el) el.textContent = Math.round(feedShown.count).toLocaleString('en-US');
    if (p < 1) feedRaf = requestAnimationFrame(step);
  };
  feedRaf = requestAnimationFrame(step);
}

function renderFeedCard(o){
  const borderClass = o.gapFlag ? 'gap' : (o.stageKind === 'amber' ? 'amber' : 'neutral');
  const stageClass = o.stageKind === 'amber' ? 'feed-stage amber' : 'feed-stage';
  const holderHtml = o.holder ? `<span class="feed-holder-name">${o.holder}</span>` : `<span class="feed-shimmer"></span>`;
  const valueHtml = o.value != null
    ? `<span class="feed-value">${shekelShort(o.value)}</span>`
    : (o.holder ? `<span class="feed-value">—</span>` : `<span class="feed-shimmer value"></span>`);
  const track = o.track && o.track.length ? o.track : [{ kind: 'neutral-light' }, { kind: 'neutral-light' }, { kind: 'neutral-light' }];
  const trackTone = { amber: 'var(--signal)', neutral: 'var(--ink-soft)', 'neutral-light': 'var(--line)' };
  const barsHtml = track.map(() => '').map((_, i) => `<span class="feed-track-bar" style="flex:1 1 0;background:${trackTone[track[i].kind] || 'var(--line)'}"></span>`).join('');
  const labsHtml = (o.track && o.track.length)
    ? o.track.map(t => `<span class="feed-track-lab" style="flex:1 1 0"><span class="feed-track-labtext${t.kind === 'amber' ? ' amber' : ''}">${t.label}</span><span class="feed-track-date${t.kind === 'amber' ? ' amber' : ''}">${t.date}</span></span>`).join('')
    : '';
  const confColor = o.conf >= 70 ? 'var(--accent2)' : 'var(--ink-soft)';
  const whyHtml = o.why ? `<div class="feed-why"><span class="feed-why-label">WHY</span><span class="feed-why-text">${o.why}</span></div>` : '';
  return `<div class="feed-card ${borderClass}" data-id="${o.id}">
    <div class="feed-card-top">
      <div class="feed-card-top-left">
        <span class="${stageClass}">${o.stage}</span>
        <span class="feed-code">${o.id}</span>
      </div>
      <span class="feed-region">${o.region}</span>
    </div>
    <h2>${o.name}</h2>
    <div class="feed-holder-row"><span>ספק מחזיק</span>${holderHtml}</div>
    <div class="feed-track">
      <div class="feed-track-bars">${barsHtml}</div>
      ${labsHtml ? `<div class="feed-track-labs">${labsHtml}</div>` : ''}
    </div>
    <div class="feed-card-bottom">
      <div class="feed-card-metrics">
        <div><div class="feed-metric-label">שווי מוערך</div>${valueHtml}</div>
        <div><div class="feed-metric-label">ביטחון</div><div class="feed-conf-row"><span class="feed-conf-track"><span class="feed-conf-bar" style="width:${o.conf}%;background:${confColor}"></span></span><span class="feed-conf-val">${o.conf}%</span></div></div>
        <div><div class="feed-metric-label">חלון פעולה</div><span class="feed-window">${o.window}</span></div>
      </div>
      <div class="feed-card-actions">
        <button type="button" class="feed-btn-secondary" data-action="feed-track" data-id="${o.id}">עקבו</button>
        <button type="button" class="feed-btn-primary" data-action="feed-open" data-id="${o.id}" data-name="${o.holder || ''}">${o.holder ? 'פתחו דוסייה' : 'פתחו בחינם'}</button>
      </div>
    </div>
    ${whyHtml}
  </div>`;
}

function wireFeedCards(list){
  document.getElementById('feed-cards').onclick = e => {
    const trackBtn = e.target.closest('[data-action="feed-track"]');
    if (trackBtn){ if (!session) openAuthModal(); return; } // real watchlist tracking isn't built yet (Tier 2) — a stub for signed-in users, not a fake success state
    const card = e.target.closest('.feed-card');
    if (!card) return;
    // opens the real single-opportunity dossier for anyone, anon included — the dossier itself
    // handles anon-appropriate locked fields, same as the card already does, rather than
    // blocking anon visitors from ever seeing that page at all.
    const idx = list.findIndex(o => o.id === card.dataset.id);
    if (idx > -1) openDossier(list, idx);
  };
}

function renderFeedRadar(list, totalRows){
  const hiN = list.filter(o => o.conf >= 75).length;
  const avgConf = list.length ? Math.round(list.reduce((n, o) => n + o.conf, 0) / list.length) : 0;
  const rows = [
    { label: 'בהיקף שבחרתם', value: list.length.toLocaleString('en-US'), pct: totalRows ? list.length / totalRows * 100 : 0, color: 'var(--accent)' },
    { label: 'ביטחון 75%+', value: hiN.toLocaleString('en-US'), pct: list.length ? hiN / list.length * 100 : 0, color: 'var(--accent2)' },
    { label: 'ביטחון ממוצע', value: avgConf + '%', pct: avgConf, color: 'var(--accent2)' },
  ];
  return rows.map(r => `<div><div class="feed-radar-row-head"><span class="feed-radar-label">${r.label}</span><span class="feed-radar-val">${r.value}</span></div><span class="feed-radar-track"><span class="feed-radar-bar" style="width:${Math.round(r.pct)}%;background:${r.color}"></span></span></div>`).join('');
}
function renderFeedBreakdown(list){
  const tones = { s: '#93a3b8', m: 'var(--signal)', l: '#8a6a1f' };
  const rows = FEED_BANDS.filter(b => b.k !== 'all').map(b => ({
    label: b.label, n: list.filter(o => b.test(o.value || 0)).length, color: tones[b.k],
  })).concat([
    { label: 'ארצי / לא משויך לאזור', n: list.filter(o => o.region.startsWith('ארצי') || o.region === 'לא משויך לאזור').length, color: 'var(--accent)' },
    { label: 'משויך למחוז', n: list.filter(o => !(o.region.startsWith('ארצי') || o.region === 'לא משויך לאזור')).length, color: 'var(--accent2)' },
  ]);
  return rows.map(r => `<div class="feed-break-row"><span class="feed-break-dot" style="background:${r.color}"></span><span class="feed-break-label">${r.label}</span><span class="feed-break-n">${r.n}</span></div>`).join('');
}

// ---------- scope-editing sheet: slides down from the sticky bar, animated ----------
function feedSheetStatus(){
  if (!feedDraft.cats.length || !feedDraft.dists.length || !feedDraft.sizes.length){
    return { ready: false, hint: 'בחרו לפחות קטגוריה, אזור וגודל עסקה אחד' };
  }
  return { ready: true, hint: 'ההיקף יישמר לדפדפן שלכם ויחול על הפיד' };
}
function renderFeedSheet(){
  document.getElementById('feed-sheet-cats').innerHTML = DOMAINS.map(d => {
    const on = feedDraft.cats.includes(d.key);
    return `<button type="button" class="fr-chip cat${on ? ' on' : ''}" data-field="cats" data-val="${d.key}">${d.label}</button>`;
  }).join('');
  document.getElementById('feed-sheet-dists').innerHTML = FR_DISTS.map(dst => {
    const on = feedDraft.dists.includes(dst);
    return `<button type="button" class="fr-chip dist${on ? ' on' : ''}" data-field="dists" data-val="${dst}">${dst}</button>`;
  }).join('');
  document.getElementById('feed-sheet-sizes').innerHTML = DEALSIZE_OPTIONS.map(o => {
    const on = feedDraft.sizes.includes(o.bucket);
    return `<button type="button" class="fr-row${on ? ' on' : ''}" data-field="sizes" data-val="${o.bucket}">
      <span class="fr-row-left"><span class="fr-dot"></span><span class="fr-row-label">${o.label}</span></span>
    </button>`;
  }).join('');
  const draftRows = (feedRows || []).filter(c => feedInScope(c, feedDraft) && (feedRowsMode === 'full' ? classifyOpportunityFull(c) : classifyOpportunityTeaser(c)));
  document.getElementById('feed-sheet-count').textContent = draftRows.length.toLocaleString('en-US');
  document.getElementById('feed-sheet-median').textContent = feedDominantSizeLabel(draftRows);
  const st = feedSheetStatus();
  document.getElementById('feed-sheet-hint').textContent = st.hint;
  document.getElementById('feed-sheet-apply').disabled = !st.ready;
}
function openFeedSheet(){
  feedDraft = { cats: feedApplied.cats.slice(), dists: feedApplied.dists.slice(), sizes: feedApplied.sizes.slice() };
  renderFeedSheet();
  document.getElementById('feed-sheet-overlay').classList.add('open');
  document.getElementById('feed-sheet').classList.add('open');
}
function closeFeedSheet(){
  document.getElementById('feed-sheet-overlay').classList.remove('open');
  document.getElementById('feed-sheet').classList.remove('open');
}
function wireFeedSheet(){
  document.getElementById('feed-sheet-overlay').onclick = closeFeedSheet;
  document.getElementById('feed-sheet-cancel').onclick = closeFeedSheet;
  document.getElementById('feed-sheet').onclick = e => {
    const btn = e.target.closest('[data-field]');
    if (!btn) return;
    const field = btn.dataset.field;
    const val = field === 'sizes' ? parseInt(btn.dataset.val, 10) : btn.dataset.val;
    const cur = feedDraft[field];
    feedDraft[field] = cur.includes(val) ? cur.filter(x => x !== val) : cur.concat([val]);
    renderFeedSheet();
  };
  document.getElementById('feed-sheet-apply').onclick = async () => {
    if (!feedSheetStatus().ready) return;
    feedApplied = { cats: feedDraft.cats.slice(), dists: feedDraft.dists.slice(), sizes: feedDraft.sizes.slice() };
    saveFeedScope(feedApplied);
    closeFeedSheet();
    await renderCurrentPage(); // the sheet is shared chrome — re-render whichever page is active
  };
  document.getElementById('feed-scope-change').onclick = openFeedSheet;
}

// ---------- shared chrome: nav tabs + scope pills (both feed and market-map pages use this) ----------
let currentPage = 'feed'; // 'feed' | 'market'
const NAV_TABS = ['הזדמנויות', 'מפת שוק', 'מעקב', 'הגדרות'];
const NAV_REAL = [true, true, false, false]; // מעקב/הגדרות are visually present, inert placeholders (Tier 2 items, not built)

function renderChrome(activeTab, feedCount){
  document.getElementById('feed-nav-tabs').innerHTML = NAV_TABS.map((label, i) => {
    const count = i === 0 ? feedCount : null;
    return `<button type="button" class="feed-nav-tab${i === activeTab ? ' on' : ''}" data-tab="${i}"${NAV_REAL[i] ? '' : ' disabled title="בקרוב"'}>${label}${count != null ? `<span class="feed-nav-badge">${count}</span>` : ''}</button>`;
  }).join('');
  // "הזדמנויות" must stay clickable even while active — it doubles as the one way back to the
  // feed from a report view (no other real nav to it exists otherwise).
  const feedTab = document.querySelector('#feed-nav-tabs [data-tab="0"]');
  if (feedTab) feedTab.onclick = goToFeed;
  const mapTab = document.querySelector('#feed-nav-tabs [data-tab="1"]');
  if (mapTab) mapTab.onclick = goToMarketMap;

  const catLabels = DOMAINS.filter(d => feedApplied.cats.includes(d.key)).map(d => d.label);
  const sizeLabels = DEALSIZE_OPTIONS.filter(o => feedApplied.sizes.includes(o.bucket)).map(o => o.label);
  const pills = [
    catLabels.length ? catLabels.join(' · ') : 'ללא קטגוריה',
    feedApplied.dists.length ? feedApplied.dists.join(' · ') : 'ללא אזור',
    feedApplied.sizes.length === 4 ? 'כל גדלי העסקה' : (sizeLabels.join(' · ') || 'ללא גודל עסקה'),
  ];
  document.getElementById('feed-scope-pills').innerHTML = pills.map(p => `<span class="feed-scope-pill">${p}</span>`).join('');
}
function renderCurrentPage(){
  if (currentPage === 'market') return renderMarketMapPage();
  if (currentPage === 'dossier') return renderDossierPage();
  return renderEmptyState();
}
function goToFeed(){
  currentReportId = null;
  document.getElementById('report').hidden = true;
  document.getElementById('nomatch').hidden = true;
  document.getElementById('market-map').hidden = true;
  document.getElementById('dossier').hidden = true;
  currentPage = 'feed';
  renderEmptyState();
}
function goToMarketMap(){
  currentReportId = null;
  document.getElementById('report').hidden = true;
  document.getElementById('nomatch').hidden = true;
  document.getElementById('empty').hidden = true;
  document.getElementById('dossier').hidden = true;
  currentPage = 'market';
  renderMarketMapPage();
}

async function renderFeed(){
  const access = computeAccessTier();
  const mode = access === 'anon' ? 'teaser' : 'full';
  await loadFeedRows();
  const allInScope = buildOpportunities(mode, feedRows, feedApplied);
  let list = allInScope.filter(o => FEED_BANDS.find(b => b.k === feedBand).test(o.value || 0));
  if (feedHighConf) list = list.filter(o => o.conf >= 75);
  const sortFns = feedSortFns();
  list = list.slice().sort(sortFns[feedSort] || sortFns.conf);

  const visible = access === 'anon' ? 3 : (access === 'free' ? 6 : Infinity);

  document.getElementById('feed-shown-count-lab').textContent = 'הזדמנויות תואמות';
  document.getElementById('feed-shown-median-lab').textContent = 'הטווח הנפוץ ביותר';
  feedTween(list.length);
  document.getElementById('feed-shown-median').textContent = feedDominantSizeLabel(feedRows.filter(c => feedInScope(c, feedApplied)));

  renderChrome(0, list.length);

  document.getElementById('feed-sorts').innerHTML = [
    { k: 'conf', l: 'ביטחון' }, { k: 'value', l: 'שווי' }, { k: 'recent', l: 'דחיפות' },
  ].map(s => `<button type="button" class="feed-sort-btn${feedSort === s.k ? ' on' : ''}" data-sort="${s.k}">${s.l}</button>`).join('');

  const bandChips = FEED_BANDS.map(b => {
    const n = allInScope.filter(o => b.test(o.value || 0)).length;
    const on = feedBand === b.k;
    return `<button type="button" class="feed-chip${on ? ' on' : ''}${!on && n === 0 ? ' dim' : ''}" data-band="${b.k}">${b.label}<span class="feed-chip-n">${n}</span></button>`;
  }).join('');
  const hiConfN = allInScope.filter(o => o.conf >= 75).length;
  document.getElementById('feed-stage-chips').innerHTML = bandChips
    + `<button type="button" class="feed-chip${feedHighConf ? ' on hiconf' : ''}" data-highconf="1">ביטחון 75% בלבד<span class="feed-chip-n">${hiConfN}</span></button>`;

  document.getElementById('feed-last-scan').textContent = `נסרק לאחרונה: ${fmtDots(TODAY.toISOString().slice(0, 10))} · מקור: רשומות פומביות בלבד`;

  const shown = list.slice(0, visible);
  document.getElementById('feed-cards').innerHTML = shown.map(renderFeedCard).join('');
  wireFeedCards(shown);

  const emptyEl = document.getElementById('feed-empty');
  emptyEl.hidden = list.length !== 0;
  const gate = document.getElementById('feed-gate');
  gate.hidden = true;
  if (access === 'anon' && list.length > 3){
    gate.hidden = false;
    document.getElementById('feed-gate-title').textContent = `עוד ${list.length - 3} הזדמנויות מחכות מעבר להרשמה`;
    document.getElementById('feed-gate-body').textContent = 'הרשמה חינמית פותחת את שם הספק המחזיק, השווי המוערך ונימוקי הזיהוי לכל ההזדמנויות בהיקף שבחרתם.';
    const cta = document.getElementById('feed-gate-cta'); cta.textContent = 'הרשמו בחינם'; cta.onclick = openAuthModal;
  } else if (access === 'free' && list.length > 6){
    gate.hidden = false;
    document.getElementById('feed-gate-title').textContent = `המנוי פותח את כל ${list.length} ההזדמנויות בהיקף שלכם`;
    document.getElementById('feed-gate-body').textContent = 'חשבון חינמי מציג שש התאמות. מנוי מוסיף התראות שבועיות, יומן שינויים והשוואה היסטורית לכל ההזדמנויות.';
    const cta = document.getElementById('feed-gate-cta'); cta.textContent = 'ראו מסלולים'; cta.onclick = () => {};
  }

  document.getElementById('feed-empty-reset').onclick = () => { feedBand = 'all'; feedHighConf = false; renderFeed(); };
  [...document.querySelectorAll('#feed-stage-chips [data-band]')].forEach(b => { b.onclick = () => { feedBand = b.dataset.band; renderFeed(); }; });
  const hc = document.querySelector('#feed-stage-chips [data-highconf]');
  if (hc) hc.onclick = () => { feedHighConf = !feedHighConf; renderFeed(); };
  [...document.querySelectorAll('#feed-sorts [data-sort]')].forEach(b => { b.onclick = () => { feedSort = b.dataset.sort; renderFeed(); }; });

  document.getElementById('feed-radar').innerHTML = renderFeedRadar(list, feedRows.length);
  document.getElementById('feed-breakdown').innerHTML = renderFeedBreakdown(list);
  document.getElementById('feed-changelog-note').textContent = 'נצפה פעם אחת בלבד. אין עדיין תמונת מצב קודמת להשוואה, ולכן לא מוצג יומן שינויים — הוא ייפתח אוטומטית לאחר הסריקה הבאה.';
}

// ---------- market map (design "Market Map") ----------
// Full mode: real continuous percentile positions from real summed/median amounts — a genuine,
// richer replacement for companyDomainStatsFull's own volume metric (record COUNT); this uses
// real cumulative ₪ across all of a company's records instead, which is what the design's own
// axis label ("היקף מצטבר של התקשרויות ציבוריות") actually means.
//
// Teaser mode deliberately does NOT use continuous positions or a name-ranked leaderboard, even
// though the literal design shows both unconditionally for every access tier. renderQuadrant's
// existing teaser branch already established why showing every company's exact relative market
// position to anonymous mass-browsing would give away the same competitive intelligence a signup
// is meant to unlock — this reuses that exact bucket+jitter approach (volume_bucket/
// dealsize_bucket + hashStr jitter), not a laxer new one, and drops the leaderboard for anon
// entirely (exact ₪ rankings, even unnamed, are more than the teaser tier reveals anywhere else).
//
// The design's "אתם כאן" (you are here) marker is dropped entirely, full stop, for both tiers —
// there is no real signal anywhere in this app for "which company is the current visitor" (no
// such field is ever captured at signup), and fabricating a fixed position would be exactly the
// kind of invented data point this project has avoided everywhere else.
let mmTier = 'all';
let mmGapOnly = false;
let mmQuery = '';
let mmHover = null;
let mmSel = null;

function buildMarketMapRows(mode, rows, sel){
  const scoped = rows.filter(c => feedInScope(c, sel));
  const out = [];
  let skipped = 0;
  for (const c of scoped){
    if (mode === 'full'){
      const amounts = (c.records || []).map(r => parseFloat(r.amount)).filter(n => !isNaN(n) && n >= 1000);
      if (!amounts.length){ skipped++; continue; }
      out.push({
        id: c.id, category: c.category, name: c.names[0], buyers: (c.buyers || []).length,
        latestBuyer: c.latest_buyer, mech: c.latest_mechanism, records: c.full_count || amounts.length,
        years: c.year_min && c.year_max ? `${c.year_min}–${c.year_max}` : '—',
        gap: !!c.gap_flag, shortExt: !!c.short_ext_flag, finalOption: !!c.final_option_flag,
        active: !!c.is_active, vol: amounts.reduce((a, b) => a + b, 0), deal: median(amounts),
        tier: tierOfFull(c).key,
      });
    } else {
      if (!c.volume_bucket || !c.dealsize_bucket){ skipped++; continue; }
      out.push({
        id: c.id, category: c.category, name: (c.names || [])[0] || null, records: c.full_count,
        gap: !!c.gap_flag, active: !!c.is_active, tier: c.tier,
        volumeBucket: c.volume_bucket, dealsizeBucket: c.dealsize_bucket,
      });
    }
  }
  return { rows: out, skipped };
}
function mmRank(rows, key){
  const sorted = rows.slice().sort((a, b) => a[key] - b[key]);
  sorted.forEach((r, i) => { r[key + 'P'] = rows.length > 1 ? i / (rows.length - 1) : 0.5; });
}
function mmPosition(r, mode){
  if (mode === 'full') return { x: 4 + r.volP * 92, y: 96 - r.dealP * 92 };
  const jx = (hashStr(r.id + 'x') % 60) / 100, jy = (hashStr(r.id + 'y') % 60) / 100;
  return { x: 8 + (r.volumeBucket - 1) * 21 + jx * 15, y: 8 + (4 - r.dealsizeBucket) * 21 + jy * 15 };
}
function mmVisible(rows){
  return rows.filter(r => (mmTier === 'all' || r.tier === mmTier) && (!mmGapOnly || r.gap));
}

function renderMmTooltip(list, mode){
  const tip = document.getElementById('mm-tooltip');
  const row = list.find(r => r.id === (mmHover || mmSel));
  if (!row){ tip.hidden = true; return; }
  tip.hidden = false;
  const pos = mmPosition(row, mode);
  tip.style.left = pos.x + '%';
  tip.style.top = pos.y + '%';
  const anon = mode !== 'full';
  const rowsHtml = mode === 'full'
    ? [['היקף מצטבר', shekelShort(row.vol)], ['עסקה טיפוסית', shekelShort(row.deal)], ['גורמים מזמינים', row.buyers], ['רישומים', row.records]]
    : [['רבעון היקף', row.volumeBucket + '/4'], ['רבעון עסקה', row.dealsizeBucket + '/4'], ['רישומים פומביים', row.records]];
  tip.innerHTML = `<b>${anon ? 'חברה מזוהה במאגר' : row.name}</b>`
    + rowsHtml.map(([k, v]) => `<div class="mm-tooltip-row"><span>${k}</span><span>${v}</span></div>`).join('')
    + (anon ? `<div class="mm-tooltip-lock">🔒 שם החברה נפתח בהרשמה חינמית</div>` : '');
}

function renderMmPanel(allRows, mode){
  const panel = document.getElementById('mm-panel');
  const sel = allRows.find(r => r.id === mmSel);
  if (!sel){ panel.hidden = true; return; }
  panel.hidden = false;
  const anon = mode !== 'full';
  const tierColors = { leading: ['var(--accent-soft)', 'var(--accent)'], established: ['var(--signal-soft)', '#7d6019'], rising: ['var(--surface-2)', 'var(--ink-soft)'] };
  const [bg, fg] = tierColors[sel.tier];
  let factsHtml;
  if (mode === 'full'){
    factsHtml = [
      ['היקף מצטבר', shekelShort(sel.vol), true, '#8a6a1f'],
      ['עסקה טיפוסית', shekelShort(sel.deal), true, null],
      ['רישומים פומביים', sel.records, true, null],
      ['גורמים מזמינים', sel.buyers, true, null],
      ['טווח שנים', sel.years, true, null],
      ['גורם מזמין אחרון', sel.latestBuyer || '—', false, null],
      ['מנגנון אחרון', sel.mech || '—', false, null],
    ].map(([k, v, mono, color]) => `<div class="mm-fact-row"><span class="mm-fact-k">${k}</span><span class="mm-fact-v${mono ? '' : ' text'}"${color ? ` style="color:${color}"` : ''}>${v}</span></div>`).join('');
  } else {
    factsHtml = [
      ['רבעון היקף במגזר', sel.volumeBucket + ' מתוך 4'],
      ['רבעון עסקה טיפוסית', sel.dealsizeBucket + ' מתוך 4'],
      ['רישומים פומביים', sel.records],
    ].map(([k, v]) => `<div class="mm-fact-row"><span class="mm-fact-k">${k}</span><span class="mm-fact-v">${v}</span></div>`).join('')
      + `<div class="mm-fact-row"><span class="mm-fact-k">גורם מזמין אחרון</span><span class="mm-fact-v text">🔒 נפתח בהרשמה</span></div>`;
  }
  const flags = mode === 'full'
    ? [sel.gap && 'ללא רישום המשך', sel.shortExt && 'הארכה קצרה חריגה', sel.finalOption && 'אופציה אחרונה מופעלת'].filter(Boolean)
    : (sel.gap ? ['ללא רישום המשך'] : []);
  panel.innerHTML = `
    <div class="mm-panel-head">
      <div>
        <div class="mm-panel-eyebrow">חברה נבחרת</div>
        <div class="mm-panel-name">${anon ? 'חברה מזוהה במאגר' : sel.name}</div>
      </div>
      <span class="mm-panel-tier" style="background:${bg};color:${fg}">${TIER_LABELS[sel.tier]}</span>
    </div>
    <div>${factsHtml}</div>
    <div class="mm-flag${flags.length ? ' on' : ''}">${flags.length ? 'סימני חלון: ' + flags.join(' · ') : 'לא זוהו סימני חלון פעילים בחברה הזו.'}</div>
    <button type="button" class="mm-cta" id="mm-panel-cta">${anon ? 'פתחו את הפרופיל בחינם' : 'פתחו דוסייה מלא'}</button>
  `;
  document.getElementById('mm-panel-cta').onclick = () => { if (anon) openAuthModal(); else showCompany(sel.id, sel.name); };
}

function renderMmLeaders(list, mode){
  const box = document.getElementById('mm-leaders');
  if (mode !== 'full'){
    box.innerHTML = `<div class="mm-locked-note">התחברו לצפייה בעשירייה המובילה בהיקף — כולל שמות ומספרים מדויקים.</div>`;
    return;
  }
  const top = list.slice().sort((a, b) => b.vol - a.vol).slice(0, 10);
  box.innerHTML = top.map((r, i) => `
    <button type="button" class="mm-leader-row" data-id="${r.id}">
      <span class="mm-leader-rank">${String(i + 1).padStart(2, '0')}</span>
      <span class="mm-leader-name">${r.name}</span>
      <span class="mm-leader-vol">${shekelShort(r.vol)}</span>
    </button>`).join('');
  [...box.querySelectorAll('.mm-leader-row')].forEach(el => {
    el.onmouseenter = () => { mmHover = el.dataset.id; renderMarketMapPage(); };
    el.onmouseleave = () => { mmHover = null; renderMarketMapPage(); };
    el.onclick = () => { mmSel = el.dataset.id; renderMarketMapPage(); };
  });
}

async function renderMarketMapPage(){
  // symmetric with renderEmptyState's own #empty unhide (see that function's comment) — a
  // render function must be self-sufficient about its own container's visibility, not rely on
  // whichever caller happened to switch pages.
  currentPage = 'market';
  document.getElementById('market-map').hidden = false;
  document.getElementById('empty').hidden = true;
  document.getElementById('dossier').hidden = true;
  const access = computeAccessTier();
  const mode = access === 'anon' ? 'teaser' : 'full';
  await loadFeedRows();
  const { rows, skipped } = buildMarketMapRows(mode, feedRows, feedApplied);
  if (mode === 'full'){ mmRank(rows, 'vol'); mmRank(rows, 'deal'); }
  const list = mmVisible(rows);

  document.getElementById('feed-shown-count-lab').textContent = 'חברות במפה';
  document.getElementById('feed-shown-median-lab').textContent = 'שווי חוזה חציוני בשוק';
  feedTween(list.length);
  document.getElementById('feed-shown-median').textContent = mode === 'full'
    ? shekelShort(median(list.map(r => r.deal).filter(Boolean)))
    : feedDominantSizeLabel(feedRows.filter(c => feedInScope(c, feedApplied)));

  renderChrome(1, null);

  const tierChipDefs = [
    { k: 'all', label: 'כל השחקנים', n: rows.length, color: 'var(--accent)' },
    { k: 'leading', label: TIER_LABELS.leading, n: rows.filter(r => r.tier === 'leading').length, color: 'var(--accent)' },
    { k: 'established', label: TIER_LABELS.established, n: rows.filter(r => r.tier === 'established').length, color: 'var(--signal)' },
    { k: 'rising', label: TIER_LABELS.rising, n: rows.filter(r => r.tier === 'rising').length, color: 'var(--ink-soft)' },
  ];
  document.getElementById('mm-chips').innerHTML = tierChipDefs.map(t =>
    `<button type="button" class="feed-chip${mmTier === t.k ? ' on' : ''}" data-tier="${t.k}"${mmTier === t.k ? ` style="background:${t.color};border-color:${t.color}"` : ''}>${t.label}<span class="feed-chip-n">${t.n}</span></button>`
  ).join('')
    + `<span style="width:1px;height:22px;background:var(--line);margin:0 4px;display:inline-block"></span>`
    + `<button type="button" class="feed-chip${mmGapOnly ? ' on' : ''}" id="mm-gap-toggle"${mmGapOnly ? ' style="background:var(--danger);border-color:var(--danger)"' : ''}>הדגישו פערי המשך<span class="feed-chip-n">${rows.filter(r => r.gap).length}</span></button>`;
  [...document.querySelectorAll('#mm-chips [data-tier]')].forEach(b => { b.onclick = () => { mmTier = b.dataset.tier; renderMarketMapPage(); }; });
  document.getElementById('mm-gap-toggle').onclick = () => { mmGapOnly = !mmGapOnly; renderMarketMapPage(); };

  const q = mmQuery.trim();
  const hit = r => q && r.name && r.name.includes(q);
  const anyHit = q && list.some(hit);
  const tierColor = { leading: 'var(--accent)', established: 'var(--signal)', rising: 'var(--ink-soft)' };
  document.getElementById('mm-dots').innerHTML = list.map(r => {
    const on = mmHover === r.id || mmSel === r.id;
    const dim = (anyHit && !hit(r)) || (mmGapOnly && !r.gap);
    const size = Math.min(20, 8 + Math.sqrt(r.records || 1) * 2.2);
    const color = r.gap && mmGapOnly ? 'var(--danger)' : tierColor[r.tier];
    const pos = mmPosition(r, mode);
    const sz = on ? size * 1.5 : size;
    return `<span class="mm-dot" data-id="${r.id}" style="left:${pos.x}%;top:${pos.y}%;width:${sz}px;height:${sz}px;background:${color};opacity:${dim ? 0.16 : (on ? 1 : 0.78)};z-index:${on ? 6 : 3};box-shadow:${on ? '0 0 0 5px rgba(18,60,99,.14)' : 'none'}"></span>`;
  }).join('');
  [...document.querySelectorAll('#mm-dots .mm-dot')].forEach(el => {
    el.onmouseenter = () => { mmHover = el.dataset.id; renderMarketMapPage(); };
    el.onmouseleave = () => { mmHover = null; renderMarketMapPage(); };
    el.onclick = () => { mmSel = mmSel === el.dataset.id ? null : el.dataset.id; renderMarketMapPage(); };
  });
  renderMmTooltip(list, mode);

  document.getElementById('mm-legend').innerHTML = [
    { label: TIER_LABELS.leading, color: 'var(--accent)' },
    { label: TIER_LABELS.established, color: 'var(--signal)' },
    { label: TIER_LABELS.rising, color: 'var(--ink-soft)' },
  ].map(l => `<span class="mm-legend-item"><span class="mm-legend-sw" style="background:${l.color}"></span>${l.label}</span>`).join('');
  document.getElementById('mm-caption').textContent = mode === 'full'
    ? 'גודל הנקודה = מספר הרישומים הפומביים. מבוסס על רישומי פטור ממכרז בלבד — לא על כלל שוק הרכש.'
    : 'מיקום מבוסס על רבעון יחסי (לא מספרים מדויקים). התחברו לצפייה במיקום המדויק ובשמות.';

  const excludedEl = document.getElementById('mm-excluded');
  excludedEl.hidden = !skipped;
  if (skipped){
    document.getElementById('mm-excluded-text').textContent = `${skipped} חברות במאגר בהיקף שבחרתם אינן מוצגות במפה: לרישומים שלהן לא דווח סכום (או שדווח סכום דמה של ₪1). הן נשמרות בחיפוש ובדוחות — פשוט אין להן מקום אמיתי על הצירים.`;
  }

  document.getElementById('mm-search').oninput = e => { mmQuery = e.target.value; renderMarketMapPage(); };

  renderMmPanel(rows, mode);
  renderMmLeaders(list, mode);
}

// ---------- tender dossier (design "Tender Dossier") ----------
// Single-opportunity deep dive, reached by clicking a feed card. `dossierList` is a SNAPSHOT of
// the exact filtered/sorted opportunity list visible when the card was clicked, so prev/next
// page through what the user was actually browsing, not a separate, disconnected list.
//
// Same anon-safety discipline as the feed card and market map, extended here: the hero title
// reuses the SAME generic-vs-real `o.name` the card already showed (clicking through must not
// suddenly reveal what the card deliberately hid — that would undo the card's own point), the
// track stays an unlabeled bar for anon (no exact dates for a named third party), and several
// facts (supplier, latest buyer, mechanism, buyer count) are either deliberately locked or
// genuinely absent from `companies_teaser` in the first place — both render as the same
// sign-up prompt, since that's the accurate user-facing outcome either way.
let dossierList = [];
let dossierIndex = 0;
let dossierConfShown = 0;
let dossierConfRaf = null;

function openDossier(list, index){
  dossierList = list;
  dossierIndex = index;
  dossierConfShown = 0; // fresh dial tween target for whichever opportunity opens
  currentReportId = null;
  document.getElementById('report').hidden = true;
  document.getElementById('nomatch').hidden = true;
  document.getElementById('empty').hidden = true;
  document.getElementById('market-map').hidden = true;
  currentPage = 'dossier';
  renderDossierPage();
}
function dossierGoto(delta){
  const n = dossierList.length;
  if (!n) return;
  dossierIndex = (dossierIndex + delta + n) % n;
  dossierConfShown = 0;
  renderDossierPage();
}
// real, honest "next scan" date from the actual weekly cron schedule (Mondays), not a fabricated one
function nextMondayIso(){
  const d = new Date(TODAY);
  const day = d.getDay();
  d.setDate(d.getDate() + ((8 - day) % 7 || 7));
  return d.toISOString().slice(0, 10);
}
function dossierConfTween(target){
  cancelAnimationFrame(dossierConfRaf);
  const R = 28, circumference = Math.round(2 * Math.PI * R * 100) / 100;
  const from = dossierConfShown, start = performance.now(), dur = 700;
  const step = now => {
    const p = Math.min(1, (now - start) / dur), eased = 1 - Math.pow(1 - p, 3);
    dossierConfShown = from + (target - from) * eased;
    const fill = document.getElementById('ds-dial-fill');
    const text = document.getElementById('ds-dial-text');
    if (fill){ fill.style.strokeDasharray = circumference; fill.style.strokeDashoffset = circumference * (1 - dossierConfShown / 100); }
    if (text) text.textContent = Math.round(dossierConfShown) + '%';
    if (p < 1) dossierConfRaf = requestAnimationFrame(step);
  };
  dossierConfRaf = requestAnimationFrame(step);
}

async function renderDossierPage(){
  currentPage = 'dossier';
  document.getElementById('dossier').hidden = false;
  document.getElementById('empty').hidden = true;
  document.getElementById('market-map').hidden = true;
  document.getElementById('report').hidden = true;
  document.getElementById('nomatch').hidden = true;

  const access = computeAccessTier();
  const mode = access === 'anon' ? 'teaser' : 'full';
  const anon = mode !== 'full';
  const o = dossierList[dossierIndex];
  if (!o){ goToFeed(); return; }
  const c = feedRows.find(x => x.id === o.id) || {};
  const todayStr = fmtDots(TODAY.toISOString().slice(0, 10));

  renderChrome(0, dossierList.length);

  document.getElementById('ds-code').textContent = o.id;
  document.getElementById('ds-position').textContent = `${dossierIndex + 1} / ${dossierList.length}`;
  document.getElementById('ds-prev').disabled = dossierList.length < 2;
  document.getElementById('ds-next').disabled = dossierList.length < 2;

  document.getElementById('ds-stage').textContent = o.stage;
  document.getElementById('ds-region').textContent = o.region;
  document.getElementById('ds-updated').textContent = `עודכן: ${todayStr}`;
  document.getElementById('ds-name').textContent = o.name;

  const holderHtml = o.holder ? `<b>${o.holder}</b> ` : `<span class="feed-shimmer" style="width:190px;vertical-align:-.1em"></span> `;
  const headlineB = anon ? 'מחזיקה כרגע בהתקשרות בתחום זה.' : `מחזיקה כרגע בהתקשרות מול ${c.latest_buyer || 'הגורם המזמין'}.`;
  document.getElementById('ds-headline').innerHTML = holderHtml + `<span class="ds-headline-b">${headlineB}</span>`;

  dossierConfTween(o.conf);
  document.getElementById('ds-basis').textContent = mode === 'full'
    ? 'מבוסס על קרבה לתאריך סיום, פערי המשך ודפוסי אופציה בהיקף הקטגוריה.'
    : 'מבוסס על אותם סימנים, ברמת דיוק גסה יותר לפני הרשמה.';

  document.getElementById('ds-value').innerHTML = o.value != null
    ? `<span class="feed-value" style="font-size:1.32rem">${shekelShort(o.value)}</span>`
    : (o.holder ? `<span class="feed-value" style="font-size:1.32rem">—</span>` : `<span class="feed-shimmer value"></span>`);
  document.getElementById('ds-window').textContent = o.window;

  if (mode === 'full'){
    const vals = dossierList.map(x => x.value).filter(Boolean).sort((a, b) => a - b);
    const med = vals.length ? median(vals) : 0;
    const rel = med ? Math.round((o.value || 0) / med * 100) : null;
    document.getElementById('ds-rel').innerHTML = rel != null
      ? `<span style="font-family:'JetBrains Mono',monospace;font-weight:700;font-size:1.06rem;color:var(--accent);direction:ltr">${rel}%</span> <span style="font-size:.8rem;color:var(--ink-soft)">חציון ${shekelShort(med)}</span>`
      : `<span style="font-size:.84rem;color:var(--ink-soft)">אין די נתונים להשוואה</span>`;
  } else {
    document.getElementById('ds-rel').innerHTML = `<span style="font-size:.84rem;color:var(--ink-soft)">🔒 נפתח בהרשמה</span>`;
  }

  const track = o.track && o.track.length ? o.track : [{ kind: 'neutral-light' }, { kind: 'neutral-light' }, { kind: 'neutral-light' }];
  const trackTone = { amber: 'var(--signal)', neutral: 'var(--ink-soft)', 'neutral-light': 'var(--line)' };
  document.getElementById('ds-track-bars').innerHTML = track.map(t => `<span class="ds-track-bar" style="flex:1 1 0;background:${trackTone[t.kind] || 'var(--line)'}"></span>`).join('');
  document.getElementById('ds-track-labs').innerHTML = (o.track && o.track.length)
    ? o.track.map(t => `<span class="ds-track-lab" style="flex:1 1 0"><span class="ds-track-labtext${t.kind === 'amber' ? ' amber' : ''}">${t.label}</span><span class="ds-track-date">${t.date}</span></span>`).join('')
    : '';

  const signalsDefs = mode === 'full'
    ? [
        ['ללא רישום המשך', !!o.gapFlag, o.gapFlag ? 'כן' : 'לא'],
        ['חוזה פעיל כרגע', !c.is_active, c.is_active ? 'פעיל' : 'הסתיים'],
        ['ימים לפעולה', o.daysToEnd === 0, o.daysToEnd != null ? String(o.daysToEnd) : '—'],
        ['שלב בציר', (o.track || []).length >= 3, `${(o.track || []).length}/3`],
      ]
    : [
        ['ללא רישום המשך', !!o.gapFlag, o.gapFlag ? 'כן' : 'לא'],
        ['חוזה פעיל כרגע', !c.is_active, c.is_active ? 'פעיל' : 'הסתיים'],
        ['חלון פעולה', o.window !== '—', o.window],
      ];
  document.getElementById('ds-signals').innerHTML = signalsDefs.map(([label, on, val]) =>
    `<span class="ds-signal${on ? ' on' : ''}"><span class="ds-signal-dot"></span><span class="ds-signal-label">${label}</span><span class="ds-signal-val">${val}</span></span>`
  ).join('');

  const whyBody = anon
    ? `<div class="ds-why-lock"><span class="ds-why-lock-text">נימוקי הזיהוי ומספרי ההליך נפתחים בהרשמה חינמית.</span><button type="button" class="ds-why-lock-cta" id="ds-why-lock-cta">פתחו בחינם</button></div>`
    : `<p class="ds-why-body">${o.why || ''}</p><div class="ds-why-src"><span class="ds-why-src-label">SOURCE</span><span class="ds-why-src-val">${c.latest_proc_id || o.id}</span></div>`;
  document.getElementById('ds-why').innerHTML = `<div class="ds-why-card"><div class="ds-why-head"><span class="ds-why-num">01</span><span class="ds-why-title">${o.stage}</span></div>${whyBody}</div>`;
  const whyLockCta = document.getElementById('ds-why-lock-cta');
  if (whyLockCta) whyLockCta.onclick = openAuthModal;

  const tierKey = mode === 'full' ? (tierOfFull(c) || {}).key : c.tier;
  const domainLabel = (DOMAINS.find(d => d.key === c.category) || {}).label || c.category || '—';
  const locked = '🔒 נפתח בהרשמה';
  const yearsText = c.year_min && c.year_max ? `${c.year_min}–${c.year_max}` : '—';
  const factsDefs = mode === 'full'
    ? [
        ['ספק מחזיק', c.names ? c.names[0] : '—', false],
        ['גורם מזמין אחרון', c.latest_buyer || '—', false],
        ['מנגנון אחרון', c.latest_mechanism || '—', false],
        ['רישומים פומביים', c.full_count != null ? c.full_count : '—', true],
        ['גורמים מזמינים', (c.buyers || []).length, true],
        ['טווח שנים', yearsText, true],
        ['שכבת שוק', TIER_LABELS[tierKey] || '—', true],
        ['קטגוריה', domainLabel, true],
      ]
    : [
        ['ספק מחזיק', locked, false],
        ['גורם מזמין אחרון', locked, false],
        ['מנגנון אחרון', locked, false],
        ['רישומים פומביים', c.full_count != null ? c.full_count : '—', true],
        ['גורמים מזמינים', locked, false],
        ['טווח שנים', yearsText, true],
        ['שכבת שוק', TIER_LABELS[tierKey] || '—', true],
        ['קטגוריה', domainLabel, true],
      ];
  document.getElementById('ds-facts').innerHTML = factsDefs.map(([k, v, mono]) =>
    `<div class="ds-fact"><span class="ds-fact-k">${k}</span><span class="ds-fact-v${mono ? '' : ' text'}">${v}</span></div>`
  ).join('');

  document.getElementById('ds-scanline').textContent = `${todayStr} → ${fmtDots(nextMondayIso())}`;
  document.getElementById('ds-changenote').textContent = `ההזדמנות הזו נצפתה בסריקה אחת בלבד (${todayStr}), ולכן אין עדיין תמונת מצב קודמת להשוואה. הסריקה הבאה ב-${fmtDots(nextMondayIso())} תיצור את ההשוואה הראשונה — כל שינוי בסכום, בתאריכים או בשלב יופיע כאן כרשומה מתוארכת.`;

  document.getElementById('ds-missing').textContent = mode === 'full'
    ? 'עלות מסמכי ההשתתפות, ערבות הגשה נדרשת (אם יש), ותנאי סף מפורטים אינם זמינים ברישום הפומבי — רק בפרסום המכרז עצמו, אם וכשיפורסם.'
    : 'שם הספק, הגורם המזמין ותאריכים מדויקים נפתחים בהרשמה חינמית. עלות מסמכי השתתפות ותנאי סף אינם זמינים ברישום הפומבי בכל מקרה.';

  const cta = document.getElementById('ds-cta');
  cta.textContent = anon ? 'הרשמו בחינם לפתיחת הפרטים' : (access === 'free' ? 'שדרגו למנוי למעקב שוטף' : 'הדפיסו / שמרו כ-PDF');
  cta.classList.toggle('pulse', anon || access === 'free');
  cta.onclick = anon ? openAuthModal : (access === 'free' ? () => {} : () => window.print());
  document.getElementById('ds-track-btn').onclick = () => { if (!session) openAuthModal(); };
  document.getElementById('ds-share-btn').onclick = async () => {
    const url = new URL(location.href);
    url.searchParams.set('c', o.id);
    url.searchParams.set('cat', o.category);
    const shareData = { title: `תדרוך ${anon ? o.name : (o.holder || o.name)}`, url: url.toString() };
    try { if (navigator.share) await navigator.share(shareData); else { await navigator.clipboard.writeText(url.toString()); alert('הקישור הועתק'); } } catch(e) {}
  };
  document.getElementById('ds-prev').onclick = () => dossierGoto(-1);
  document.getElementById('ds-next').onclick = () => dossierGoto(1);
  document.getElementById('ds-back').onclick = e => { e.preventDefault(); goToFeed(); };
}

// ---------- init ----------
async function init(){
  const { data: { session: s } } = await sb.auth.getSession();
  session = s;
  renderAuthState();
  wireAuth();

  const idxRes = await fetch('name_index.json');
  NAME_INDEX = await idxRes.json();
  try {
    const scRes = await fetch('showcase.json');
    SHOWCASE = await scRes.json();
  } catch(e) { SHOWCASE = []; }

  document.getElementById('go').onclick = doSearch;
  document.getElementById('q').addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
  document.getElementById('q').addEventListener('input', () => {
    if (document.getElementById('q').value.trim().length < 2) document.getElementById('suggest').hidden = true;
  });
  document.addEventListener('click', e => { if (!e.target.closest('.search-wrap')) document.getElementById('suggest').hidden = true; });
  document.getElementById('nm-submit').onclick = () => {
    try {
      const leads = JSON.parse(localStorage.getItem('ti_leads') || '[]');
      leads.push({ name: document.getElementById('nm-name').value, contact: document.getElementById('nm-contact').value, at: new Date().toISOString() });
      localStorage.setItem('ti_leads', JSON.stringify(leads));
    } catch(e) {}
    document.getElementById('nm-thanks').hidden = false;
  };

  wireFeedSheet();

  const params = new URLSearchParams(location.search);
  const preId = params.get('c');
  const preCat = params.get('cat');

  if (preId){
    // a shared link carries its own category — honor it even if the visitor has a different
    // stored scope, defaulting the rest of that scope to sane values if this is a first visit.
    if (preCat){
      SCOPE = { ...(SCOPE || DEFAULT_SCOPE), category: preCat };
      saveScope(SCOPE);
    }
    await syncFeedScopeFromAccount();
    const entry = NAME_INDEX.find(x => x.id === preId && x.category === currentCategory());
    showCompany(preId, entry ? entry.names[0] : '');
  } else if (!SCOPE){
    // First-ever visit: the full-page editorial onboarding (design "1b").
    document.getElementById('app-shell').hidden = true;
    document.getElementById('onboarding-firstrun').hidden = false;
    await loadFrRows();
    wireFirstRun();
    renderFirstRun();
  } else {
    renderEmptyState();
  }
}

init();
