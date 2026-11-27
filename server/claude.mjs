// Claude for building: streams the model's text back, within limits. A build or an extension costs one of the
// player's daily calls; the one follow-up that fixes a build ('revise') is free within 5 minutes of it.
//   SAMPLE=api   the Anthropic API (ANTHROPIC_API_KEY)        SAMPLE=cli   the local `claude` CLI (testing, or a subscription token: CLAUDE_CODE_OAUTH_TOKEN)
//   SAMPLE=echo  a fixed answer, instantly (checks)
import Anthropic from '@anthropic-ai/sdk';
import { spawn } from 'node:child_process';
import os from 'node:os';

// PER_IP: accounts are free (a cookie), so a day's calls are also counted by address — enough for ten friends on one Wi-Fi
export const PER_USER = +(process.env.CLAUDE_PER_USER ?? 5), PER_IP = +(process.env.CLAUDE_PER_IP ?? 60), PER_DAY = +(process.env.CLAUDE_PER_DAY ?? 300), MODEL = process.env.CLAUDE_MODEL ?? 'claude-haiku-5-5';
const SYSTEM = 'You write building specs for a game. Follow the instructions in the message exactly and output only what they ask for.';
const MAX_PROMPT = 60000;
export const today = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);   // the day turns at midnight in Korea

let ipColumn = false;
/** { no: { status, code } } when the call may not go ahead; else it is recorded and { refund() } takes it back (a call that brought nothing). */
export function admit(store, uid, kind, ip = '') {
  const day = today(), sql = store.sql, no = (status, code) => ({ no: { status, code } });
  if (!ipColumn) { if (!sql.prepare(`SELECT 1 FROM pragma_table_info('calls') WHERE name = 'ip'`).get()) sql.exec(`ALTER TABLE calls ADD COLUMN ip TEXT`); ipColumn = true; }
  if (!['build', 'extend', 'revise'].includes(kind)) return no(400, 'bad_kind');
  if (kind === 'revise') {   // free once, right after a build of mine
    const last = sql.prepare(`SELECT at, kind FROM calls WHERE uid = ? ORDER BY at DESC LIMIT 1`).get(uid);
    if (!last || last.kind !== 'build' || Date.now() - last.at > 5 * 60e3) return no(429, 'daily_limit');
  } else {
    const mine = sql.prepare(`SELECT COUNT(*) AS n FROM calls WHERE uid = ? AND day = ? AND kind != 'revise'`).get(uid, day).n;
    if (mine >= PER_USER) return no(429, 'daily_limit');
    if (ip && sql.prepare(`SELECT COUNT(*) AS n FROM calls WHERE ip = ? AND day = ? AND kind != 'revise'`).get(ip, day).n >= PER_IP) return no(429, 'daily_limit');
    const all = sql.prepare(`SELECT COUNT(*) AS n FROM calls WHERE day = ?`).get(day).n;
    if (all >= PER_DAY) return no(503, 'busy');
  }
  const row = sql.prepare(`INSERT INTO calls (uid, day, kind, at, ip) VALUES (?, ?, ?, ?, ?)`).run(uid, day, kind, Date.now(), ip).lastInsertRowid;
  return { refund: () => sql.prepare(`DELETE FROM calls WHERE rowid = ?`).run(row) };
}
export const left = (store, uid) => Math.max(0, PER_USER - store.sql.prepare(`SELECT COUNT(*) AS n FROM calls WHERE uid = ? AND day = ? AND kind != 'revise'`).get(uid, today()).n);

let client = null;
// SAMPLE=cli on a small VM: at most CLAUDE_CLI_MAX `claude` processes at once (each takes a few hundred MB); the rest wait in line.
const CLI_MAX = +(process.env.CLAUDE_CLI_MAX ?? 2); let cliBusy = 0; const cliLine = [];
const cliSlot = (res) => cliBusy < CLI_MAX ? (cliBusy++, Promise.resolve()) : new Promise((go) => { const t = () => { cliBusy++; go(); }; cliLine.push(t); res.on('close', () => { const i = cliLine.indexOf(t); if (i >= 0) { cliLine.splice(i, 1); go(); cliBusy++; } }); });
const cliFree = () => { cliBusy--; cliLine.shift()?.(); };
/** Stream the answer to `prompt` into res (plain text). */
export async function stream(prompt, res, req, refund = () => {}) {
  if (typeof prompt !== 'string' || !prompt || prompt.length > MAX_PROMPT) { refund(); res.writeHead(400); return res.end('bad prompt'); }
  const mode = process.env.SAMPLE ?? 'api';
  // the 200 waits for the first words: a call that fails before them is refunded and answered 503, so the page knows
  let started = false;
  const put = (t) => { if (!started) { started = true; res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' }); } res.write(t); };
  const finish = () => { if (started) return res.end(); refund(); if (!res.headersSent && !res.destroyed) { res.writeHead(503, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'claude_failed' })); } };
  if (mode === 'echo') { put('{"step":"building","type":"cafe","name":"시험 카페"}\n'); return res.end(); }
  if (mode === 'cli') {
    await cliSlot(res); if (res.destroyed) { cliFree(); refund(); return res.end(); }
    const cli = spawn(process.env.CLAUDE_BIN ?? 'claude', ['-p', '--model', 'haiku', '--output-format', 'stream-json', '--include-partial-messages', '--verbose', '--tools', '', '--no-session-persistence', '--system-prompt', SYSTEM], { stdio: ['pipe', 'pipe', 'pipe'], cwd: os.tmpdir() });
    cli.stdin.on('error', () => {});   // the CLI may exit before reading it all (a bad token): that must not take the server down
    cli.stdin.end(prompt); let buf = '';
    cli.stdout.on('data', (c) => { buf += c; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); try { const m = JSON.parse(line), d = m.type === 'stream_event' && m.event?.type === 'content_block_delta' && m.event.delta?.text; if (d) put(d); } catch {} } });
    cli.on('error', (e) => { console.error('claude cli', e.message); });
    cli.on('close', () => { cliFree(); finish(); }); res.on('close', () => { if (!res.writableEnded) cli.kill(); });   // res, not req: req closes as soon as its body is read
    return;
  }
  client ??= new Anthropic();   // ANTHROPIC_API_KEY from the environment
  const ctl = new AbortController(); res.on('close', () => { if (!res.writableEnded) ctl.abort(); });
  try {
    const s = client.messages.stream({ model: MODEL, max_tokens: 8000, thinking: { type: 'disabled' }, system: SYSTEM, messages: [{ role: 'user', content: prompt }] }, { signal: ctl.signal });
    for await (const ev of s) if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') put(ev.delta.text);
  } catch (e) { if (!ctl.signal.aborted) console.error('claude', e?.status ?? '', e?.message ?? e); }
  finish();
}
