// The diamond shop (2026-11-28): diamonds and build tickets bought through Polar, spent on builds past the five free a day.
//   1 diamond = 10 won; a build = 50 diamonds; a build ticket = one build.
//   starter (once per player): 20 build tickets + 500 diamonds, US$3.49 (about 4,900 won)
//   d500 / d1100 / d3500: diamonds, US$3.49 / $6.99 / $20.99
// The wallet lives here, in the server's store, never in the island doc (the page writes that one). A purchase is a
// checkout this server opened (orders table) and then Polar's signed `order.paid`; `order.refunded` takes it back.
// The Polar organization also sells ODDBOUT items: an order whose checkout is not in our table is answered and ignored.
//
// env: POLAR_ACCESS_TOKEN, POLAR_WEBHOOK_SECRET, POLAR_ENV (sandbox | production, default production), POLAR_API (tests),
//      POLAR_PRODUCT_STARTER, POLAR_PRODUCT_D500, POLAR_PRODUCT_D1100, POLAR_PRODUCT_D3500
import crypto from 'node:crypto';

export const BUILD_DIA = 50;
export const CATALOG = {
  starter: { cents: 349, builds: 20, dia: 500, once: true, won: 4900 },
  d500: { cents: 349, builds: 0, dia: 500, won: 5000 },
  d1100: { cents: 699, builds: 0, dia: 1100, won: 10000 },
  d3500: { cents: 2099, builds: 0, dia: 3500, won: 30000 },
};
const API_VERSION = '2026-10', WEBHOOK_BYTES = 128 * 1024, SIGNATURE_WINDOW = 300;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRODUCT_ENV = { starter: 'POLAR_PRODUCT_STARTER', d500: 'POLAR_PRODUCT_D500', d1100: 'POLAR_PRODUCT_D1100', d3500: 'POLAR_PRODUCT_D3500' };

export function shopConfig(env = process.env) {
  const products = Object.fromEntries(Object.entries(PRODUCT_ENV).map(([sku, k]) => [sku, env[k] ?? '']).filter(([, id]) => UUID.test(id)));
  const sandbox = env.POLAR_ENV === 'sandbox';
  return { token: env.POLAR_ACCESS_TOKEN ?? '', secret: env.POLAR_WEBHOOK_SECRET ?? '', products,
    api: env.POLAR_API ?? (sandbox ? 'https://sandbox-api.polar.sh' : 'https://api.polar.sh'), sandbox };
}

