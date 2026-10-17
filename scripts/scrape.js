'use strict';
// Scrape error code lists and turn them into full entries.
//
//   node scripts/scrape.js --list                          show the built-in sources
//   node scripts/scrape.js --preset bugchecks              -> content/errors.d/scraped-bugchecks.json
//   node scripts/scrape.js --preset win32 --limit 300      only the first 300 new codes
//   node scripts/scrape.js --url https://... --kind update
//   add --draft to keep the new pages hidden until you publish them in the admin
const fs = require('fs');
const path = require('path');
const args = process.argv.slice(2);
const val = (n) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : undefined; };
const root = path.join(__dirname, '..');
if (!process.env.DATA_DIR) process.env.DATA_DIR = path.join(root, 'data-local');
const scraper = require('../lib/scraper');
const { draftEntry } = require('../lib/draft');
const kb = require('../lib/kb');

(async () => {
  if (args.includes('--list') || (!val('preset') && !val('url'))) {
    console.log('Built-in sources:');
    for (const [id, p] of Object.entries(scraper.PRESETS)) console.log(`  --preset ${id.padEnd(15)} ${p.label}`);
    console.log('\nOr: --url <page> [--kind win32|bugcheck|update|device|generic]');
    return;
  }
  const r = await scraper.scrape({ preset: val('preset'), url: val('url'), kind: val('kind') });
  for (const p of r.pages) console.log(`${p.error ? 'FAILED' : 'ok    '} ${p.count.toString().padStart(4)} codes  ${p.url}${p.error ? '  ' + p.error : ''}`);
  const limit = Number(val('limit')) || Infinity;
  const out = [];
  let covered = 0;
  for (const rec of r.records) {
    if (out.length >= limit) break;
    const e = draftEntry(scraper.draftInput(rec));
    if (kb.allEntries().some((x) => x.slug === e.slug) || e.codes.some((c) => kb.byCode(c))) { covered++; continue; }
    if (args.includes('--draft')) e.status = 'draft';
    e.updatedAt = new Date().toISOString();
    out.push(e);
  }
  const name = val('out') || `scraped-${val('preset') || new URL(val('url')).hostname.replace(/\W+/g, '-')}.json`;
  const file = path.join(root, 'content', 'errors.d', name);
  fs.writeFileSync(file, JSON.stringify(out, null, 1));
  console.log(`\n${r.records.length} codes found, ${covered} already covered, ${out.length} new entries written to ${path.relative(root, file)}.`);
  console.log('Restart the server to load them locally, or commit the file to publish them.');
})().catch((e) => { console.error(e.message); process.exit(1); });
