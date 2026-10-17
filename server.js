'use strict';
// WinMend server: zero dependencies, Node 18+.
//   PORT      (default 8080; the local start scripts use 8093)
//   DATA_DIR  (default /data; the local start scripts use ./data-local)

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const C = require('./lib/config');
const store = require('./lib/store');
const kb = require('./lib/kb');
const render = require('./lib/render');
const { anatomy, normCode } = require('./lib/decode');
const { draftEntry, slugify } = require('./lib/draft');
const importer = require('./lib/importer');
const scraper = require('./lib/scraper');
const assistant = require('./lib/assistant');
const zip = require('./lib/zip');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const VERSION = '1.0.0';

// ---------------- helpers ----------------
const MIME = { '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.csv': 'text/csv; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.webmanifest': 'application/manifest+json' };
const SEC_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'",
};

function send(res, status, body, type = 'text/html; charset=utf-8', headers = {}) {
  res.writeHead(status, { 'Content-Type': type, ...SEC_HEADERS, ...headers });
  res.end(body);
}
const html = (res, body, status = 200) => send(res, status, body, 'text/html; charset=utf-8', { 'Cache-Control': 'no-cache' });
const json = (res, obj, status = 200, headers = {}) => send(res, status, JSON.stringify(obj), 'application/json; charset=utf-8', { 'Cache-Control': 'no-store', ...headers });
const bad = (res, msg, status = 400) => json(res, { error: msg }, status);

