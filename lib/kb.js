'use strict';
// Knowledge base: built-in content (content/*.json), drop-in files
// (content/errors.d/*.json, committed to the repo) and entries added from the
// admin panel (stored in DATA_DIR/custom-errors.json). Later sources override
// earlier ones by slug, so the admin can also edit a built-in entry.

const fs = require('fs');
const path = require('path');
const store = require('./store');
const { normCode, parseNumber, hex8 } = require('./decode');

const ROOT = path.join(__dirname, '..');
const CONTENT = path.join(ROOT, 'content');

const readJson = (f, fb) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') console.warn(`[kb] ${f}: ${e.message}`); return fb; } };

const CATEGORIES = readJson(path.join(CONTENT, 'categories.json'), {});
const GUIDES = readJson(path.join(CONTENT, 'guides.json'), []);
const FAQ = readJson(path.join(CONTENT, 'faq.json'), []);
const BUILTIN = readJson(path.join(CONTENT, 'errors.json'), []);

function loadDropIns() {
  const dir = path.join(CONTENT, 'errors.d');
  const out = [];
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort(); } catch { return out; }
  for (const f of files) {
    const data = readJson(path.join(dir, f), null);
    if (!data) continue;
    for (const e of (Array.isArray(data) ? data : [data])) if (e && e.slug) out.push({ ...e, source: e.source || 'repo' });
  }
  return out;
}

const SEVERITIES = ['low', 'medium', 'high', 'critical'];
const SEV_RANK = { low: 0, medium: 1, high: 2, critical: 3 };
const FREQ_RANK = { rare: 0, uncommon: 1, common: 2, 'very-common': 3 };

let state = { list: [], bySlug: new Map(), byCode: new Map(), stopNames: [] };

function customDoc() { return store.load('custom-errors', { entries: {}, hidden: [] }); }

/** Fill defaults so an entry from any source renders safely. */
function normalizeEntry(e) {
  const arr = (v) => (Array.isArray(v) ? v.filter((x) => x !== null && x !== undefined && x !== '') : v ? [v] : []);
  const fixes = arr(e.fixes).map((f) => (typeof f === 'string' ? { title: f, detail: '', difficulty: 'easy', timeEstimate: '5-10 min' } : {
    title: String(f.title || 'Step'), detail: String(f.detail || ''), difficulty: ['easy', 'intermediate', 'advanced'].includes(f.difficulty) ? f.difficulty : 'easy',
    timeEstimate: String(f.timeEstimate || '5-10 min'), ...(f.riskNote ? { riskNote: String(f.riskNote) } : {}),
  }));
  return {
    slug: String(e.slug),
    title: String(e.title || e.slug),
    codes: arr(e.codes).map(String).length ? arr(e.codes).map(String) : [String(e.title || e.slug)],
    category: CATEGORIES[e.category] ? e.category : 'win32',
    severity: SEVERITIES.includes(e.severity) ? e.severity : 'medium',
    frequency: FREQ_RANK[e.frequency] !== undefined ? e.frequency : 'common',
    windowsVersions: arr(e.windowsVersions).length ? arr(e.windowsVersions).map(String) : ['Windows 10', 'Windows 11'],
    summary: String(e.summary || ''),
    meaning: String(e.meaning || ''),
    commonCauses: arr(e.commonCauses).map(String),
    fixes,
    prevention: arr(e.prevention).map(String),
    signals: arr(e.signals).map(String),
    relatedSlugs: arr(e.relatedSlugs).map(String),
    tags: arr(e.tags).map(String),
    ...(e.source ? { source: e.source } : {}),
    ...(e.status ? { status: e.status } : {}),
    ...(e.updatedAt ? { updatedAt: e.updatedAt } : {}),
    ...(e.autoDrafted ? { autoDrafted: true } : {}),
  };
}

function rebuild() {
  const merged = new Map();
  for (const e of BUILTIN) merged.set(e.slug, { ...e, source: 'builtin' });
  for (const e of loadDropIns()) merged.set(e.slug, e);
  const doc = customDoc();
  for (const e of Object.values(doc.entries || {})) merged.set(e.slug, { ...e, source: merged.has(e.slug) && merged.get(e.slug).source === 'builtin' ? 'override' : 'custom' });
  const hidden = new Set(doc.hidden || []);
  const all = [...merged.values()].map(normalizeEntry);
  const list = all.filter((e) => !hidden.has(e.slug) && e.status !== 'draft');
  const bySlug = new Map(list.map((e) => [e.slug, e]));
  const byCode = new Map();
  const add = (k, slug) => { const n = normCode(k); if (n && !byCode.has(n)) byCode.set(n, slug); };
  for (const e of list) {
    for (const c of e.codes) {
      add(c, e.slug);
      const num = parseNumber(c);
      if (num && num.form !== 'decimal') { add(hex8(num.value), e.slug); add(String(num.value | 0), e.slug); }
    }
    add(e.slug, e.slug);
  }
  for (const e of list) for (const id of e.relatedSlugs) if (!bySlug.has(id)) e.relatedSlugs = e.relatedSlugs.filter((x) => bySlug.has(x));
  const stopNames = [...byCode.keys()].filter((k) => /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(k));
  state = { list, all, bySlug, byCode, stopNames, hidden };
  return state;
}

