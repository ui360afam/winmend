'use strict';
// Bulk import from the command line.
//
//   node scripts/import.js my-codes.txt              -> content/errors.d/my-codes.json (commit it to publish)
//   node scripts/import.js list.csv --draft           (drafts are hidden until published in the admin)
//   node scripts/import.js list.json --overwrite      (replace entries that already exist)
//   node scripts/import.js list.csv --to-data         (write into the data folder instead; stop the server first)
//
// Accepts a plain list (one code per line, optional "code | title | category | message"),
// CSV with a header row, or JSON. Missing content is generated automatically.
const fs = require('fs');
const path = require('path');
const args = process.argv.slice(2);
const flag = (n) => args.includes('--' + n);
const val = (n) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : undefined; };
const file = args.find((a, i) => !a.startsWith('--') && !['--format', '--out'].includes(args[i - 1]));
if (!file) { console.log('Usage: node scripts/import.js <file> [--format list|csv|json] [--draft] [--overwrite] [--to-data] [--out name.json]'); process.exit(1); }
const root = path.join(__dirname, '..');
if (!process.env.DATA_DIR) process.env.DATA_DIR = path.join(root, 'data-local');
const importer = require('../lib/importer');
const kb = require('../lib/kb');
const store = require('../lib/store');

const { format, inputs } = importer.parse(fs.readFileSync(file, 'utf8'), val('format'));
let made = 0, skipped = 0;
const entries = [];
for (const inp of inputs) {
  let e;
  try { e = importer.complete(inp); } catch (err) { console.warn('skip:', err.message); skipped++; continue; }
  const exists = kb.allEntries().some((x) => x.slug === e.slug) || e.codes.some((c) => kb.byCode(c));
  if (exists && !flag('overwrite')) { skipped++; continue; }
  if (flag('draft')) e.status = 'draft';
  if (!e.relatedSlugs.length) e.relatedSlugs = kb.list().filter((x) => x.category === e.category && !x.autoDrafted).slice(0, 3).map((x) => x.slug);
  e.updatedAt = new Date().toISOString();
  entries.push(e); made++;
}
if (flag('to-data')) {
  const doc = store.load('custom-errors', { entries: {}, hidden: [] });
  for (const e of entries) doc.entries[e.slug] = { ...e, status: e.status || 'published' };
  store.save('custom-errors', doc, { immediate: true });
  console.log(`${format}: imported ${made} into ${process.env.DATA_DIR}/custom-errors.json, skipped ${skipped}.`);
} else {
  const out = path.join(root, 'content', 'errors.d', val('out') || path.basename(file).replace(/\.[^.]+$/, '') + '.json');
  let prev = [];
  try { prev = JSON.parse(fs.readFileSync(out, 'utf8')); } catch {}
  const bySlug = new Map(prev.map((e) => [e.slug, e]));
  for (const e of entries) bySlug.set(e.slug, e);
  fs.writeFileSync(out, JSON.stringify([...bySlug.values()], null, 1));
  console.log(`${format}: wrote ${made} entries to ${path.relative(root, out)} (skipped ${skipped} that already exist). Commit the file to publish.`);
}
