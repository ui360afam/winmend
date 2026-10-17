'use strict';
// One-click local runner: http://localhost:8093, data kept in ./data-local
const path = require('path');
const { spawn, exec } = require('child_process');
const major = Number(process.versions.node.split('.')[0]);
if (major < 18) { console.error(`Node.js 18 or newer is required (you have ${process.versions.node}). Get it from https://nodejs.org`); process.exit(1); }
const root = path.join(__dirname, '..');
const PORT = process.env.PORT || '8093';
const env = { ...process.env, PORT, DATA_DIR: process.env.DATA_DIR || path.join(root, 'data-local'), BASE_URL: process.env.BASE_URL || `http://localhost:${PORT}` };
const child = spawn(process.execPath, [path.join(root, 'server.js')], { env, stdio: 'inherit' });
const url = `http://localhost:${PORT}`;
setTimeout(() => {
  if (process.env.NO_BROWSER) return;
  const cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
  exec(cmd, () => {});
}, 900);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
child.on('exit', (code) => process.exit(code || 0));
