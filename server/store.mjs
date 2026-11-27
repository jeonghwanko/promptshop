// Docs in SQLite: (col, id) → JSON, each change numbered (ver) so a client can ask "what changed since n?".
// Deletions stay as rows with no data, so they reach clients too. Pure storage: no rules here.
import { DatabaseSync } from 'node:sqlite';

export function openStore(file) {
  const db = new DatabaseSync(file);
  db.exec(`PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;   -- under WAL a crash loses at most the last commits, never the file
    CREATE TABLE IF NOT EXISTS docs (col TEXT NOT NULL, id TEXT NOT NULL, data TEXT, ver INTEGER NOT NULL, PRIMARY KEY (col, id));
    CREATE INDEX IF NOT EXISTS docs_ver ON docs (col, ver);
    CREATE TABLE IF NOT EXISTS users (uid TEXT PRIMARY KEY, name TEXT NOT NULL, at INTEGER NOT NULL, google TEXT);
    CREATE TABLE IF NOT EXISTS invites (token TEXT PRIMARY KEY, board TEXT NOT NULL, uid TEXT NOT NULL, exp INTEGER NOT NULL, uses INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS calls (uid TEXT NOT NULL, day TEXT NOT NULL, kind TEXT NOT NULL, at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS calls_day ON calls (day, uid);
    CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);`);
  const q = (sql) => db.prepare(sql);
  const s = {
    getVer: q(`SELECT v FROM meta WHERE k = 'ver'`), setVer: q(`INSERT INTO meta (k, v) VALUES ('ver', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v`),
    get: q(`SELECT data FROM docs WHERE col = ? AND id = ?`),
    put: q(`INSERT INTO docs (col, id, data, ver) VALUES (?, ?, ?, ?) ON CONFLICT(col, id) DO UPDATE SET data = excluded.data, ver = excluded.ver`),
    since: q(`SELECT id, data, ver FROM docs WHERE col = ? AND ver > ? ORDER BY ver`),
    all: q(`SELECT id, data FROM docs WHERE col = ? AND data IS NOT NULL`),
    colVer: q(`SELECT MAX(ver) AS v FROM docs WHERE col = ?`),
    count: q(`SELECT COUNT(*) AS n FROM docs WHERE col = ? AND data IS NOT NULL AND substr(id, 1, 1) != '_'`),
  };
  let ver = +(s.getVer.get()?.v ?? 0);
  const listeners = new Set();
  const parse = (t) => t == null ? null : JSON.parse(t);
  // the doc and the change counter in one commit (one fsync, and never a doc without its number)
  const write = (col, id, data) => {
    db.exec('BEGIN');
    try { ver++; s.put.run(col, id, data == null ? null : JSON.stringify(data), ver); s.setVer.run(String(ver)); db.exec('COMMIT'); }
    catch (e) { db.exec('ROLLBACK'); ver = +(s.getVer.get()?.v ?? 0); throw e; }
    for (const fn of listeners) fn(col); return ver;
  };
  return {
    sql: db,
    get: (col, id) => parse(s.get.get(col, id)?.data),
    set: (col, id, data) => write(col, id, data),
    update: (col, id, patch) => write(col, id, { ...(parse(s.get.get(col, id)?.data) ?? {}), ...patch }),
    remove: (col, id) => write(col, id, null),
    count: (col) => s.count.get(col).n,
    all: (col) => Object.fromEntries(s.all.all(col).map(r => [r.id, parse(r.data)])),
    /** Changes in a collection after `after`: [{ id, data|null }], and the collection's latest number. */
    since: (col, after) => { const rows = s.since.all(col, after); return { docs: rows.map(r => ({ id: r.id, data: parse(r.data) })), ver: rows.length ? rows[rows.length - 1].ver : Math.max(after, +(s.colVer.get(col)?.v ?? 0)) }; },
    onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
  };
}
