#!/usr/bin/env node
// How much to refund on Polar for a POPISLE order (policy 2026-11-28: within 3 days of purchase, only what was not used yet).
// Read-only. Usage (on the VM):
//   cd /opt/we-oddbout/current && DATA_DIR=/opt/we-oddbout/data /opt/we-oddbout/bin/node scripts/refund-quote.mjs <Polar order id | checkout id>
// Counts in builds: a ticket is one, 50 diamonds are one. What the player still holds is set against this order, no more than the
// order gave and has not been taken back yet. Refund that share of the price in Polar; the webhook then takes the same share back.
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { CATALOG, BUILD_DIA } from '../server/shop.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.resolve(process.env.DATA_DIR ?? path.join(root, 'server-data')), id = process.argv[2];
if (!id) { console.error('usage: refund-quote.mjs <Polar order id | checkout id>'); process.exit(2); }
const db = new DatabaseSync(path.join(DATA, 'isles.db'), { readOnly: true });
const o = db.prepare(`SELECT * FROM orders WHERE order_id = ? OR checkout = ?`).get(id, id);
if (!o) { console.error('no POPISLE order with that id (an ODDBOUT order, or not paid through this server)'); process.exit(1); }
const w = db.prepare(`SELECT dia, builds FROM wallets WHERE uid = ?`).get(o.uid) ?? { dia: 0, builds: 0 };
const item = CATALOG[o.sku], gd = o.granted_dia ?? item.dia, gb = o.granted_builds ?? item.builds, td = o.taken_dia ?? 0, tb = o.taken_builds ?? 0;
const units = (b, d) => b + d / BUILD_DIA, given = units(gb, gd), left = units(gb - tb, gd - td);
const holds = Math.max(0, units(w.builds, Math.max(0, w.dia) - (Math.max(0, w.dia) % BUILD_DIA)));
const unused = Math.max(0, Math.min(left, holds)), days = (Date.now() - o.at) / 864e5;
const already = o.refunded_cents ?? 0, cents = Math.max(0, Math.floor(o.cents * unused / given));
console.log(`order ${o.order_id ?? '(not paid)'}  checkout ${o.checkout}  player ${o.uid}`);
console.log(`pack ${o.sku}  paid ${(o.cents / 100).toFixed(2)} USD  state ${o.state}  bought ${new Date(o.at).toISOString()} (${days.toFixed(1)} days ago)${days > 3 ? '  — past the 3 days' : ''}`);
console.log(`gave ${gb} tickets + ${gd} diamonds = ${given} builds; taken back so far ${tb} tickets + ${td} diamonds (${(already / 100).toFixed(2)} USD refunded)`);
console.log(`the player holds ${w.builds} tickets + ${w.dia} diamonds; unused from this order ${unused} of ${given} builds`);
console.log(o.state === 'open' ? 'not paid: nothing to refund' : unused <= 0 ? 'all used: nothing to refund' : `refund ${(cents / 100).toFixed(2)} USD (${cents} cents) on Polar`);
