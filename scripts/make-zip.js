'use strict';
// Builds dist/winmend-source.zip (source, content, docs, run scripts).
const fs = require('fs');
const path = require('path');
const zip = require('../lib/zip');
const root = path.join(__dirname, '..');
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist', 'winmend-source.zip');
fs.writeFileSync(out, zip.projectZip(root, 'winmend'));
console.log(`wrote ${path.relative(root, out)} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
