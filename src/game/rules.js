// The archipelago's rules: numbers and pure functions only. No DOM, no saved state, no clock, no randomness
// unless a random function is passed in. Everything that decides prices, permits, levels and festivals lives here,
// so balancing is one file and the rules can be checked without a browser.

// ---------- money ----------
export const START_COINS = 30, START_STOCK = 15;
export const RESTOCK = { units: 10, coins: 5 };            // a batch of supplies
export const BASE_COIN = { S: 2, M: 3, L: 5 };              // what a guest pays at a shop of this size, before decoration
export const BRIDGE = 30;                                   // half a bridge
export const HELPER_MAX = 4;
export const helperCost = (n) => 30 * 2 ** n;               // the n-th helper (0-based)
export const vipBonus = (stars) => 6 * stars;               // a VIP's tip
export const REQ_BONUS = 15;                                // building what a request card asked for

// ---------- land ----------
export const MAX_PLOTS = 8, PLOTS_PER_LAND = 3;
export const LAND_COST = [80, 200, 450, 900], LAND_LEVEL = [0, 1, 2, 3];   // per widening step: its price, the island level it needs
export const maxPlots = (land = 0) => MAX_PLOTS + PLOTS_PER_LAND * land;

// ---------- growth: guests fill the permit gauge; served guests raise the island's level ----------
export const LEVELS = [{ at: 0, name: '마을', size: 'S' }, { at: 40, name: '동네', size: 'M' }, { at: 150, name: '거리', size: 'L' }, { at: 400, name: '번화가', size: 'L' }];
export const levelOf = (served) => LEVELS.reduce((i, l, k) => served >= l.at ? k : i, 0);
export const sizesOpen = (lv) => ['S', 'M', 'L'].slice(0, Math.min(3, lv + 1));
/** Guests between permits: 6, then 10, 14, 18 … (the first ones come quickly). */
export const permitGap = (earned) => 6 + 4 * earned;
/**
 * Bring a wallet's permit gauge up to date (fills missing fields, fixes gaps from older rules) and pay out every
 * permit its served guests have earned. Changes the wallet in place; returns how many permits were paid now.
 */
export function payPermits(w) {
  w.permits ??= 1; w.served ??= 0; w.prevAt ??= 0; w.earnedP ??= 0; w.nextAt ??= w.prevAt + permitGap(w.earnedP);
  if (w.nextAt - w.prevAt > permitGap(w.earnedP)) w.nextAt = w.prevAt + permitGap(w.earnedP);   // islands from before the shorter gaps
  let got = 0; while (w.served >= w.nextAt) { w.permits++; w.earnedP++; w.prevAt = w.nextAt; w.nextAt = w.prevAt + permitGap(w.earnedP); got++; }
  return got;
}

// ---------- boats ----------
/** How often a boat comes to an island and how many it brings: more shops and fuller shops draw more. */
export const boatPlanOf = (shops, fixtures) => ({ every: Math.round(Math.max(6, 18 - 3 * shops - Math.floor(fixtures / 2))), people: Math.min(14, 3 + shops + Math.floor(fixtures / 3)), shops, fx: fixtures });

// ---------- the festival boat ----------
export const FEST = {
  first: 90, every: 240, warn: 60,   // seconds: before the first, between festivals, its approach
  window: 75,                        // seconds after landing that count
  over: 1.25,                        // how many more come than the shops can take
  patience: 40,                      // how long a festival guest tries before giving up
  max: 70,                           // never more than this many
};
/**
 * Who comes to a festival. can: { need: guests my shops of that kind can take in the window }.
 * Each kind I serve gets a little more than it can take; one kind nobody on my island sells sends a few too.
 */
export function festNeeds(can, needKeys, rnd = Math.random) {
  const sum = Object.values(can).reduce((a, b) => a + b, 0) * FEST.over, k0 = Math.min(1, (FEST.max - 4) / Math.max(1, sum));
  const out = {}; for (const [k, c] of Object.entries(can)) out[k] = Math.max(3, Math.round(c * FEST.over * k0));
  const other = needKeys.filter(k => !can[k]); if (other.length) out[other[Math.floor(rnd() * other.length)]] = 2 + Math.floor(rnd() * 3);
  return out;
}
/** What one shop can take in the festival window: a full queue, then what it serves while guests still wait. */
export const festCapacity = (rates) => rates.cap + FEST.patience / Math.max(.5, rates.interval);
/** A festival guest's tip: about what the island earns in 1.5 s, at least 5. */
export const festTip = (perMinute) => Math.max(5, Math.round(perMinute / 40));
/** Stars for the share of festival guests served; three stars add half the tips again. */
export const festStars = (served, total) => { const r = served / Math.max(1, total); return r >= .9 ? 3 : r >= .7 ? 2 : r >= .45 ? 1 : 0; };
export const festBonus = (stars, tips) => stars === 3 ? Math.round(tips / 2) : 0;

// ---------- words ----------
const BAD = ['시발', '씨발', '병신', '좆', '개새', 'fuck', 'shit', 'bitch', 'nigger', 'nazi', '섹스', 'sex'];
export const bad = (t) => BAD.some(w => (t ?? '').toLowerCase().includes(w));
