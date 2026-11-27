// Claude for building: streams the model's text back, within limits. A build or an extension costs one of the
// player's daily calls; the one follow-up that fixes a build ('revise') is free within 5 minutes of it.
//   SAMPLE=api   the Anthropic API (ANTHROPIC_API_KEY)        SAMPLE=cli   the local `claude` CLI (testing, or a subscription token: CLAUDE_CODE_OAUTH_TOKEN)
//   SAMPLE=echo  a fixed answer, instantly (checks)
import Anthropic from '@anthropic-ai/sdk';
import { spawn } from 'node:child_process';
import os from 'node:os';

// PER_IP: accounts are free (a cookie), so a day's calls are also counted by address — enough for ten friends on one Wi-Fi
export const PER_USER = +(process.env.CLAUDE_PER_USER ?? 5), PER_IP = +(process.env.CLAUDE_PER_IP ?? 60), PER_IP_HOUR = +(process.env.CLAUDE_PER_IP_HOUR ?? 20), PER_DAY = +(process.env.CLAUDE_PER_DAY ?? 300), MODEL = process.env.CLAUDE_MODEL ?? 'claude-haiku-5-5';
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
  // at most PER_IP_HOUR calls an hour from one address, fixes too (each holds a place in the CLI's line as long as a build),
  // so a few addresses cannot spend the whole day's budget before the day has started
  if (ip && sql.prepare(`SELECT COUNT(*) AS n FROM calls WHERE ip = ? AND at > ?`).get(ip, Date.now() - 3600e3).n >= PER_IP_HOUR) return no(429, 'rate_limited');
  const row = sql.prepare(`INSERT INTO calls (uid, day, kind, at, ip) VALUES (?, ?, ?, ?, ?)`).run(uid, day, kind, Date.now(), ip).lastInsertRowid;
  return { refund: () => sql.prepare(`DELETE FROM calls WHERE rowid = ?`).run(row) };
}
export const left = (store, uid) => Math.max(0, PER_USER - store.sql.prepare(`SELECT COUNT(*) AS n FROM calls WHERE uid = ? AND day = ? AND kind != 'revise'`).get(uid, today()).n);

let client = null;
// SAMPLE=cli on a small VM: at most CLAUDE_CLI_MAX `claude` processes at once (each takes a few hundred MB); the rest wait in line.
const CLI_MAX = +(process.env.CLAUDE_CLI_MAX ?? 2); let cliBusy = 0; const cliLine = [];
/** A place among the CLI_MAX running: true when this call holds one, false when it left the line first (it never held one). */
const cliSlot = (res) => new Promise((go) => {
  if (cliBusy < CLI_MAX) { cliBusy++; return go(true); }
  const t = () => { cliBusy++; go(true); }; cliLine.push(t);
  res.on('close', () => { const i = cliLine.indexOf(t); if (i >= 0) { cliLine.splice(i, 1); go(false); } });
});
// one answer may not hold a place for ever: a time limit and a length limit (a building's lines are a few thousand letters)
const CALL_MS = 75000, MAX_OUT = 40000;
const cliFree = () => { cliBusy--; cliLine.shift()?.(); };
/** Stream the answer to `prompt` into res (plain text). */
export async function stream(prompt, res, req, refund = () => {}) {
  if (typeof prompt !== 'string' || !prompt || prompt.length > MAX_PROMPT) { refund(); res.writeHead(400); return res.end('bad prompt'); }
  const mode = process.env.SAMPLE ?? 'api';
  // the 200 waits for the first words: a call that fails before them is refunded and answered 503, so the page knows
  // only a failure on our side is refunded: a visitor who hangs up before the first words still pays, or hanging up
  // just before them would make every call free
  let started = false, gone = false; res.on('close', () => { if (!res.writableEnded) gone = true; });
  const put = (t) => { if (!started) { started = true; res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' }); } res.write(t); };
  const finish = () => { if (started) return res.end(); if (!gone) refund(); if (!res.headersSent && !res.destroyed) { res.writeHead(503, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'claude_failed' })); } };
  if (mode === 'echo') { put('{"step":"building","type":"cafe","name":"시험 카페"}\n'); return res.end(); }
  if (mode === 'cli') {
    if (!(await cliSlot(res))) { refund(); return res.end(); }   // left while waiting in line: nothing was spent
    if (res.destroyed) { cliFree(); refund(); return res.end(); }
    const cli = spawn(process.env.CLAUDE_BIN ?? 'claude', ['-p', '--model', 'haiku', '--output-format', 'stream-json', '--include-partial-messages', '--verbose', '--tools', '', '--no-session-persistence', '--system-prompt', SYSTEM], { stdio: ['pipe', 'pipe', 'pipe'], cwd: os.tmpdir() });
    cli.stdin.on('error', () => {});   // the CLI may exit before reading it all (a bad token): that must not take the server down
    cli.stdin.end(prompt); let buf = '', out = 0; const limit = setTimeout(() => cli.kill(), CALL_MS);
    cli.stdout.on('data', (c) => { buf += c; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); try { const m = JSON.parse(line), d = m.type === 'stream_event' && m.event?.type === 'content_block_delta' && m.event.delta?.text; if (d) { out += d.length; put(d); if (out > MAX_OUT) cli.kill(); } } catch {} } });
    cli.on('error', (e) => { console.error('claude cli', e.message); });
    cli.on('close', () => { clearTimeout(limit); cliFree(); finish(); }); res.on('close', () => { if (!res.writableEnded) cli.kill(); });   // res, not req: req closes as soon as its body is read
    return;
  }
  client ??= new Anthropic();   // ANTHROPIC_API_KEY from the environment
  const ctl = new AbortController(); res.on('close', () => { if (!res.writableEnded) ctl.abort(); }); const limit = setTimeout(() => ctl.abort(), CALL_MS); let out = 0;
  try {
    const s = client.messages.stream({ model: MODEL, max_tokens: 8000, thinking: { type: 'disabled' }, system: SYSTEM, messages: [{ role: 'user', content: prompt }] }, { signal: ctl.signal });
    for await (const ev of s) if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') { put(ev.delta.text); if ((out += ev.delta.text.length) > MAX_OUT) { ctl.abort(); break; } }
  } catch (e) { if (!ctl.signal.aborted) console.error('claude', e?.status ?? '', e?.message ?? e); }
  clearTimeout(limit); finish();
}
