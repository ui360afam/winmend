'use strict';
// Error code scraper. Fetches a public reference page and extracts code
// records (code, name, description) from tables or definition-style lists.
// Presets cover the main Microsoft reference pages; any other URL works too
// as long as it lists codes in a table or as "NAME / value / message" blocks.

const dns = require('dns').promises;
const net = require('net');
const { parseNumber, hex8 } = require('./decode');

const LEARN = 'https://learn.microsoft.com/en-us';
const W32 = ['0-499', '500-999', '1000-1299', '1300-1699', '1700-3999', '4000-5999', '6000-8199', '8200-8999', '9000-11999', '12000-15999'];

const PRESETS = {
  bugchecks: { label: 'Blue screen stop codes (bug check reference)', urls: [`${LEARN}/windows-hardware/drivers/debugger/bug-check-code-reference2`], kind: 'bugcheck' },
  'windows-update': { label: 'Windows Update error codes', urls: [`${LEARN}/windows/deployment/update/windows-update-error-reference`], kind: 'update' },
  'device-manager': { label: 'Device Manager error codes', urls: [`${LEARN}/windows-hardware/drivers/install/device-manager-error-messages`], kind: 'device' },
  win32: { label: 'Win32 system error codes (0 to 15999, about 2,800 codes)', urls: W32.map((r) => `${LEARN}/windows/win32/debug/system-error-codes--${r}-`), kind: 'win32' },
  'win32-common': { label: 'Win32 system error codes 0 to 1299 (the most common range)', urls: W32.slice(0, 3).map((r) => `${LEARN}/windows/win32/debug/system-error-codes--${r}-`), kind: 'win32' },
};

const decodeEntities = (s) => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
const text = (html) => decodeEntities(String(html).replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/[\u2013\u2014]/g, '-').replace(/\s+/g, ' ').trim();

function isPrivate(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const l = ip.toLowerCase();
  return l === '::1' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe80') || l.startsWith('::ffff:127.') || l === '::';
}

async function fetchPage(url) {
  const u = new URL(url);
  if (!/^https?:$/.test(u.protocol)) throw new Error('Only http(s) URLs can be scraped');
  if (process.env.SCRAPER_ALLOW_PRIVATE !== '1') {
    const addrs = await dns.lookup(u.hostname, { all: true }).catch(() => []);
    if (!addrs.length) throw new Error(`Could not resolve ${u.hostname}`);
    if (addrs.some((a) => isPrivate(a.address))) throw new Error('Private and local network addresses are blocked');
  }
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 25000);
  try {
    const res = await fetch(u, { signal: ctl.signal, redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 (compatible; ErrorCodeScraper/1.0)', accept: 'text/html,*/*' } });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${u.hostname}`);
    const body = await res.text();
    return body.slice(0, 5_000_000);
  } finally { clearTimeout(timer); }
}

function mainHtml(html) {
  const m = /<main[\s\S]*?<\/main>/i.exec(html) || /<article[\s\S]*?<\/article>/i.exec(html) || /<body[\s\S]*?<\/body>/i.exec(html);
  return (m ? m[0] : html).replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
}

const CODE_RE = /^(0x[0-9a-f]{1,8}|code\s*\d{1,2}|-?\d{1,10}|[0-9a-f]{8})$/i;
const NAME_RE = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/;

function fromTables(html) {
  const out = [];
  for (const t of html.matchAll(/<table[\s\S]*?<\/table>/gi)) {
    for (const tr of t[0].matchAll(/<tr[\s\S]*?<\/tr>/gi)) {
      const cells = [...tr[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => text(c[1]));
      if (cells.length < 2) continue;
      let code = null, name = null, desc = [];
      for (const c of cells) {
        const first = c.split(/\s+/)[0];
        if (!code && CODE_RE.test(c)) code = c;
        else if (!code && /^0x[0-9a-f]{1,8}$/i.test(first)) { code = first; const rest = c.slice(first.length).trim(); if (rest) desc.push(rest); }
        else if (!name && NAME_RE.test(c)) name = c;
        else if (c && !/^(error code|code|message|description|name|problem name|value)$/i.test(c)) desc.push(c);
      }
      if (!code && name) { const mm = /\b(0x[0-9a-f]{1,8})\b/i.exec(desc.join(' ')); if (mm) code = mm[1]; }
      if (code || name) out.push({ code: code ? code.replace(/^code\s*/i, 'Code ') : null, name, description: desc.join(' ').slice(0, 600) || null });
    }
  }
  return out;
}

