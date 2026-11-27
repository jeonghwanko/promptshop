// Who comes back, from the hosted game's store (the `log` docs that track() in src/game/persist.js writes, one per player and board).
// Usage: node scripts/retention.mjs [store.db | backup.db.gz] [--since YYYY-MM-DD]
//   default: the newest backup in ~/backups/we-oddbout (scripts/pull-backup.sh pulls one a day)
// Per first-play day: players, and how many came back on day 1, 3 and 7 (Korean days, the game's own); sessions and their length;
// how much the reasons to come back are used: the vault, today's special guest, shop fronts, building.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import zlib from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';

const args = process.argv.slice(2), since = args.includes('--since') ? args[args.indexOf('--since') + 1] : null;
let file = args.find(a => !a.startsWith('--') && a !== since);
if (!file) { const dir = path.join(os.homedir(), 'backups/we-oddbout'); file = path.join(dir, fs.readdirSync(dir).filter(f => f.endsWith('.db.gz')).sort().pop()); }
const named = file;
if (file.endsWith('.gz')) { const tmp = path.join(os.tmpdir(), `retention-${process.pid}.db`); fs.writeFileSync(tmp, zlib.gunzipSync(fs.readFileSync(file))); process.on('exit', () => fs.rmSync(tmp, { force: true })); file = tmp; }
const db = new DatabaseSync(file, { readOnly: true });

const day = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10);
const dayN = (d) => Date.parse(d + 'T00:00:00Z') / 864e5;
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
const players = [];
for (const r of db.prepare(`SELECT id, data FROM docs WHERE col = 'log'`).all()) {
  let d; try { d = JSON.parse(r.data); } catch { continue; }
  const ev = Object.entries(d ?? {}).map(([k, v]) => ({ t: +k.slice(0, k.indexOf('_')), e: k.slice(k.indexOf('_') + 1), ...(v ?? {}) })).filter(x => Number.isFinite(x.t)).sort((a, b) => a.t - b.t);
  if (!ev.length) continue;
  const first = day(ev[0].t); if (since && first < since) continue;
  const days = new Set(ev.map(x => day(x.t))), back = (n) => [...days].some(x => dayN(x) - dayN(first) === n);
  const sessions = ev.filter(x => x.e === 'session'), alive = ev.filter(x => x.e === 'alive').map(x => x.s / 60);
  const count = (e) => ev.filter(x => x.e === e).length;
  players.push({ id: r.id, first, days: days.size, d1: back(1), d3: back(3), d7: back(7), sessions: sessions.length, gaps: sessions.map(x => x.gap).filter(g => g != null), mins: alive,
    builds: count('build'), vault: count('vault_open'), vaultCoins: ev.filter(x => x.e === 'vault_open').map(x => x.coins), guestOpen: count('guest_open'), guestWelcome: count('guest_welcome'), guestBuild: count('guest_build'),
    looks: count('look_buy'), level: Math.max(0, ...ev.filter(x => x.e === 'level').map(x => x.lv)) });
}
const pct = (n, of) => (of ? `${Math.round(n / of * 100)}%` : '-');
console.log(`store: ${named}${since ? `  since ${since}` : ''}\nplayers with a log: ${players.length}  (played more than once: ${players.filter(p => p.sessions > 1).length})`);
console.log('\nfirst day     players   D1     D3     D7     (a later day counts only once that day has come)');
const today = day(Date.now());
for (const d of [...new Set(players.map(p => p.first))].sort()) {
  const ps = players.filter(p => p.first === d), age = dayN(today) - dayN(d), col = (n, k) => (age >= n ? pct(ps.filter(p => p[k]).length, ps.length) : '·').padStart(6);
  console.log(`${d}  ${String(ps.length).padStart(7)} ${col(1, 'd1')} ${col(3, 'd3')} ${col(7, 'd7')}`);
}
const all = players.flatMap(p => p.mins), gaps = players.flatMap(p => p.gaps);
console.log(`\nsessions: ${players.reduce((a, p) => a + p.sessions, 0)}  median length ${median(all)?.toFixed(1) ?? '-'} min  median time since the last one ${median(gaps) != null ? (median(gaps) / 60).toFixed(1) + ' h' : '-'}`);
const used = (k) => players.filter(p => p[k] > 0).length;
console.log(`buildings built: ${players.reduce((a, p) => a + p.builds, 0)} by ${used('builds')} players`);
console.log(`vault opened: ${players.reduce((a, p) => a + p.vault, 0)} times by ${used('vault')} players, median ${median(players.flatMap(p => p.vaultCoins)) ?? '-'} coins`);
console.log(`special guest: seen by ${used('guestOpen')}, welcomed ${players.reduce((a, p) => a + p.guestWelcome, 0)} times, "지으러 가기" ${players.reduce((a, p) => a + p.guestBuild, 0)} times`);
console.log(`shop fronts bought: ${players.reduce((a, p) => a + p.looks, 0)} by ${used('looks')} players;  highest level reached: ${Math.max(0, ...players.map(p => p.level))}`);