function readBody(req, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(Object.assign(new Error('Request body too large'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { reject(Object.assign(new Error('Invalid JSON'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function clientIp(req) { return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim(); }
const buckets = new Map();
function rateLimited(req, key, max = 40, windowMs = 60000) {
  const k = key + '|' + clientIp(req);
  const now = Date.now();
  const b = buckets.get(k) || { n: 0, t: now };
  if (now - b.t > windowMs) { b.n = 0; b.t = now; }
  b.n++; buckets.set(k, b);
  return b.n > max;
}
setInterval(() => { const now = Date.now(); for (const [k, b] of buckets) if (now - b.t > 120000) buckets.delete(k); }, 60000).unref();

// ---------------- community data ----------------
function community() { return store.load('community', { views: {}, feedback: {}, fixvotes: {}, suggestions: {}, sessions: 0, decodes: 0, scans: 0, asks: 0 }); }
function touch() { store.save('community', community()); }

function trending(n = 6) {
  const v = community().views;
  return Object.entries(v).filter(([s]) => kb.get(s)).sort((a, b) => b[1] - a[1]).slice(0, n).map(([slug, views]) => { const e = kb.get(slug); return { slug, title: e.title, code: e.codes[0], severity: e.severity, views }; });
}

function lite(e) { return { slug: e.slug, title: e.title, codes: e.codes.slice(0, 4), category: e.category, severity: e.severity, frequency: e.frequency, summary: e.summary, fixCount: e.fixes.length }; }

function dailySlug() {
  const list = kb.list().filter((e) => !e.autoDrafted);
  const pool = list.length ? list : kb.list();
  if (!pool.length) return null;
  const day = Math.floor(Date.now() / 86400000);
  return pool[(day * 2654435761 >>> 0) % pool.length].slug;
}

// ---------------- admin auth ----------------
function secret() {
  const doc = store.load('secret', {});
  if (!doc.key) { doc.key = crypto.randomBytes(32).toString('hex'); store.save('secret', doc, { immediate: true }); }
  return doc.key;
}
function adminDoc() { return store.load('admin', {}); }
function adminConfigured() { return !!process.env.ADMIN_PASSWORD || !!adminDoc().hash; }
function hashPw(pw, salt) { return crypto.scryptSync(String(pw), salt, 64).toString('hex'); }
function checkPw(pw) {
  if (process.env.ADMIN_PASSWORD) { const a = Buffer.from(String(pw)); const b = Buffer.from(process.env.ADMIN_PASSWORD); return a.length === b.length && crypto.timingSafeEqual(a, b); }
  const d = adminDoc(); if (!d.hash) return false;
  const h = Buffer.from(hashPw(pw, d.salt), 'hex'); const want = Buffer.from(d.hash, 'hex');
  return h.length === want.length && crypto.timingSafeEqual(h, want);
}
function sign(v) { return crypto.createHmac('sha256', secret()).update(v).digest('hex'); }
function makeToken() { const exp = String(Date.now() + 7 * 86400000); const gen = String(adminDoc().gen || 0); return `${exp}.${gen}.${sign(exp + '.' + gen)}`; }
function cookies(req) { return Object.fromEntries(String(req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).filter((p) => p[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))])); }
function isAdmin(req) {
  const t = cookies(req).wm_admin; if (!t) return false;
  const [exp, gen, sig] = t.split('.');
  if (!exp || !sig || Number(exp) < Date.now() || String(adminDoc().gen || 0) !== gen) return false;
  const want = sign(exp + '.' + gen);
  return sig.length === want.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want));
}
function authCookie(req, token, maxAge) {
  const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  return `wm_admin=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

// ---------------- custom entries ----------------
function saveEntry(raw, status = 'published') {
  if (!raw || (!raw.slug && !raw.title && !raw.code)) throw new Error('Entry needs at least a slug, title or code');
  let e = raw;
  if (!raw.fixes || !raw.fixes.length || !raw.summary || !raw.meaning) e = importer.complete(raw);
  e = kb.normalizeEntry({ ...e, slug: slugify(e.slug || e.codes?.[0] || e.title) });
  if (!e.relatedSlugs.length) e.relatedSlugs = kb.list().filter((x) => x.category === e.category && x.slug !== e.slug && !x.autoDrafted).slice(0, 3).map((x) => x.slug);
  const doc = kb.customDoc();
  doc.entries[e.slug] = { ...e, status: status === 'draft' ? 'draft' : 'published', updatedAt: new Date().toISOString(), ...(raw.autoDrafted || e.autoDrafted ? { autoDrafted: true } : {}) };
  if (raw.autoDrafted === false) delete doc.entries[e.slug].autoDrafted;
  doc.hidden = (doc.hidden || []).filter((s) => s !== e.slug);
  store.save('custom-errors', doc);
  return doc.entries[e.slug];
}
function commitCustom() { store.save('custom-errors', kb.customDoc(), { immediate: true }); kb.rebuild(); }

function existingFor(entry) {
  if (kb.allEntries().some((x) => x.slug === entry.slug)) return entry.slug;
  for (const c of entry.codes) { const hit = kb.byCode(c); if (hit) return hit.slug; }
  return null;
}

// ---------------- zip ----------------
let zipCache = null;
function sourceZip() {
  const custom = Object.values(kb.customDoc().entries || {});
  const key = JSON.stringify([custom.length, custom.map((e) => e.updatedAt).sort().pop() || '']);
  if (zipCache && zipCache.key === key) return zipCache.buf;
  const files = zip.collect(ROOT, 'winmend');
  if (custom.length) files.push({ name: 'winmend/content/errors.d/admin-export.json', data: Buffer.from(JSON.stringify(custom, null, 1)) });
  zipCache = { key, buf: zip.build(files) };
  return zipCache.buf;
}

// ---------------- static ----------------
function serveStatic(req, res, rel) {
  const abs = path.normalize(path.join(PUBLIC, rel));
  if (!abs.startsWith(PUBLIC + path.sep)) return false;
  let st; try { st = fs.statSync(abs); } catch { return false; }
  if (!st.isFile()) return false;
  const versioned = /[?&]v=/.test(req.url);
  send(res, 200, fs.readFileSync(abs), MIME[path.extname(abs)] || 'application/octet-stream', { 'Cache-Control': versioned ? 'public, max-age=31536000, immutable' : 'public, max-age=300' });
  return true;
}

// ---------------- routes ----------------
async function api(req, res, url) {
  const p = url.pathname;
  const q = url.searchParams;
  const M = req.method;
  const cm = community();

  if (p === '/api' || p === '/api/') return json(res, { ok: true, service: 'winmend', version: VERSION, stats: kb.stats(), community: { sessions: cm.sessions, decodes: cm.decodes, feedbackTotal: Object.values(cm.feedback).reduce((a, f) => a + f.helpful + f.notHelpful, 0), feedbackHelpful: Object.values(cm.feedback).reduce((a, f) => a + f.helpful, 0), trending: trending() } });

  if (p === '/api/errors' && M === 'GET') {
    const r = kb.search(q.get('q') || '', { category: q.get('category') || '', severity: q.get('severity') || '', limit: Math.min(100, Number(q.get('limit')) || 20), offset: Math.max(0, Number(q.get('offset')) || 0), sort: q.get('sort') || '' });
    const views = {}; for (const e of r.items) views[e.slug] = cm.views[e.slug] || 0;
    const full = q.get('full') === '1';
    return json(res, { ...r, items: r.items.map(full ? (e) => e : lite), didYouMean: r.didYouMean.map(lite), views });
  }
  let m;
  if ((m = /^\/api\/errors\/([^/]+)$/.exec(p)) && M === 'GET') {
    const e = kb.get(decodeURIComponent(m[1]));
    if (!e) return bad(res, 'Not found', 404);
    return json(res, { entry: e, related: e.relatedSlugs.map((s) => kb.get(s)).filter(Boolean).map(lite), views: cm.views[e.slug] || 0 });
  }
  if (p === '/api/decode' && M === 'GET') {
    const raw = String(q.get('q') || '').trim().slice(0, 200);
    if (!raw) return bad(res, 'Enter a code to decode');
    const match = kb.byCode(raw);
    const r = match ? null : kb.search(raw, { limit: 5 });
    if (q.get('count') !== '0') { cm.decodes++; touch(); }
    return json(res, { query: raw, anatomy: anatomy(raw), match: match || null, results: r ? r.items.map(lite) : [], didYouMean: r ? r.didYouMean.map(lite) : [], kind: r ? r.kind : 'exact' });
  }
  if (p === '/api/random') { const l = kb.list(); const e = l[Math.floor(Math.random() * l.length)]; return json(res, { slug: e.slug, code: e.codes[0], title: e.title }); }
  if (p === '/api/daily') { const s = dailySlug(); const e = s && kb.get(s); return json(res, e ? { entry: lite(e) } : {}); }
  if (p === '/api/trending') return json(res, { items: trending(8) });
  if (p === '/api/guides') return json(res, { items: kb.GUIDES.map((g) => ({ slug: g.slug, title: g.title, description: g.description, category: g.category, readMinutes: g.readMinutes })) });

  if (p === '/api/suggest') {
    if (M === 'GET') {
      const items = Object.values(cm.suggestions).filter((s) => !s.dismissed && !kb.byCode(s.code)).sort((a, b) => b.votes - a.votes).slice(0, 8).map((s) => ({ code: s.code, votes: s.votes }));
      return json(res, { ok: true, total: Object.keys(cm.suggestions).length, items });
    }
    if (M === 'POST') {
      if (rateLimited(req, 'suggest', 15)) return bad(res, 'Too many requests, please wait a minute', 429);
      const b = await readBody(req);
      const code = String(b.code || '').trim();
      if (code.length < 3 || code.length > 120) return bad(res, 'Enter the error code or message (3 to 120 characters)');
      const hit = kb.byCode(code);
      if (hit) return json(res, { ok: true, covered: true, slug: hit.slug, title: hit.title });
      const k = normCode(code);
      const s = cm.suggestions[k] || { code, votes: 0, notes: [], first: new Date().toISOString() };
      s.votes++; s.last = new Date().toISOString(); s.dismissed = false;
      if (b.note) s.notes = [...s.notes, String(b.note).slice(0, 200)].slice(-10);
      cm.suggestions[k] = s; touch();
      return json(res, { ok: true, covered: false, votes: s.votes });
    }
  }
  if (p === '/api/scan' && M === 'POST') {
    if (rateLimited(req, 'scan', 30)) return bad(res, 'Too many requests, please wait a minute', 429);
    const b = await readBody(req, 200000);
    const text = String(b.text || '');
    if (text.trim().length < 8) return bad(res, 'Paste at least a line or two of the log first.');
    cm.scans++; touch();
    return json(res, kb.scan(text));
  }
  if (p === '/api/diagnose' && M === 'POST') {
    if (rateLimited(req, 'diagnose', 30)) return bad(res, 'Too many requests, please wait a minute', 429);
    const b = await readBody(req);
    if (!b.symptom) return bad(res, 'Pick a symptom first');
    const r = kb.diagnose(b);
    cm.sessions++; touch();
    return json(res, { ...r, sessions: cm.sessions });
  }
  if (p === '/api/ask' && M === 'POST') {
    if (rateLimited(req, 'ask', 20)) return bad(res, 'Too many questions in a short time. Please wait a minute.', 429);
    const b = await readBody(req);
    cm.asks++; touch();
    return json(res, assistant.answer(b.question));
  }
  if (p === '/api/view') {
    const slug = M === 'POST' ? String((await readBody(req)).slug || '') : String(q.get('slug') || '');
    if (!kb.get(slug)) return bad(res, 'Unknown slug', 404);
    if (M === 'POST' && !rateLimited(req, 'view:' + slug, 3, 3600000)) { cm.views[slug] = (cm.views[slug] || 0) + 1; touch(); }
    return json(res, { ok: true, slug, views: cm.views[slug] || 0 });
  }
  if (p === '/api/feedback') {
    if (M === 'POST') {
      const b = await readBody(req);
      const slug = String(b.slug || '');
      if (!kb.get(slug)) return bad(res, 'Unknown slug', 404);
      if (rateLimited(req, 'fb:' + slug, 2, 3600000)) return bad(res, 'Thanks, your feedback was already counted', 429);
      const f = cm.feedback[slug] || { helpful: 0, notHelpful: 0 };
      if (b.helpful) f.helpful++; else f.notHelpful++;
      cm.feedback[slug] = f; touch();
      return json(res, { ok: true, slug, ...f });
    }
    const slug = String(q.get('slug') || '');
    return json(res, { slug, ...(cm.feedback[slug] || { helpful: 0, notHelpful: 0 }) });
  }
  if (p === '/api/fixvote') {
    if (M === 'POST') {
      const b = await readBody(req);
      const slug = String(b.slug || ''); const e = kb.get(slug); const i = Number(b.index);
      if (!e || !Number.isInteger(i) || i < 0 || i >= e.fixes.length) return bad(res, 'Unknown fix', 404);
      if (rateLimited(req, 'vote:' + slug, 2, 3600000)) return bad(res, 'Your vote was already counted', 429);
      const v = cm.fixvotes[slug] || {}; v[i] = (v[i] || 0) + 1; cm.fixvotes[slug] = v; touch();
      return json(res, { ok: true, slug, votes: v });
    }
    const slug = String(q.get('slug') || '');
    return json(res, { ok: true, slug, votes: cm.fixvotes[slug] || {} });
  }

  // ---------- admin ----------
  if (p.startsWith('/api/admin/')) return adminApi(req, res, url);
  return bad(res, 'Not found', 404);
}

async function adminApi(req, res, url) {
  const p = url.pathname.slice('/api/admin'.length);
  const M = req.method;
  const q = url.searchParams;
  if (M !== 'GET' && req.headers['content-type'] && !String(req.headers['content-type']).includes('application/json')) return bad(res, 'JSON only', 415);

  if (p === '/status') return json(res, { configured: adminConfigured(), loggedIn: isAdmin(req), envPassword: !!process.env.ADMIN_PASSWORD });
  if (p === '/setup' && M === 'POST') {
    if (adminConfigured()) return bad(res, 'Admin is already set up', 409);
    const b = await readBody(req);
    if (String(b.password || '').length < 8) return bad(res, 'Use at least 8 characters');
    const salt = crypto.randomBytes(16).toString('hex');
    store.save('admin', { salt, hash: hashPw(b.password, salt), gen: 1, createdAt: new Date().toISOString() }, { immediate: true });
    return json(res, { ok: true }, 200, { 'Set-Cookie': authCookie(req, makeToken(), 604800) });
  }
  if (p === '/login' && M === 'POST') {
    if (rateLimited(req, 'login', 8, 300000)) return bad(res, 'Too many attempts. Wait a few minutes.', 429);
    const b = await readBody(req);
    if (!checkPw(b.password || '')) return bad(res, 'Wrong password', 401);
    return json(res, { ok: true }, 200, { 'Set-Cookie': authCookie(req, makeToken(), 604800) });
  }
  if (p === '/logout' && M === 'POST') return json(res, { ok: true }, 200, { 'Set-Cookie': authCookie(req, '', 0) });
  if (!isAdmin(req)) return bad(res, 'Please sign in', 401);

  if (p === '/password' && M === 'POST') {
    if (process.env.ADMIN_PASSWORD) return bad(res, 'The password is set by the ADMIN_PASSWORD environment variable');
    const b = await readBody(req);
    if (!checkPw(b.current || '')) return bad(res, 'Current password is wrong', 401);
    if (String(b.password || '').length < 8) return bad(res, 'Use at least 8 characters');
    const d = adminDoc(); const salt = crypto.randomBytes(16).toString('hex');
    store.save('admin', { ...d, salt, hash: hashPw(b.password, salt), gen: (d.gen || 0) + 1 }, { immediate: true });
    return json(res, { ok: true }, 200, { 'Set-Cookie': authCookie(req, makeToken(), 604800) });
  }
  if (p === '/overview') {
    const cm = community(); const doc = kb.customDoc(); const all = kb.allEntries();
    const scraped = store.load('scraped', { items: {} });
    const sc = Object.values(scraped.items);
    return json(res, {
      stats: kb.stats(),
      counts: { builtin: all.filter((e) => e.source === 'builtin').length, repo: all.filter((e) => e.source === 'repo').length, custom: Object.keys(doc.entries).length, drafts: Object.values(doc.entries).filter((e) => e.status === 'draft').length, hidden: (doc.hidden || []).length, scrapedNew: sc.filter((s) => s.status === 'new').length, scrapedTotal: sc.length },
      community: { sessions: cm.sessions, decodes: cm.decodes, scans: cm.scans, asks: cm.asks, views: Object.values(cm.views).reduce((a, b) => a + b, 0) },
      trending: trending(10),
      wishlist: Object.values(cm.suggestions).filter((s) => !s.dismissed && !kb.byCode(s.code)).sort((a, b) => b.votes - a.votes).slice(0, 50),
      dataDir: store.DATA_DIR,
    });
  }
  if (p === '/entries') {
    const doc = kb.customDoc(); const hidden = new Set(doc.hidden || []);
    const term = String(q.get('q') || '').toLowerCase(); const src = q.get('source') || '';
    let items = kb.allEntries().map((e) => ({ slug: e.slug, title: e.title, code: e.codes[0], category: e.category, severity: e.severity, source: e.source || 'builtin', status: hidden.has(e.slug) ? 'hidden' : e.status || 'published', autoDrafted: !!e.autoDrafted, updatedAt: e.updatedAt || null }));
    if (term) items = items.filter((e) => (e.slug + ' ' + e.title + ' ' + e.code).toLowerCase().includes(term));
    if (src) items = items.filter((e) => (src === 'draft' ? e.status === 'draft' : src === 'hidden' ? e.status === 'hidden' : src === 'auto' ? e.autoDrafted : e.source === src));
    const offset = Math.max(0, Number(q.get('offset')) || 0);
    return json(res, { total: items.length, items: items.slice(offset, offset + 50) });
  }
  let m;
  if ((m = /^\/entry\/([^/]+)$/.exec(p))) {
    const slug = decodeURIComponent(m[1]);
    const doc = kb.customDoc();
    if (M === 'GET') { const e = kb.allEntries().find((x) => x.slug === slug); return e ? json(res, { entry: e, isCustom: !!doc.entries[slug], hidden: (doc.hidden || []).includes(slug) }) : bad(res, 'Not found', 404); }
    if (M === 'DELETE') {
      const isBuiltin = kb.BUILTIN.some((x) => x.slug === slug) || kb.allEntries().some((x) => x.slug === slug && x.source === 'repo');
      delete doc.entries[slug];
      if (isBuiltin && q.get('restore') !== '1') doc.hidden = [...new Set([...(doc.hidden || []), slug])];
      if (q.get('restore') === '1') doc.hidden = (doc.hidden || []).filter((s) => s !== slug);
      commitCustom();
      return json(res, { ok: true, hidden: isBuiltin && q.get('restore') !== '1' });
    }
  }
  if (p === '/entry' && M === 'POST') {
    const b = await readBody(req, 2_000_000);
    try {
      if (b.originalSlug && b.entry && b.originalSlug !== slugify(b.entry.slug || '')) { const doc = kb.customDoc(); delete doc.entries[b.originalSlug]; }
      const e = saveEntry(b.entry, b.status); commitCustom(); return json(res, { ok: true, entry: e });
    } catch (e) { return bad(res, e.message); }
  }
  if (p === '/draft' && M === 'POST') {
    const b = await readBody(req);
    try { const e = draftEntry(b); return json(res, { entry: e, existing: existingFor(e) }); } catch (e) { return bad(res, e.message); }
  }
  if (p === '/import/preview' && M === 'POST') {
    const b = await readBody(req, 8_000_000);
    try {
      const { format, inputs } = importer.parse(String(b.text || ''), b.format);
      if (inputs.length > 5000) return bad(res, 'Up to 5,000 entries per import, please split the file');
      const items = inputs.map((inp) => { try { const e = importer.complete(inp); return { entry: e, existing: existingFor(e) }; } catch (err) { return { error: err.message, input: inp }; } });
      return json(res, { format, count: items.length, items });
    } catch (e) { return bad(res, 'Could not read the input: ' + e.message); }
  }
  if (p === '/import/commit' && M === 'POST') {
    const b = await readBody(req, 12_000_000);
    const entries = Array.isArray(b.entries) ? b.entries : [];
    let saved = 0, skipped = 0;
    for (const e of entries) {
      if (!b.overwrite && existingFor(e)) { skipped++; continue; }
      try { saveEntry(e, b.status); saved++; } catch { skipped++; }
    }
    commitCustom();
    return json(res, { ok: true, saved, skipped });
  }
  if (p === '/export') {
    const doc = kb.customDoc();
    return send(res, 200, JSON.stringify(Object.values(doc.entries), null, 1), 'application/json; charset=utf-8', { 'Content-Disposition': `attachment; filename="winmend-custom-errors-${new Date().toISOString().slice(0, 10)}.json"` });
  }
  if (p === '/wishlist/dismiss' && M === 'POST') {
    const b = await readBody(req); const cm = community(); const s = cm.suggestions[normCode(b.code)];
    if (s) { s.dismissed = true; touch(); }
    return json(res, { ok: true });
  }
  // ----- scraper -----
  if (p === '/scrape/presets') return json(res, { presets: Object.entries(scraper.PRESETS).map(([id, v]) => ({ id, label: v.label, pages: v.urls.length })) });
  if (p === '/scrape' && M === 'POST') {
    const b = await readBody(req);
    try {
      const r = await scraper.scrape({ preset: b.preset, url: b.url, kind: b.kind });
      const doc = store.load('scraped', { items: {} });
      let added = 0, known = 0;
      for (const rec of r.records) {
        if (doc.items[rec.key]) continue;
        const covered = kb.byCode(rec.code) || rec.aliases.some((a) => /[a-z_]{4,}/i.test(a) && kb.byCode(a));
        doc.items[rec.key] = { ...rec, status: covered ? 'covered' : 'new', coveredBy: covered ? covered.slug : undefined, scrapedAt: new Date().toISOString() };
        covered ? known++ : added++;
      }
      store.save('scraped', doc, { immediate: true });
      return json(res, { ok: true, found: r.records.length, added, alreadyCovered: known, pages: r.pages });
    } catch (e) { return bad(res, e.message); }
  }
  if (p === '/scraped') {
    const doc = store.load('scraped', { items: {} });
    const st = q.get('status') || 'new'; const term = String(q.get('q') || '').toLowerCase(); const kind = q.get('kind') || '';
    let items = Object.values(doc.items);
    if (st !== 'all') items = items.filter((x) => x.status === st);
    if (kind) items = items.filter((x) => x.kind === kind);
    if (term) items = items.filter((x) => (x.code + ' ' + (x.name || '') + ' ' + (x.description || '')).toLowerCase().includes(term));
    const offset = Math.max(0, Number(q.get('offset')) || 0);
    const counts = {}; for (const x of Object.values(doc.items)) counts[x.status] = (counts[x.status] || 0) + 1;
    return json(res, { total: items.length, counts, items: items.slice(offset, offset + 100) });
  }
  if (p === '/scraped/import' && M === 'POST') {
    const b = await readBody(req, 2_000_000);
    const doc = store.load('scraped', { items: {} });
    let targets = Array.isArray(b.keys) ? b.keys.map((k) => doc.items[k]).filter(Boolean) : [];
    if (b.all) targets = Object.values(doc.items).filter((x) => x.status === 'new' && (!b.kind || x.kind === b.kind));
    let saved = 0, skipped = 0;
    for (const rec of targets) {
      try {
        const e = draftEntry(scraper.draftInput(rec));
        if (existingFor(e)) { rec.status = 'covered'; rec.coveredBy = existingFor(e); skipped++; continue; }
        const s = saveEntry(e, b.status === 'draft' ? 'draft' : 'published');
        rec.status = 'imported'; rec.slug = s.slug; saved++;
        if (saved % 200 === 0) kb.rebuild();
      } catch { skipped++; }
    }
    store.save('scraped', doc, { immediate: true });
    commitCustom();
    return json(res, { ok: true, saved, skipped });
  }
  if (p === '/scraped/ignore' && M === 'POST') {
    const b = await readBody(req); const doc = store.load('scraped', { items: {} });
    for (const k of b.keys || []) if (doc.items[k]) doc.items[k].status = 'ignored';
    store.save('scraped', doc, { immediate: true });
    return json(res, { ok: true });
  }
  if (p === '/scraped/clear' && M === 'POST') {
    const doc = store.load('scraped', { items: {} });
    for (const [k, v] of Object.entries(doc.items)) if (v.status !== 'imported') delete doc.items[k];
    store.save('scraped', doc, { immediate: true });
    return json(res, { ok: true });
  }
  return bad(res, 'Not found', 404);
}

function sitemap() {
  const now = new Date().toISOString();
  const urls = [['/', '1.0', 'weekly'], ['/errors', '0.9', 'weekly'], ['/guides', '0.8', 'monthly'], ['/manual', '0.3', 'monthly'], ...Object.keys(kb.CATEGORIES).map((c) => [`/errors/category/${c}`, '0.7', 'weekly']), ...kb.GUIDES.map((g) => [`/guides/${g.slug}`, '0.7', 'monthly']), ...kb.list().map((e) => [`/errors/${e.slug}`, e.autoDrafted ? '0.5' : '0.8', 'monthly'])];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(([u, pr, f]) => `<url><loc>${C.BASE_URL}${u}</loc><lastmod>${now}</lastmod><changefreq>${f}</changefreq><priority>${pr}</priority></url>`).join('\n')}\n</urlset>`;
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  try {
    if (p === '/healthz') return send(res, 200, 'ok', 'text/plain; charset=utf-8', { 'Cache-Control': 'no-store' });
    if (p.startsWith('/api')) return await api(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return bad(res, 'Method not allowed', 405);
    if (p.startsWith('/assets/') && serveStatic(req, res, p.slice(1))) return;
    if (p === '/favicon.svg' || p === '/favicon.ico') { if (serveStatic(req, res, 'favicon.svg')) return; }
    if (p === '/samples/errors-sample.csv' || p === '/samples/errors-sample.json' || p === '/samples/codes-list.txt') {
      const f = path.join(ROOT, 'docs', 'samples', path.basename(p));
      if (fs.existsSync(f)) return send(res, 200, fs.readFileSync(f), MIME[path.extname(f)] || 'text/plain', { 'Content-Disposition': `attachment; filename="${path.basename(p)}"` });
    }
    if (p === '/robots.txt') return send(res, 200, `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /admin\n\nSitemap: ${C.BASE_URL}/sitemap.xml\n`, 'text/plain; charset=utf-8');
    if (p === '/sitemap.xml') return send(res, 200, sitemap(), 'application/xml; charset=utf-8');
    if (p === '/') return html(res, render.home());
    if (p === '/errors' || p === '/errors/') return html(res, render.errorsIndex());
    let m;
    if ((m = /^\/errors\/category\/([a-z0-9-]+)\/?$/.exec(p)) && kb.CATEGORIES[m[1]]) return html(res, render.categoryPage(m[1], Number(url.searchParams.get('page')) || 1));
    if ((m = /^\/errors\/([^/]+)\/?$/.exec(p))) {
      const slug = decodeURIComponent(m[1]);
      const e = kb.get(slug);
      if (e) return html(res, render.errorPage(e));
      const alias = kb.byCode(slug);
      if (alias) { res.writeHead(301, { Location: `/errors/${alias.slug}` }); return res.end(); }
      if (url.searchParams.get('preview') === '1' && isAdmin(req)) {
        const d = kb.customDoc().entries[slug];
        if (d) return html(res, render.errorPage(kb.normalizeEntry(d), { preview: true }));
      }
    }
    if (p === '/guides' || p === '/guides/') return html(res, render.guidesIndex());
    if ((m = /^\/guides\/([a-z0-9-]+)\/?$/.exec(p))) { const g = kb.GUIDES.find((x) => x.slug === m[1]); if (g) return html(res, render.guidePage(g)); }
    if (p === '/manual') return html(res, render.manualPage(fs.readFileSync(path.join(ROOT, 'docs', 'USER_MANUAL.md'), 'utf8')));
    if (p === '/admin' || p === '/admin/') return html(res, render.adminPage());
    if (p === '/download/source.zip') {
      if (!isAdmin(req) && process.env.PUBLIC_DOWNLOAD !== '1') { res.writeHead(302, { Location: '/admin?next=download' }); return res.end(); }
      return send(res, 200, sourceZip(), 'application/zip', { 'Content-Disposition': `attachment; filename="winmend-source-${new Date().toISOString().slice(0, 10)}.zip"`, 'Cache-Control': 'no-store' });
    }
    return html(res, render.notFound(p), 404);
  } catch (e) {
    if (e.status) return bad(res, e.message, e.status);
    console.error(e);
    if (!res.headersSent) bad(res, 'Something went wrong on our side', 500);
  }
}

if (require.main === module) {
  secret();
  const server = http.createServer(handle);
  server.listen(C.PORT, '0.0.0.0', () => {
    console.log(`${C.SITE_NAME} running on http://localhost:${C.PORT}  (data: ${store.DATA_DIR}, ${kb.stats().total} errors)`);
    if (!adminConfigured()) console.log(`Open http://localhost:${C.PORT}/admin to create the admin password.`);
  });
}

module.exports = { handle };
