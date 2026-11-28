// The diamond shop end to end, against a fake Polar (no network): packs on sale, a checkout, Polar's signed order events
// (paid once, replays and other shops' orders ignored, refunds taken back), and builds past the five free ones paid with a
// ticket, then with 50 diamonds. Starts its own server (SAMPLE=echo). Usage: node scripts/check-shop.mjs
import { spawn } from 'node:child_process';
import crypto from 'node:crypto'; import fs from 'node:fs'; import http from 'node:http'; import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shop-check-')), PORT = 5393, POLAR = 5394;
const P = { starter: '11111111-1111-4111-8111-111111111111', d500: '22222222-2222-4222-8222-222222222222', d1100: '33333333-3333-4333-8333-333333333333', d3500: '44444444-4444-4444-8444-444444444444' };
const CENTS = { [P.starter]: 349, [P.d500]: 349, [P.d1100]: 699, [P.d3500]: 2099 }, SECRET = 'whsec_' + crypto.randomBytes(32).toString('base64');
const check = (name, ok, info = '') => { console.log(ok ? 'PASS' : 'FAIL', name, info); if (!ok) process.exitCode = 1; };

// the fake Polar: makes a checkout session the way the real one answers
const sessions = new Map();
const polar = http.createServer((req, res) => { let b = ''; req.on('data', c => b += c); req.on('end', () => {
  const q = JSON.parse(b || '{}'), product = q.products?.[0], id = crypto.randomUUID();
  const s = { id, product_id: product, external_customer_id: q.external_customer_id, currency: 'usd', amount: CENTS[product], is_payment_required: true, product: { is_recurring: false }, url: `http://127.0.0.1:${POLAR}/checkout/${id}` };
  sessions.set(id, s); res.writeHead(201, { 'content-type': 'application/json' }); res.end(JSON.stringify(s)); }); }).listen(POLAR, '127.0.0.1');
const env = { ...process.env, PORT: String(PORT), DATA_DIR: dir, SAMPLE: 'echo', CLAUDE_PER_USER: '5', CLAUDE_PER_IP: '60', CLAUDE_PER_IP_HOUR: '100', CLAUDE_PER_DAY: '18',
  POLAR_ACCESS_TOKEN: 'test', POLAR_WEBHOOK_SECRET: SECRET, POLAR_API: `http://127.0.0.1:${POLAR}`,
  POLAR_PRODUCT_STARTER: P.starter, POLAR_PRODUCT_D500: P.d500, POLAR_PRODUCT_D1100: P.d1100, POLAR_PRODUCT_D3500: P.d3500 };
const srv = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(root, 'server/main.mjs')], { env, stdio: ['ignore', 'pipe', 'inherit'] });
process.on('exit', () => { try { srv.kill(); polar.close(); } catch {} fs.rmSync(dir, { recursive: true, force: true }); });
await new Promise(r => srv.stdout.once('data', r));
const base = `http://127.0.0.1:${PORT}`;
function player() {
  let cookie = '';
  const go = async (p, { method = 'GET', body } = {}) => {
    if (!cookie) { const r = await fetch(base + '/'); cookie = (r.headers.get('set-cookie') ?? '').split(';')[0]; await r.text(); }
    const r = await fetch(base + p, { method, body, headers: { cookie, 'x-isles': '1', ...(body ? { 'content-type': 'application/json' } : {}) } });
    const t = await r.text(); let v = t; try { v = JSON.parse(t); } catch {} return { status: r.status, v };
  };
  return { go, buy: (sku) => go('/api/shop/checkout', { method: 'POST', body: JSON.stringify({ sku, board: 'main' }) }), shop: () => go('/api/shop'),
    build: () => go('/api/sample', { method: 'POST', body: JSON.stringify({ prompt: 'x', kind: 'build' }) }) };
}
const sign = (raw, secret = SECRET) => { const id = 'msg_' + crypto.randomUUID(), ts = String(Math.floor(Date.now() / 1000)), key = Buffer.from(secret.slice(6), 'base64');
  return { 'webhook-id': id, 'webhook-timestamp': ts, 'webhook-signature': 'v1,' + crypto.createHmac('sha256', key).update(`${id}.${ts}.${raw}`).digest('base64'), 'content-type': 'application/json' }; };