export function createShop(store, config, { origin, log = () => {}, fetcher = fetch, clock = Date.now } = {}) {
  const sql = store.sql;
  sql.exec(`CREATE TABLE IF NOT EXISTS wallets (uid TEXT PRIMARY KEY, dia INTEGER NOT NULL DEFAULT 0, builds INTEGER NOT NULL DEFAULT 0, starter INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS orders (checkout TEXT PRIMARY KEY, uid TEXT NOT NULL, sku TEXT NOT NULL, product TEXT NOT NULL, cents INTEGER NOT NULL, state TEXT NOT NULL, order_id TEXT, at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS ledger (id INTEGER PRIMARY KEY AUTOINCREMENT, uid TEXT NOT NULL, dia INTEGER NOT NULL, builds INTEGER NOT NULL, why TEXT NOT NULL, ref TEXT, at INTEGER NOT NULL);`);
  for (const c of ['granted_dia', 'granted_builds']) if (!sql.prepare(`SELECT 1 FROM pragma_table_info('orders') WHERE name = ?`).get(c)) sql.exec(`ALTER TABLE orders ADD COLUMN ${c} INTEGER`);   // what the payment gave: a refund takes exactly that back
  const enabled = () => !!(config.token && config.secret) ? Object.keys(config.products) : [];
  const walletOf = (uid) => sql.prepare(`SELECT dia, builds, starter FROM wallets WHERE uid = ?`).get(uid) ?? { dia: 0, builds: 0, starter: 0 };
  /** Add (or take, with negatives) diamonds and tickets, written down in the ledger. */
  const change = (uid, dia, builds, why, ref = null, starter = 0) => {
    sql.prepare(`INSERT INTO wallets (uid, dia, builds, starter) VALUES (?, ?, ?, ?) ON CONFLICT(uid) DO UPDATE SET dia = dia + excluded.dia, builds = builds + excluded.builds, starter = MAX(starter, excluded.starter)`).run(uid, dia, builds, starter);
    sql.prepare(`INSERT INTO ledger (uid, dia, builds, why, ref, at) VALUES (?, ?, ?, ?, ?, ?)`).run(uid, dia, builds, why, ref, clock());
  };
  const tx = (fn) => { sql.exec('BEGIN IMMEDIATE'); try { const r = fn(); sql.exec('COMMIT'); return r; } catch (e) { sql.exec('ROLLBACK'); throw e; } };

  /** One paid build: a ticket first, else 50 diamonds. Null when there is neither; else { paid, refund() }. */
  function spendBuild(uid, ref) {
    return tx(() => {
      const w = walletOf(uid);
      if (w.builds > 0) { change(uid, 0, -1, 'build', ref); return { paid: 'ticket', refund: () => tx(() => change(uid, 0, 1, 'refund', ref)) }; }
      if (w.dia >= BUILD_DIA) { change(uid, -BUILD_DIA, 0, 'build', ref); return { paid: 'dia', refund: () => tx(() => change(uid, BUILD_DIA, 0, 'refund', ref)) }; }
      return null;
    });
  }

  /** What the page shows: the packs on sale (prices as Polar charges them) and my wallet. */
  function view(uid, checkoutId = null) {
    const w = walletOf(uid), on = enabled(), order = checkoutId && UUID.test(checkoutId) ? sql.prepare(`SELECT state FROM orders WHERE checkout = ? AND uid = ?`).get(checkoutId, uid)?.state ?? null : undefined;
    return { ...(order !== undefined ? { order } : {}), enabled: on.length > 0, buildDia: BUILD_DIA, dia: w.dia, builds: w.builds, starterBought: !!w.starter,
      packs: on.filter(sku => !(CATALOG[sku].once && w.starter)).map(sku => ({ sku, ...CATALOG[sku] })) };
  }

  async function checkout(uid, sku, back) {
    const item = CATALOG[sku], product = config.products[sku];
    if (!item || !product || !enabled().includes(sku)) return { status: 503, error: 'shop_off' };
    if (item.once && walletOf(uid).starter) return { status: 409, error: 'starter_bought' };
    let session;
    try {
      const r = await fetcher(`${config.api}/v1/checkouts/`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10_000),
        headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json', 'Polar-Version': API_VERSION },
        body: JSON.stringify({ products: [product], external_customer_id: uid, allow_discount_codes: false, allow_trial: false, metadata: { popisle: sku },
          success_url: `${back}${back.includes('?') ? '&' : '?'}paid={CHECKOUT_ID}`, return_url: back }) });
      if (!r.ok) { log({ shop: 'checkout', status: r.status, sku }); return { status: 503, error: 'shop_unavailable' }; }
      session = await r.json();
    } catch (e) { log({ shop: 'checkout', error: String(e?.message ?? e), sku }); return { status: 503, error: 'shop_unavailable' }; }
    // the checkout must be what we sell: our product, this player, the price we show, one time, in dollars
    if (!UUID.test(session?.id ?? '') || session.product_id !== product || session.external_customer_id !== uid || session.currency !== 'usd'
      || session.amount !== item.cents || session.is_payment_required !== true || session.product?.is_recurring !== false) { log({ shop: 'checkout-mismatch', sku }); return { status: 503, error: 'shop_unavailable' }; }
    let url; try { url = new URL(session.url); } catch { return { status: 503, error: 'shop_unavailable' }; }
    if (!['https://polar.sh', 'https://sandbox.polar.sh', 'https://buy.polar.sh', 'https://sandbox-buy.polar.sh'].includes(url.origin) && !config.api.startsWith('http://127.0.0.1')) return { status: 503, error: 'shop_unavailable' };
    sql.prepare(`INSERT INTO orders (checkout, uid, sku, product, cents, state, at) VALUES (?, ?, ?, ?, ?, 'open', ?)`).run(session.id, uid, sku, product, item.cents, clock());
    return { status: 200, url: url.href };
  }

  /** Standard Webhooks signature (Polar): HMAC-SHA256 over "id.timestamp.body" with the secret (whsec_<base64> or the raw text). */
  function signed(headers, raw) {
    const id = headers['webhook-id'], ts = headers['webhook-timestamp'], sig = headers['webhook-signature'];
    if (!id || !/^\d{1,12}$/.test(ts ?? '') || !sig || Math.abs(clock() / 1000 - +ts) > SIGNATURE_WINDOW) return false;
    const enc = /^whsec_([A-Za-z0-9+/]+=*)$/.exec(config.secret)?.[1], keys = [Buffer.from(config.secret, 'utf8'), ...(enc ? [Buffer.from(enc, 'base64')] : [])];
    const msg = Buffer.concat([Buffer.from(`${id}.${ts}.`), raw]);
    return String(sig).split(' ').some(e => { if (!e.startsWith('v1,')) return false; const got = Buffer.from(e.slice(3), 'base64');
      return keys.some(k => { const want = crypto.createHmac('sha256', k).update(msg).digest(); return got.length === want.length && crypto.timingSafeEqual(got, want); }); });
  }

  /** Polar's order events: pay what this server's checkout promised, once; a refund takes it back, once. */
  function webhook(headers, raw) {
    if (!config.secret) return { status: 503, body: { error: 'shop_off' } };
    if (raw.length > WEBHOOK_BYTES || !signed(headers, raw)) return { status: 401, body: { error: 'invalid_signature' } };
    let ev; try { ev = JSON.parse(raw.toString('utf8')); } catch { return { status: 400, body: { error: 'invalid_event' } }; }
    const refunded = ev?.type === 'order.refunded'; if (!refunded && ev?.type !== 'order.paid') return { status: 200, body: { ok: true } };
    const o = ev.data ?? {}, row = UUID.test(o.checkout_id ?? '') ? sql.prepare(`SELECT * FROM orders WHERE checkout = ?`).get(o.checkout_id) : null;
    if (!row) return { status: 200, body: { ok: true, state: 'unrelated' } };   // an ODDBOUT order, or someone else's checkout
    if (o.product_id !== row.product || o.currency !== 'usd' || o.subtotal_amount !== row.cents) { log({ shop: 'order-mismatch', order: o.id }); return { status: 422, body: { error: 'order_mismatch' } }; }
    const item = CATALOG[row.sku];
    const state = tx(() => {
      const now = sql.prepare(`SELECT state FROM orders WHERE checkout = ?`).get(row.checkout).state;
      if (!refunded) {
        if (o.paid !== true || o.status !== 'paid') return 'not_paid';
        if (now !== 'open') return 'replayed';
        // a second starter (several checkouts opened before the first was paid): its price buys what 500 diamonds cost, not the first-purchase deal
        const again = item.once && walletOf(row.uid).starter, give = again ? CATALOG.d500 : item;
        change(row.uid, give.dia, give.builds, 'buy:' + row.sku + (again ? ':again' : ''), o.id, item.once ? 1 : 0);
        sql.prepare(`UPDATE orders SET state = 'paid', order_id = ?, granted_dia = ?, granted_builds = ? WHERE checkout = ?`).run(o.id, give.dia, give.builds, row.checkout); return again ? 'paid_as_diamonds' : 'paid';
      }
      if (o.status !== 'refunded') return 'not_refunded';
      if (now !== 'paid') return now === 'refunded' ? 'replayed' : 'unpaid_refund';
      const g = sql.prepare(`SELECT granted_dia AS dia, granted_builds AS builds FROM orders WHERE checkout = ?`).get(row.checkout);
      change(row.uid, -(g.dia ?? item.dia), -(g.builds ?? item.builds), 'refund:' + row.sku, o.id);   // may go below zero when already spent: nothing more can be spent then
      sql.prepare(`UPDATE orders SET state = 'refunded' WHERE checkout = ?`).run(row.checkout); return 'refunded';
    });
    return { status: 200, body: { ok: true, state } };
  }

  return { view, checkout, webhook, spendBuild, walletOf, enabled, origin };
}
