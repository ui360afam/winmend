'use strict';
// Build-time sanity check: every module loads, content parses, no em dashes.
const fs = require('fs');
const path = require('path');
process.env.DATA_DIR = process.env.DATA_DIR || path.join(require('os').tmpdir(), 'winmend-check');
const kb = require('../lib/kb');
require('../lib/render'); require('../lib/importer'); require('../lib/scraper'); require('../lib/assistant'); require('../lib/zip');
const st = kb.stats();
if (st.total < 1) throw new Error('No errors loaded');
const root = path.join(__dirname, '..');
const bad = [];
for (const dir of ['content', 'public', 'lib', 'docs']) {
  (function walk(d) { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.(json|js|css|md|html|txt|csv)$/.test(f.name) && fs.readFileSync(p, 'utf8').includes('—')) bad.push(path.relative(root, p)); } })(path.join(root, dir));
}
if (bad.length) throw new Error('Em dash found in: ' + bad.join(', '));
console.log(`check ok: ${st.total} errors, ${st.categories} categories, ${kb.GUIDES.length} guides, ${kb.FAQ.length} FAQ`);
