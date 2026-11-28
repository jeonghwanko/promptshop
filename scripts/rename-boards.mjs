#!/usr/bin/env node
// Renames the old in-game word in stored board names: "군도" → "팝업섬" (the game's name, src/brand.js).
// Board names live in the store (boards/<id>.name), so changing the code does not change boards already made.
//
// Without --apply it only lists what it would change. With --apply it:
//   1. refuses while the server answers on PORT (the server keeps the change counter in memory: stop it first),
//   2. writes a checked copy of the store next to the daily backups (VACUUM INTO, integrity check),
//   3. renames through the store, so every change gets a new number and open pages pick it up after the restart.
//
// On the VM (docs/DEPLOY.md):
//   cd /opt/we-oddbout/current
//   DATA_DIR=/opt/we-oddbout/data /opt/we-oddbout/bin/node scripts/rename-boards.mjs            # preview
//   sudo systemctl stop we-oddbout
//   DATA_DIR=/opt/we-oddbout/data /opt/we-oddbout/bin/node scripts/rename-boards.mjs --apply
//   sudo systemctl start we-oddbout
// Back: stop the service, copy the printed backup over DATA_DIR/isles.db, delete isles.db-wal and isles.db-shm, start.
// env: DATA_DIR (server-data), PORT (5310), BACKUP_DIR (DATA_DIR/../backups)
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs'; import net from 'node:net'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { openStore } from '../server/store.mjs';

const OLD = '군도', NEW = '팝업섬', MAX = 24;   // MAX: server/rules.mjs refuses a longer board name
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.resolve(process.env.DATA_DIR ?? path.join(root, 'server-data')), PORT = +(process.env.PORT ?? 5310);
const OUT = path.resolve(process.env.BACKUP_DIR ?? path.join(DATA, '..', 'backups')), file = path.join(DATA, 'isles.db');
const apply = process.argv.includes('--apply');
if (!fs.existsSync(file)) { console.error(`no store at ${file} (set DATA_DIR)`); process.exit(1); }

const read = new DatabaseSync(file, { readOnly: true });
const plan = [];
for (const { id, data } of read.prepare(`SELECT id, data FROM docs WHERE col = 'boards' AND data IS NOT NULL`).all()) {
  let b; try { b = JSON.parse(data); } catch { continue; }
  if (typeof b?.name !== 'string' || !b.name.includes(OLD)) continue;
  const name = b.name.replaceAll(OLD, NEW);
  plan.push({ id, from: b.name, to: name, skip: name.length > MAX ? `longer than ${MAX}` : '' });
}
read.close();
for (const p of plan) console.log(`${p.skip ? 'SKIP' : 'RENAME'} ${p.id}: ${p.from} → ${p.to}${p.skip ? ` (${p.skip})` : ''}`);
const todo = plan.filter(p => !p.skip);
console.log(`${todo.length} to rename, ${plan.length - todo.length} skipped`);
if (!apply || !todo.length) { if (!apply && todo.length) console.log('preview only: stop the server, then run again with --apply'); process.exit(0); }

const listening = await new Promise(r => { const s = net.connect(PORT, '127.0.0.1', () => { s.destroy(); r(true); }).on('error', () => r(false)); });
if (listening) { console.error(`something answers on 127.0.0.1:${PORT}: stop the server first (sudo systemctl stop we-oddbout)`); process.exit(1); }

fs.mkdirSync(OUT, { recursive: true, mode: 0o700 });
const backup = path.join(OUT, `pre-rename-boards-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
{ const db = new DatabaseSync(file); db.exec(`VACUUM INTO '${backup.replace(/'/g, "''")}'`); db.close(); }
{ const c = new DatabaseSync(backup, { readOnly: true }), ok = Object.values(c.prepare('PRAGMA integrity_check').get())[0]; c.close();
  if (ok !== 'ok') { console.error(`the backup failed its integrity check: ${backup}`); process.exit(1); } }
fs.chmodSync(backup, 0o600);
console.log(`backup ${backup}`);

const store = openStore(file);
for (const p of todo) store.update('boards', p.id, { name: p.to });
const left = Object.values(store.all('boards')).filter(b => typeof b?.name === 'string' && b.name.includes(OLD) && b.name.replaceAll(OLD, NEW).length <= MAX).length;
store.sql.close();
console.log(`renamed ${todo.length}${left ? `, but ${left} still have ${OLD}` : ''}`);
process.exit(left ? 1 : 0);