const hook = async (type, checkout, { status, signed = true, product, amount, refunded } = {}) => {
  const s = sessions.get(checkout) ?? { product_id: P.d500, amount: 349 };
  const raw = JSON.stringify({ type, data: { id: crypto.randomUUID(), checkout_id: checkout, product_id: product ?? s.product_id, currency: 'usd', subtotal_amount: amount ?? s.amount, paid: true, status: status ?? (type === 'order.refunded' ? 'refunded' : 'paid'), ...(refunded != null ? { refunded_amount: refunded } : {}) } });
  const r = await fetch(base + '/api/polar/webhook', { method: 'POST', body: raw, headers: signed ? sign(raw) : { 'content-type': 'application/json' } });
  return { status: r.status, v: await r.json() };
};
const idOf = (url) => url.split('/').pop();

// packs on sale: the starter first, once
const A = player(); const v0 = (await A.shop()).v;
check('shop open with four packs, starter first', v0.enabled && v0.packs.map(x => x.sku).join() === 'starter,d500,d1100,d3500' && v0.dia === 0 && v0.builds === 0, JSON.stringify(v0.packs.map(x => [x.sku, x.cents])));
const c1 = await A.buy('starter'); check('a checkout opens on Polar', c1.status === 200 && /\/checkout\//.test(c1.v.url), JSON.stringify(c1.v));
check('an unknown pack is refused', (await A.buy('free-stuff')).status === 503);
const ck = idOf(c1.v.url);
check('an unsigned event is refused', (await hook('order.paid', ck, { signed: false })).status === 401);
{ const raw = '{}'; const h = sign(raw, 'whsec_' + crypto.randomBytes(32).toString('base64')); check('a wrong signature is refused', (await fetch(base + '/api/polar/webhook', { method: 'POST', body: raw, headers: h })).status === 401); }
check('a wrong amount is refused', (await hook('order.paid', ck, { amount: 1 })).status === 422);
const paid = await hook('order.paid', ck); const w1 = (await A.shop()).v;
check('paid: 20 tickets and 500 diamonds', paid.v.state === 'paid' && w1.builds === 20 && w1.dia === 500 && w1.starterBought, JSON.stringify([paid.v, w1.dia, w1.builds]));
check('the same event again pays nothing', (await hook('order.paid', ck)).v.state === 'replayed' && (await A.shop()).v.dia === 500);
check('the starter is sold once', !(await A.shop()).v.packs.some(x => x.sku === 'starter') && (await A.buy('starter')).status === 409);
check("another shop's order is ignored", (await hook('order.paid', crypto.randomUUID())).v.state === 'unrelated');

// builds: five free, then a ticket each; with no tickets, 50 diamonds; with neither, tomorrow
let ok = 0; for (let i = 0; i < 5; i++) if ((await A.build()).status === 200) ok++;
check('five free builds', ok === 5 && (await A.shop()).v.builds === 20);
check('the sixth takes a ticket', (await A.build()).status === 200 && (await A.shop()).v.builds === 19);
const B = player(); const cb = await B.buy('d500'); await hook('order.paid', idOf(cb.v.url));
for (let i = 0; i < 5; i++) await B.build();
check('no tickets: the sixth takes 50 diamonds', (await B.build()).status === 200 && (await B.shop()).v.dia === 450);
const C = player(); for (let i = 0; i < 5; i++) await C.build();
check('nothing bought: the sixth waits for tomorrow', (await C.build()).v.error === 'daily_limit');
check('free builds left counts only free ones', (await A.go('/api/me')).v.left === 0);

// a refund takes the pack back, once
const rf = await hook('order.refunded', idOf(cb.v.url)); const wb = (await B.shop()).v;
check('refunded: the diamonds go back', rf.v.state === 'refunded' && wb.dia === -50, JSON.stringify([rf.v, wb.dia]));
check('a refund again takes nothing more', (await hook('order.refunded', idOf(cb.v.url))).v.state === 'replayed' && (await B.shop()).v.dia === -50);
check('below zero: no paid build', (await B.build()).v.error === 'daily_limit');

// two first-purchase checkouts opened before either was paid: the second pays out as 500 diamonds, and its refund takes back just that
const F = player(); const f1 = await F.buy('starter'), f2 = await F.buy('starter');
await hook('order.paid', idOf(f1.v.url)); const second = await hook('order.paid', idOf(f2.v.url)); const wf = (await F.shop()).v;
check('a second starter pays as 500 diamonds', second.v.state === 'paid_as_diamonds' && wf.builds === 20 && wf.dia === 1000, JSON.stringify([second.v, wf.dia, wf.builds]));
await hook('order.refunded', idOf(f2.v.url)); const wf2 = (await F.shop()).v;
check('its refund takes back what it gave', wf2.builds === 20 && wf2.dia === 500, JSON.stringify([wf2.dia, wf2.builds]));

// the server's free budget for the day is spent (18 here): a player with diamonds still builds, one without waits
const D = player(); const cd = await D.buy('d500'); await hook('order.paid', idOf(cd.v.url));
const E = player(); let busy = null; for (let i = 0; i < 5; i++) { const r = await E.build(); if (r.status !== 200) { busy = r; break; } }
check('the free budget runs out', busy?.status === 503 && busy.v.error === 'busy', JSON.stringify(busy?.v));
check('diamonds still build', (await D.build()).status === 200 && (await D.shop()).v.dia === 450);

// only what was not used is refunded, so most refunds are partial: the refunded share of the pack comes back, counted in builds
const G = player(); const cg = await G.buy('d1100'); await hook('order.paid', idOf(cg.v.url));
const half = await hook('order.refunded', idOf(cg.v.url), { status: 'partially_refunded', refunded: 349 }); const wg = (await G.shop()).v;
check('a partial refund takes back that share (11 of 22 builds)', half.v.state === 'partially_refunded' && wg.dia === 550, JSON.stringify([half.v, wg.dia]));
check('the same partial refund again takes nothing more', (await hook('order.refunded', idOf(cg.v.url), { status: 'partially_refunded', refunded: 349 })).v.state === 'replayed' && (await G.shop()).v.dia === 550);
const rest = await hook('order.refunded', idOf(cg.v.url), { status: 'refunded', refunded: 699 });
check('then the full refund takes the rest', rest.v.state === 'refunded' && (await G.shop()).v.dia === 0, JSON.stringify(rest.v));
// the refund calculator: A used one ticket of the starter (30 builds), holds 19 tickets + 500 diamonds → 29 unused → $3.37
{ const { execFileSync } = await import('node:child_process');
  const q = execFileSync(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(root, 'scripts/refund-quote.mjs'), ck], { env: { ...process.env, DATA_DIR: dir } }).toString();
  check('the calculator quotes the unused share', /unused from this order 29 of 30 builds/.test(q) && /refund 3\.37 USD/.test(q), q.split('\n').slice(3, 5).join(' / ')); }
// that refund made on Polar: 29 builds come back from what A holds (19 tickets, then 500 diamonds), nothing below zero
const ra = await hook('order.refunded', ck, { status: 'partially_refunded', refunded: 337 }); const wa = (await A.shop()).v;
check('the quoted refund takes the tickets held, then diamonds', ra.v.state === 'partially_refunded' && wa.builds === 0 && wa.dia === 0, JSON.stringify([ra.v, wa.builds, wa.dia]));
process.exit();
