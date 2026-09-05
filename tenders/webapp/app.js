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
  wireQuadrantLightbox(document.getElementById('quad-section'), allRes.mode, allRes.data, c.id);
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
      if (SCOPE) renderScopeBar();
    }
    // re-render whatever's currently on screen with the new auth level
    if (currentReportId) renderReport(currentReportId);
    else renderEmptyState();
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

  let stats; try { stats = await fetchMarketStats(); } catch(e) { stats = { total: inScope.length, active: '—', buyers: '—' }; }
  const domainLabel = (DOMAINS.find(d => d.key === currentCategory()) || {}).label || '';
  document.getElementById('empty-stats').innerHTML = `
    <div class="stat stat-clickable" data-action="open-quadrant-lightbox"><b class="ltr">${stats.active}</b><span>חברות עם התקשרות פעילה כרגע</span></div>
    <div class="stat stat-clickable" data-action="open-quadrant-lightbox"><b class="ltr">${stats.buyers}</b><span>גורמים ממשלתיים שונים במעקב</span></div>
    <div class="stat stat-clickable" data-action="open-quadrant-lightbox"><b class="ltr">${stats.total}</b><span>חברות ${domainLabel} שזוהו במאגר</span></div>`;

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

  let allRes; try { allRes = await fetchAll(); } catch(e) { allRes = { mode: 'teaser', data: [] }; }
  document.getElementById('empty-opps').innerHTML = renderOpportunities(allRes.mode, allRes.data, null);
  document.getElementById('empty-share').innerHTML = renderQuadrant(allRes.mode, allRes.data, null);
  wireQuadrantTooltip(document.getElementById('empty-share'), allRes.mode);
  wireFocusAuthTriggers(document.getElementById('empty'));
  wireShowcaseOppClicks(document.getElementById('empty-opps'));
  wireQuadrantLightbox(document.getElementById('empty'), allRes.mode, allRes.data, null);
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

// ---------- onboarding UI ----------
// local, uncommitted selection state while the onboarding modal is open — copied into SCOPE
// (and persisted) only on submit, so closing without submitting doesn't half-apply a change.
let draft = null;

function renderOnboardingContent(){
  document.getElementById('domain-grid').innerHTML = DOMAINS.map(d =>
    `<button type="button" class="domain-card" data-key="${d.key}">${d.label}</button>`
  ).join('');
  document.getElementById('region-grid').innerHTML = DISTRICTS.map(r =>
    `<label class="onboarding-check"><input type="checkbox" value="${r}"><span>${r}</span></label>`
  ).join('');
  document.getElementById('dealsize-grid').innerHTML = DEALSIZE_OPTIONS.map(o =>
    `<label class="onboarding-check"><input type="checkbox" value="${o.bucket}" checked><span>${o.label}</span></label>`
  ).join('');
}

function syncOnboardingFromDraft(){
  [...document.querySelectorAll('#domain-grid .domain-card')].forEach(el => {
    el.classList.toggle('selected', el.dataset.key === draft.category);
  });
  [...document.querySelectorAll('#region-grid input')].forEach(el => {
    el.checked = draft.districts.includes(el.value);
  });
  document.getElementById('loc-national').checked = draft.includeNational;
  [...document.querySelectorAll('#dealsize-grid input')].forEach(el => {
    el.checked = draft.dealSizes.includes(parseInt(el.value, 10));
  });
}

function openOnboarding(){
  draft = { ...(SCOPE || DEFAULT_SCOPE) };
  syncOnboardingFromDraft();
  document.getElementById('onboarding-modal').hidden = false;
}
function closeOnboarding(){
  document.getElementById('onboarding-modal').hidden = true;
}

function scopeSummaryText(){
  const s = SCOPE || DEFAULT_SCOPE;
  const domainLabel = (DOMAINS.find(d => d.key === s.category) || {}).label || s.category;
  const locBits = [];
  if (s.includeNational) locBits.push('ארצי');
  if (s.districts.length) locBits.push(...s.districts);
  const locText = locBits.length ? locBits.join(', ') : 'כל הארץ';
  return `${domainLabel} · ${locText}`;
}
function renderScopeBar(){
  document.getElementById('scope-bar').hidden = false;
  document.getElementById('scope-summary').textContent = scopeSummaryText();
}

function wireOnboarding(){
  renderOnboardingContent();
  document.getElementById('domain-grid').addEventListener('click', e => {
    const btn = e.target.closest('.domain-card');
    if (!btn) return;
    draft.category = btn.dataset.key;
    syncOnboardingFromDraft();
  });
  document.getElementById('onboarding-close').onclick = closeOnboarding;
  document.getElementById('onboarding-modal').addEventListener('click', e => { if (e.target.id === 'onboarding-modal') closeOnboarding(); });
  document.getElementById('onboarding-submit').onclick = async () => {
    draft.includeNational = document.getElementById('loc-national').checked;
    draft.districts = [...document.querySelectorAll('#region-grid input:checked')].map(el => el.value);
    draft.dealSizes = [...document.querySelectorAll('#dealsize-grid input:checked')].map(el => parseInt(el.value, 10));
    SCOPE = draft;
    saveScope(SCOPE);
    if (session) await saveServerScope(SCOPE);
    closeOnboarding();
    renderScopeBar();
    currentReportId = null;
    document.getElementById('report').hidden = true;
    document.getElementById('nomatch').hidden = true;
    document.getElementById('q').value = '';
    renderEmptyState();
  };
  document.getElementById('scope-change').onclick = openOnboarding;
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

  wireOnboarding();

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
    renderScopeBar();
    const entry = NAME_INDEX.find(x => x.id === preId && x.category === currentCategory());
    showCompany(preId, entry ? entry.names[0] : '');
  } else if (!SCOPE){
    openOnboarding();
    renderEmptyState(); // empty state renders under the modal so it's ready once they submit
  } else {
    renderScopeBar();
    renderEmptyState();
  }
}

init();
