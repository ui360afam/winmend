'use strict';
// Tiny JSON document store. Every file lives under DATA_DIR (default /data),
// the only path that survives deploys. Writes are atomic (tmp file + rename)
// and debounced so bursts of views/votes do not hammer the disk.

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || '/data';

function ensureDir() {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) { /* surfaced on write */ }
}

const docs = new Map(); // name -> { value, timer }

function file(name) { return path.join(DATA_DIR, name + '.json'); }

function load(name, fallback) {
  if (docs.has(name)) return docs.get(name).value;
  ensureDir();
  let value = fallback;
  try {
    const raw = fs.readFileSync(file(name), 'utf8');
    value = Object.assign(Array.isArray(fallback) ? [] : {}, fallback, JSON.parse(raw));
    if (Array.isArray(fallback)) value = JSON.parse(raw);
  } catch (e) {
    if (e.code !== 'ENOENT') console.warn(`[store] could not read ${name}: ${e.message}`);
  }
  docs.set(name, { value, timer: null });
  return value;
}

function writeNow(name) {
  const d = docs.get(name);
  if (!d) return;
  if (d.timer) { clearTimeout(d.timer); d.timer = null; }
  ensureDir();
  const tmp = file(name) + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify(d.value, null, 1));
    fs.renameSync(tmp, file(name));
  } catch (e) {
    console.error(`[store] write failed for ${name}: ${e.message}`);
  }
}

function save(name, value, { immediate = false } = {}) {
  const d = docs.get(name) || { value, timer: null };
  d.value = value;
  docs.set(name, d);
  if (immediate) return writeNow(name);
  if (!d.timer) d.timer = setTimeout(() => writeNow(name), 1500);
}

function flushAll() { for (const name of docs.keys()) writeNow(name); }
process.on('SIGTERM', () => { flushAll(); process.exit(0); });
process.on('SIGINT', () => { flushAll(); process.exit(0); });

module.exports = { load, save, flushAll, DATA_DIR };