function get(slug) { return state.bySlug.get(slug); }
function list() { return state.list; }
function allEntries() { return state.all; }

function stats() {
  const by = {};
  for (const e of state.list) by[e.category] = (by[e.category] || 0) + 1;
  const byCategory = Object.entries(by).map(([category, count]) => ({ category, count, label: CATEGORIES[category]?.label || category })).sort((a, b) => b.count - a.count);
  const bySeverity = { low: 0, medium: 0, high: 0, critical: 0 };
  for (const e of state.list) bySeverity[e.severity]++;
  return { total: state.list.length, categories: byCategory.length, guides: GUIDES.length, faq: FAQ.length, byCategory, bySeverity };
}

// ---------- search ----------
function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

const STOP = new Set('a an the and or of to in on for with my is it its i me windows win error code fix how what why does do when after this that keeps keep get got pc computer laptop'.split(' '));
function tokens(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9_\-x ]+/g, ' ').split(/\s+/).filter((t) => t.length > 1 && !STOP.has(t)); }

function queryKind(q) {
  const t = q.trim();
  if (/^0x[0-9a-f]+$/i.test(t) || /^[0-9a-f]{8}$/i.test(t) && /[a-f]/i.test(t)) return 'hex';
  if (/^-?\d+$/.test(t)) return 'decimal';
  if (/^[A-Za-z][A-Za-z0-9]*(_[A-Za-z0-9]+)+$/.test(t)) return 'stop-code';
  if (/^code\s*\d{1,2}$/i.test(t)) return 'device-code';
  return 'text';
}

/** Exact lookup by any code alias. */
function byCode(raw) {
  const q = String(raw || '').trim();
  if (!q) return null;
  let slug = state.byCode.get(normCode(q)) || state.byCode.get(normCode(q.replace(/\s+/g, '_')));
  if (!slug) { const num = parseNumber(q); if (num) slug = state.byCode.get(normCode(hex8(num.value))) || state.byCode.get(normCode('0x' + num.value.toString(16))); }
  return slug ? get(slug) : null;
}

function scoreEntry(e, toks, phrase) {
  let s = 0;
  const title = e.title.toLowerCase();
  const codes = e.codes.join(' ').toLowerCase();
  const tags = e.tags.join(' ').toLowerCase();
  const body = (e.summary + ' ' + e.meaning).toLowerCase();
  if (phrase && title.includes(phrase)) s += 12;
  if (phrase && codes.includes(phrase)) s += 14;
  for (const t of toks) {
    if (codes.includes(t)) s += 6;
    if (title.includes(t)) s += 5;
    if (tags.includes(t)) s += 4;
    if (body.includes(t)) s += 1.5;
    if (CATEGORIES[e.category]?.label.toLowerCase().includes(t)) s += 1;
  }
  return s;
}

function search(rawQ, { category, severity, limit = 20, offset = 0, sort } = {}) {
  const q = String(rawQ || '').trim().slice(0, 200);
  const kind = q ? queryKind(q) : 'text';
  let pool = state.list;
  if (category && CATEGORIES[category]) pool = pool.filter((e) => e.category === category);
  if (severity && SEVERITIES.includes(severity)) pool = pool.filter((e) => e.severity === severity);
  let items;
  let exact = null;
  let didYouMean = [];
  if (!q) {
    items = [...pool];
    if (sort === 'severity') items.sort((a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity]);
    else if (sort === 'az') items.sort((a, b) => a.title.localeCompare(b.title));
    else if (sort === 'common') items.sort((a, b) => FREQ_RANK[b.frequency] - FREQ_RANK[a.frequency]);
  } else {
    exact = byCode(q);
    const toks = tokens(q);
    const phrase = q.toLowerCase().length >= 3 ? q.toLowerCase() : '';
    let scored = pool.map((e) => ({ e, s: scoreEntry(e, toks, phrase) + (exact && exact.slug === e.slug ? 100 : 0) + FREQ_RANK[e.frequency] * 0.1 })).filter((x) => x.s > 0.5);
    scored.sort((a, b) => b.s - a.s);
    if (scored.length) { const top = scored[0].s; scored = scored.filter((x) => x.s >= Math.max(1.6, top * 0.3)); }
    items = scored.map((x) => x.e);
    if (exact && !pool.includes(exact)) items.unshift(exact);
    if (!items.length && (kind === 'stop-code' || kind === 'text')) {
      const n = q.toLowerCase().replace(/\s+/g, '_');
      didYouMean = state.stopNames.map((k) => ({ k, d: levenshtein(n, k) })).filter((x) => x.d <= Math.max(2, Math.floor(n.length / 5))).sort((a, b) => a.d - b.d).slice(0, 3).map((x) => get(state.byCode.get(x.k))).filter(Boolean);
    }
  }
  const total = items.length;
  return { query: q, isCodeQuery: kind !== 'text', kind, exact: exact ? exact.slug : null, total, items: items.slice(offset, offset + limit), didYouMean };
}

