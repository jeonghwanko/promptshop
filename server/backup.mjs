#!/usr/bin/env node
// A snapshot of the game's data, made while the server runs (VACUUM INTO is consistent under WAL):
// BACKUP_DIR/isles-<day>.db.gz, plus the session secret (lose it and every player loses their island) and the
// link-preview pictures. Keeps the last BACKUP_KEEP days. Run daily by deploy/we-oddbout-backup.timer.
// env: DATA_DIR (server-data), BACKUP_DIR (DATA_DIR/../backups), BACKUP_KEEP (14)
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs'; import path from 'node:path'; import zlib from 'node:zlib'; import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.resolve(process.env.DATA_DIR ?? path.join(root, 'server-data')), OUT = path.resolve(process.env.BACKUP_DIR ?? path.join(DATA, '..', 'backups')), KEEP = +(process.env.BACKUP_KEEP ?? 14);
fs.mkdirSync(OUT, { recursive: true, mode: 0o700 });
const day = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10), tmp = path.join(OUT, `.isles-${day}.db`);
fs.rmSync(tmp, { force: true });
const db = new DatabaseSync(path.join(DATA, 'isles.db'));
db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`); db.close();
// the copy must open and hold what the live one holds
const check = new DatabaseSync(tmp, { readOnly: true }), n = check.prepare(`SELECT (SELECT COUNT(*) FROM docs) AS docs, (SELECT COUNT(*) FROM users) AS users`).get(), ok = check.prepare(`PRAGMA integrity_check`).get(); check.close();
if (Object.values(ok)[0] !== 'ok') { fs.rmSync(tmp); throw new Error('backup failed its integrity check'); }
const out = path.join(OUT, `isles-${day}.db.gz`);
fs.writeFileSync(out, zlib.gzipSync(fs.readFileSync(tmp), { level: 9 }), { mode: 0o600 }); fs.rmSync(tmp);
for (const f of ['secret']) if (fs.existsSync(path.join(DATA, f))) fs.copyFileSync(path.join(DATA, f), path.join(OUT, f));
fs.mkdirSync(path.join(OUT, 'og'), { recursive: true });
for (const f of fs.readdirSync(path.join(DATA, 'og'))) fs.copyFileSync(path.join(DATA, 'og', f), path.join(OUT, 'og', f));
const old = fs.readdirSync(OUT).filter(f => /^isles-\d{4}-\d\d-\d\d\.db\.gz$/.test(f)).sort().slice(0, -KEEP);
for (const f of old) fs.rmSync(path.join(OUT, f));
console.log(`backup ${out} (${(fs.statSync(out).size / 1024).toFixed(0)} KB, ${n.docs} docs, ${n.users} players${old.length ? `, removed ${old.length} old` : ''})`);
