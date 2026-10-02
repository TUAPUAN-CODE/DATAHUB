// Runs every src/**/*.test.ts with the built-in node:test runner (no extra dependency).
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const found = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.test.ts')) found.push(p);
  }
})(path.join(__dirname, '..', 'src'));

if (!found.length) { console.log('no tests'); process.exit(0); }
const r = spawnSync(process.execPath, ['--require', 'ts-node/register/transpile-only', '--test', ...found], { stdio: 'inherit' });
process.exit(r.status ?? 1);