function fromBlocks(html) {
  // Pattern: <p><strong>NAME</strong></p> <p>123 (0x7B)</p> <p>Message</p>
  const out = [];
  const paras = [...html.matchAll(/<(p|dt|dd|h3|h4)[^>]*>([\s\S]*?)<\/\1>/gi)].map((m) => text(m[2])).filter(Boolean);
  for (let i = 0; i < paras.length - 1; i++) {
    if (!NAME_RE.test(paras[i])) continue;
    const m = /^(\d{1,10})\s*\((0x[0-9a-f]+)\)$/i.exec(paras[i + 1]) || /^(0x[0-9a-f]{1,8})$/i.exec(paras[i + 1]);
    if (!m) continue;
    const description = paras[i + 2] && !NAME_RE.test(paras[i + 2]) ? paras[i + 2] : null;
    out.push({ code: m[2] || m[1], decimal: m[2] ? m[1] : null, name: paras[i], description });
    i += description ? 2 : 1;
  }
  return out;
}

function fromText(html) {
  const out = [];
  const t = text(html);
  for (const m of t.matchAll(/\b(0x[0-9A-Fa-f]{8})\b\s*[:\-]?\s*([A-Z][A-Z0-9_]{3,})?\s*[:\-]?\s*([^.]{10,200}\.)?/g)) out.push({ code: m[1], name: m[2] || null, description: m[3] ? m[3].trim() : null });
  return out;
}

/** Classify a record so the draft generator gets the right code form and hints. */
function shape(rec, kind, source) {
  let code = rec.code ? String(rec.code).trim() : null;
  const name = rec.name || null;
  const aliases = [];
  let title;
  if (kind === 'win32' && code) {
    const num = parseNumber(code);
    if (num) {
      const v = num.value;
      const hr = hex8((0x80070000 | (v & 0xFFFF)) >>> 0);
      aliases.push(String(v), '0x' + v.toString(16).toUpperCase(), 'error ' + v);
      if (name) aliases.push(name);
      title = name ? `${name} (error ${v}, ${hr})` : `Win32 error ${v} (${hr})`;
      code = hr;
    }
  } else if (kind === 'bugcheck' && name) {
    if (code) aliases.push(code);
    title = name; code = name;
  } else if (kind === 'device') {
    if (name) aliases.push(name);
    title = `${code}${name ? ' (' + name + ')' : ''}`;
  } else {
    if (name) aliases.push(name);
    if (code && name) title = `${code} (${name})`;
  }
  if (!code) code = name;
  return { key: String(code).toLowerCase(), code, name, title, aliases, description: rec.description, kind, source };
}

/**
 * Scrape a preset or URL.
 * @returns {Promise<{records:object[], pages:{url:string,count:number,error?:string}[]}>}
 */
async function scrape({ preset, url, kind }) {
  let urls, k;
  if (preset) {
    const p = PRESETS[preset];
    if (!p) throw new Error('Unknown preset');
    urls = p.urls; k = p.kind;
  } else if (url) { urls = [url]; k = kind || 'auto'; }
  else throw new Error('Pick a preset or enter a URL');
  const seen = new Map();
  const pages = [];
  for (const u of urls) {
    try {
      const html = mainHtml(await fetchPage(u));
      let recs = fromTables(html);
      const blocks = fromBlocks(html);
      if (blocks.length > recs.length) recs = blocks;
      if (!recs.length) recs = fromText(html);
      let count = 0;
      for (const r of recs) {
        let kk = k;
        if (kk === 'auto') kk = r.decimal ? 'win32' : (r.code && /^code/i.test(r.code)) ? 'device' : (r.name && !r.code) ? 'bugcheck' : 'generic';
        if (kk === 'bugcheck' && !r.name) continue;
        const s = shape(r, kk, u);
        if (!s.code || seen.has(s.key)) continue;
        if (kk === 'win32' && /^ERROR_SUCCESS/.test(s.name || '')) continue;
        seen.set(s.key, s); count++;
      }
      pages.push({ url: u, count });
    } catch (e) {
      pages.push({ url: u, count: 0, error: e.message });
    }
  }
  return { records: [...seen.values()], pages };
}

function draftInput(rec) {
  const hints = { bugcheck: 'bsod', update: 'update', device: 'driver' };
  return { code: rec.code, title: rec.title, description: rec.description || undefined, aliases: rec.aliases, category: hints[rec.kind], frequency: 'uncommon' };
}

module.exports = { scrape, PRESETS, draftInput, fromTables, fromBlocks, text };
