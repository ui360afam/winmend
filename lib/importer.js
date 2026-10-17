'use strict';
// Bulk import: accepts JSON, CSV or a plain list of codes and returns
// complete entries. Anything the input leaves out is filled in by the draft
// generator, so a single line like "0x80070490" becomes a full page.

const { draftEntry, slugify } = require('./draft');

function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

const split = (v) => String(v || '').split('|').map((s) => s.trim()).filter(Boolean);

function fromCsv(text) {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const head = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((r) => {
    const o = {};
    head.forEach((h, i) => { o[h] = (r[i] || '').trim(); });
    return {
      code: o.code || o.codes?.split('|')[0], title: o.title, slug: o.slug, category: o.category, severity: o.severity, frequency: o.frequency,
      summary: o.summary, meaning: o.meaning, description: o.description || o.message,
      aliases: split(o.aliases || o.codes).slice(o.codes ? 1 : 0), commonCauses: split(o.causes || o.commoncauses), prevention: split(o.prevention), tags: split(o.tags),
      windowsVersions: split(o.windowsversions || o.versions),
      fixes: split(o.fixes).map((f) => { const [t, ...d] = f.split(':'); return { title: t.trim(), detail: d.join(':').trim() || t.trim(), difficulty: 'easy', timeEstimate: '5-15 min' }; }),
      relatedSlugs: split(o.related || o.relatedslugs),
    };
  });
}

function fromList(text) {
  return text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => {
    const [code, title, category, description] = l.split('|').map((s) => (s || '').trim());
    return { code, title: title || undefined, category: category || undefined, description: description || undefined };
  });
}

function detectFormat(text) {
  const t = text.trim();
  if (t.startsWith('[') || t.startsWith('{')) return 'json';
  const first = t.split(/\r?\n/)[0].toLowerCase();
  if (/(^|,)\s*"?code"?\s*(,|$)/.test(first) && first.includes(',')) return 'csv';
  return 'list';
}

/**
 * Parse raw text into entry inputs.
 * @returns {{format:string, inputs:object[]}}
 */
function parse(text, format) {
  const fmt = format && format !== 'auto' ? format : detectFormat(text);
  let inputs;
  if (fmt === 'json') {
    const data = JSON.parse(text);
    inputs = Array.isArray(data) ? data : Array.isArray(data.errors) ? data.errors : [data];
  } else if (fmt === 'csv') inputs = fromCsv(text);
  else inputs = fromList(text);
  return { format: fmt, inputs: inputs.filter((x) => x && (x.code || x.title || (x.codes && x.codes.length))) };
}

/** Turn an input (partial or complete) into a full entry. */
function complete(input) {
  const code = input.code || (input.codes && input.codes[0]) || input.title;
  const base = draftEntry({ ...input, code, aliases: [...(input.aliases || []), ...((input.codes || []).slice(1))] });
  const full = input.fixes && input.fixes.length && input.meaning && input.summary;
  const e = { ...base };
  if (input.slug) e.slug = slugify(input.slug);
  if (input.codes && input.codes.length) e.codes = [...new Set([...input.codes.map(String), ...base.codes])];
  if (full) delete e.autoDrafted;
  return e;
}

module.exports = { parse, complete, parseCsv, detectFormat };
