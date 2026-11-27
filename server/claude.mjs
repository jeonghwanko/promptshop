// Claude for building: streams the model's text back, within limits. A build or an extension costs one of the
// player's daily calls; the one follow-up that fixes a build ('revise') is free within 5 minutes of it.
//   SAMPLE=api   the Anthropic API (ANTHROPIC_API_KEY)        SAMPLE=cli   the local `claude` CLI (testing, or a subscription token: CLAUDE_CODE_OAUTH_TOKEN)
//   SAMPLE=echo  a fixed answer, instantly (checks)
import Anthropic from '@anthropic-ai/sdk';
import { spawn } from 'node:child_process';
import os from 'node:os';

export const PER_USER = +(process.env.CLAUDE_PER_USER ?? 5), PER_DAY = +(process.env.CLAUDE_PER_DAY ?? 300), MODEL = process.env.CLAUDE_MODEL ?? 'claude-haiku-5-5';
const SYSTEM = 'You write building specs for a game. Follow the instructions in the message exactly and output only what they ask for.';
const MAX_PROMPT = 60000;
export const today = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);   // the day turns at midnight in Korea

/** null when the call may go ahead, else { status, code }. Records the call when it may. */
export function admit(store, uid, kind) {
  const day = today(), sql = store.sql;
  if (!['build', 'extend', 'revise'].includes(kind)) return { status: 400, code: 'bad_kind' };
  if (kind === 'revise') {   // free once, right after a build of mine
    const last = sql.prepare(`SELECT at, kind FROM calls WHERE uid = ? ORDER BY at DESC LIMIT 1`).get(uid);
    if (!last || last.kind !== 'build' || Date.now() - last.at > 5 * 60e3) return { status: 429, code: 'daily_limit' };
  } else {
    const mine = sql.prepare(`SELECT COUNT(*) AS n FROM calls WHERE uid = ? AND day = ? AND kind != 'revise'`).get(uid, day).n;
    if (mine >= PER_USER) return { status: 429, code: 'daily_limit' };
    const all = sql.prepare(`SELECT COUNT(*) AS n FROM calls WHERE day = ?`).get(day).n;
    if (all >= PER_DAY) return { status: 503, code: 'busy' };
  }
  sql.prepare(`INSERT INTO calls (uid, day, kind, at) VALUES (?, ?, ?, ?)`).run(uid, day, kind, Date.now());
  return null;
}
export const left = (store, uid) => Math.max(0, PER_USER - store.sql.prepare(`SELECT COUNT(*) AS n FROM calls WHERE uid = ? AND day = ? AND kind != 'revise'`).get(uid, today()).n);

let client = null;
// SAMPLE=cli on a small VM: at most CLAUDE_CLI_MAX `claude` processes at once (each takes a few hundred MB); the rest wait in line.
const CLI_MAX = +(process.env.CLAUDE_CLI_MAX ?? 2); let cliBusy = 0; const cliLine = [];
const cliSlot = (req) => cliBusy < CLI_MAX ? (cliBusy++, Promise.resolve()) : new Promise((go) => { const t = () => { cliBusy++; go(); }; cliLine.push(t); req.on('close', () => { const i = cliLine.indexOf(t); if (i >= 0) { cliLine.splice(i, 1); go(); cliBusy++; } }); });
const cliFree = () => { cliBusy--; cliLine.shift()?.(); };
/** Stream the answer to `prompt` into res (plain text). */
export async function stream(prompt, res, req) {
  if (typeof prompt !== 'string' || !prompt || prompt.length > MAX_PROMPT) { res.writeHead(400); return res.end('bad prompt'); }
  const mode = process.env.SAMPLE ?? 'api';
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' });
  if (mode === 'echo') { res.write('{"step":"building","type":"cafe","name":"시험 카페"}\n'); return res.end(); }
  if (mode === 'cli') {
    await cliSlot(req); if (req.destroyed) { cliFree(); return res.end(); }
    const cli = spawn(process.env.CLAUDE_BIN ?? 'claude', ['-p', '--model', 'haiku', '--output-format', 'stream-json', '--include-partial-messages', '--verbose', '--tools', '', '--no-session-persistence', '--system-prompt', SYSTEM], { stdio: ['pipe', 'pipe', 'pipe'], cwd: os.tmpdir() });
    cli.stdin.end(prompt); let buf = '';
    cli.stdout.on('data', (c) => { buf += c; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); try { const m = JSON.parse(line), d = m.type === 'stream_event' && m.event?.type === 'content_block_delta' && m.event.delta?.text; if (d) res.write(d); } catch {} } });
    cli.on('error', (e) => { console.error('claude cli', e.message); });
    cli.on('close', () => { cliFree(); res.end(); }); req.on('close', () => { if (!res.writableEnded) cli.kill(); });
    return;
  }
  client ??= new Anthropic();   // ANTHROPIC_API_KEY from the environment
  const ctl = new AbortController(); req.on('close', () => { if (!res.writableEnded) ctl.abort(); });
  try {
    const s = client.messages.stream({ model: MODEL, max_tokens: 8000, thinking: { type: 'disabled' }, system: SYSTEM, messages: [{ role: 'user', content: prompt }] }, { signal: ctl.signal });
    for await (const ev of s) if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') res.write(ev.delta.text);
  } catch (e) { if (!ctl.signal.aborted) console.error('claude', e?.status ?? '', e?.message ?? e); }
  res.end();
}