// ---------- triage ----------
const SIGNAL_LABELS = {
  'symptom:bsod': 'a blue screen', 'symptom:no-boot': 'Windows not starting', 'symptom:boot-loop': 'a restart loop', 'symptom:update-fail': 'failing updates',
  'symptom:app-crash': 'app or game crashes', 'symptom:slow': 'a slow system', 'symptom:freeze': 'freezes', 'symptom:device-error': 'device problems',
  'symptom:no-network': 'no internet', 'symptom:file-corrupt': 'corrupted files', 'symptom:activation-fail': 'activation errors', 'symptom:no-audio': 'no sound',
  'symptom:display-glitch': 'display glitches', 'symptom:driver-error': 'driver errors', 'symptom:store-fail': 'Store problems', 'symptom:permission-denied': 'access denied messages',
  'when:startup': 'at startup', 'when:shutdown': 'at shutdown', 'when:under-load': 'under heavy load', 'when:random': 'at random moments', 'when:during-update': 'during updates',
  'when:install': 'while installing something', 'when:gaming': 'while gaming', 'when:idle': 'while idle', 'when:sleep-wake': 'around sleep or wake',
  'change:windows-update': 'a Windows update', 'change:new-hardware': 'new hardware', 'change:new-software': 'new software', 'change:driver-update': 'a driver update',
  'change:power-event': 'a power cut or forced shutdown', 'change:overclock': 'overclocking or tuning', 'change:storage-full': 'a nearly full disk',
  'boot:yes': 'Windows still starts', 'boot:safe-mode': 'only Safe Mode works', 'boot:recovery': 'only recovery works', 'boot:no': 'Windows does not start',
};

function diagnose({ symptom, when, change, boot } = {}) {
  const want = { symptom, when, change, boot };
  const weights = { symptom: 4, when: 3, change: 2, boot: 1 };
  const out = [];
  for (const e of state.list) {
    const sig = new Set(e.signals);
    let score = 0;
    const reasons = [];
    if (symptom && sig.has('symptom:' + symptom)) { score += weights.symptom; reasons.push(`Fits your main symptom: ${SIGNAL_LABELS['symptom:' + symptom] || symptom}`); }
    if (when && sig.has('when:' + when)) { score += weights.when; reasons.push(`Usually shows up ${SIGNAL_LABELS['when:' + when] || when}`); }
    if (change && change !== 'none' && sig.has('change:' + change)) { score += weights.change; reasons.push(`Often triggered by ${SIGNAL_LABELS['change:' + change] || change}`); }
    if (boot && sig.has('boot:' + boot)) { score += weights.boot; reasons.push(`Matches your boot state: ${SIGNAL_LABELS['boot:' + boot] || boot}`); }
    if (!score || (symptom && !sig.has('symptom:' + symptom) && score < 5)) continue;
    out.push({ e, score, reasons });
  }
  out.sort((a, b) => b.score - a.score || SEV_RANK[b.e.severity] - SEV_RANK[a.e.severity] || FREQ_RANK[b.e.frequency] - FREQ_RANK[a.e.frequency]);
  const matches = out.slice(0, 5).map(({ e, score, reasons }) => ({ slug: e.slug, title: e.title, code: e.codes[0], category: e.category, severity: e.severity, frequency: e.frequency, summary: e.summary, firstFix: e.fixes[0]?.title || null, fixCount: e.fixes.length, riskiest: (e.fixes.find((f) => f.riskNote) || {}).title || null, score: Math.min(10, score), reasons }));
  const guidance = [];
  if (boot === 'no' || boot === 'recovery') guidance.push('Windows will not load normally, so start from the recovery environment: interrupt startup three times in a row (or boot from install media) to reach Advanced options.');
  if (boot === 'safe-mode') guidance.push('Safe Mode loads only core drivers. Most repairs below work from there, and a crash that disappears in Safe Mode points strongly at a third-party driver or app.');
  if (change === 'windows-update') guidance.push('Something broke right after an update: uninstalling that update is a reversible first move. Look in Settings > Windows Update > Update history.');
  if (change === 'driver-update') guidance.push('A recent driver change is the prime suspect. Device Manager > device > Properties > Driver > Roll Back Driver undoes it in a minute.');
  if (change === 'overclock') guidance.push('Return CPU, GPU and memory (XMP/EXPO) to stock settings before trying anything else. Unstable tuning imitates almost every hardware fault.');
  if (change === 'power-event') guidance.push('After a power cut, check the disk first: run `chkdsk C: /scan` and then `sfc /scannow` from an elevated prompt.');
  guidance.push('Write down the exact code or message before changing anything. It is the single most useful clue you have.');
  if (matches.some((m) => m.severity === 'high' || m.severity === 'critical')) guidance.push('At least one likely cause is serious. Back up your important files before you try fixes that touch disks, drivers or the registry.');
  const suggestedTool = matches.length ? 'plan' : 'lookup';
  return { matches, guidance, suggestedTool };
}

// ---------- log scanning ----------
function scan(text) {
  const t0 = Date.now();
  const src = String(text || '').slice(0, 20000);
  const cands = new Map();
  const addC = (raw, ctx) => { const k = raw.trim(); if (k && !cands.has(k.toLowerCase())) cands.set(k.toLowerCase(), { raw: k, ctx }); };
  // Skip one-digit hex like "0x3": in logs those are almost always bug check parameters.
  for (const m of src.matchAll(/\b0x[0-9a-f]{1,8}\b/gi)) if (!/^0x0*[0-9a-f]$/i.test(m[0]) || m[0].length >= 10) addC(m[0], 'hex');
  for (const m of src.matchAll(/\b[A-Z][A-Z0-9]{2,}(?:_[A-Z0-9]+){1,}\b/g)) addC(m[0], 'name');
  for (const m of src.matchAll(/\b(?:error|code|result|status|hr|exit code)[\s:=#]*(-?\d{1,10})\b/gi)) addC(m[1], 'contextual');
  for (const m of src.matchAll(/\bcode\s+(\d{1,2})\b/gi)) addC('Code ' + m[1], 'contextual');
  for (const m of src.matchAll(/\bevent\s*id[\s:]*(\d{1,5})\b/gi)) addC('Event ID ' + m[1], 'contextual');
  for (const m of src.matchAll(/\b(8007[0-9a-f]{4}|8024[0-9a-f]{4}|c[0-9a-f]{7})\b/gi)) addC(m[1], 'hex');
  const matches = [];
  const seen = new Map();
  const unmatched = [];
  for (const { raw, ctx } of cands.values()) {
    const e = byCode(raw) || (ctx !== 'name' && /^[0-9a-f]{8}$/i.test(raw) ? byCode('0x' + raw) : null);
    if (e) {
      if (seen.has(e.slug)) { seen.get(e.slug).hitCodes.push(raw); continue; }
      const m = { slug: e.slug, title: e.title, severity: e.severity, category: e.category, frequency: e.frequency, summary: e.summary, hitCodes: [raw], confidence: ctx === 'contextual' ? 'contextual' : 'exact' };
      seen.set(e.slug, m); matches.push(m);
    } else if (ctx !== 'contextual' || /^code|^event/i.test(raw)) {
      if (ctx === 'name' && !/_/.test(raw)) continue;
      unmatched.push(raw);
    }
  }
  // Keyword fallback when no codes are present at all
  if (!matches.length && !cands.size && src.trim().length > 20) {
    const r = search(src.slice(0, 200), { limit: 3 });
    for (const e of r.items) matches.push({ slug: e.slug, title: e.title, severity: e.severity, category: e.category, frequency: e.frequency, summary: e.summary, hitCodes: [], confidence: 'keyword' });
  }
  matches.sort((a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity]);
  return { ok: true, scanned: { chars: src.length, candidates: cands.size, durationMs: Date.now() - t0 }, matches, unmatched: unmatched.slice(0, 20) };
}

rebuild();

module.exports = { rebuild, get, list, allEntries, stats, search, byCode, diagnose, scan, normalizeEntry, customDoc, CATEGORIES, GUIDES, FAQ, SEVERITIES, SIGNAL_LABELS, BUILTIN };
