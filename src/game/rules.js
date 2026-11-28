// The archipelago's rules: numbers and pure functions only. No DOM, no saved state, no clock, no randomness
// unless a random function is passed in. Everything that decides prices, power and water, levels and festivals lives here,
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
/** When 끼룩이 first suggests calling a friend: the island grown this far (level index into LEVELS, my buildings). */
export const INVITE_AT = { level: 3, shops: 6 };   // 번화가 and six buildings: well after the first sessions (the owner: calling friends comes much later)

// ---------- the vault: the island trades while nobody plays (vault.js) ----------
export const VAULT = { share: .05, hours: 8, minMinutes: 10 };   // a twentieth of the live pace, net of the bill; at most eight hours; nothing under ten minutes

// ---------- a shop's front, bought tier by tier (exterior.js draws it from the plot's look): each tier brings a coin more a guest ----------
export const LOOKS = ['꽃 화단', '줄무늬 차양', '간판 전구', '파라솔 테라스'];
export const lookCost = (size, tier) => Math.round({ S: 60, M: 120, L: 240 }[size] ?? 120) * 20 * 4 ** tier;   // M: 2,400 · 9,600 · 38,400 · 153,600

// ---------- land ----------
export const MAX_PLOTS = 8, PLOTS_PER_LAND = 3;
export const LAND_COST = [1600, 4000, 9000, 18000], LAND_LEVEL = [0, 1, 2, 3];   // ×20 (2026-11-28: days, not minutes)   // per widening step: its price, the island level it needs
export const maxPlots = (land = 0) => MAX_PLOTS + PLOTS_PER_LAND * land;

// ---------- growth: served guests raise the island's level (it opens bigger sizes) ----------
// 2026-11-28: an island serves ~130 guests a minute with five shops, so the old steps (40 · 150 · 400) went by in three minutes.
// The steps are 40 times further, and four more follow: a week of growth.
export const LEVELS = [{ at: 0, name: '마을', size: 'S' }, { at: 1600, name: '동네', size: 'M' }, { at: 6000, name: '거리', size: 'L' }, { at: 16000, name: '번화가', size: 'L' },
  { at: 40000, name: '도시', size: 'L' }, { at: 100000, name: '항구 도시', size: 'L' }, { at: 240000, name: '큰 도시', size: 'L' }, { at: 600000, name: '섬의 수도', size: 'L' }];
/** The steps before 2026-11-28, for bringing a saved island over (migrate.js migrateEcon). */
export const OLD_LEVEL_AT = [0, 40, 150, 400];
export const levelOf = (served) => LEVELS.reduce((i, l, k) => served >= l.at ? k : i, 0);
export const sizesOpen = (lv) => ['S', 'M', 'L'].slice(0, Math.min(3, lv + 1));

// ---------- power and water: every building, and every machine put in it, uses some; my island supplies a limited amount ----------
// Growth is held by supply, not by money: a building (or a machine) that does not fit what the island supplies cannot go in
// until the cable joint or the water works is upgraded. Each building pays its bill every minute, whatever it earns.
export const UTIL = {
  base: { S: [1, 1], M: [2, 2], L: [3, 3] },        // a building itself, by size: [power, water]
  floor: [1, 1],                                     // each floor added later
  fix: { stove: [1, 1], machine: [1, 0], fridge: [1, 0], tv: [1, 0], lamp: [1, 0], prep: [0, 1], sink: [0, 1], toilet: [0, 1], pool: [0, 2] },
  start: [4, 6], step: [4, 4],                       // what an island supplies at first (power runs out first, a few buildings in), and each upgrade adds
  rate: 2,                                           // the bill: coins per unit used, per minute
  pipe: 2,                                           // laying cable and pipe along the road to a new building: coins per road tile
  billFrom: 5,                                       // bills start once an island has this many buildings (one lesson at a time)
};
/** A machine's use: [power, water]; levels 3 and 5 add its use once more each. */
export const fixUse = (kind, L = 1) => { const f = UTIL.fix[kind]; if (!f) return [0, 0]; const m = 1 + Math.floor(((L ?? 1) - 1) / 2); return [f[0] * m, f[1] * m]; };
/** What an island supplies after `ups` upgrades of [cable joint, water works]. */
export const supplyOf = (ups) => [UTIL.start[0] + UTIL.step[0] * (ups?.[0] ?? 0), UTIL.start[1] + UTIL.step[1] * (ups?.[1] ?? 0)];
/** The n-th upgrade (0-based) of one of them: 320, 480, 720, 1080 … */
export const supplyCost = (n) => Math.round(320 * 1.5 ** (n ?? 0));   // ×8 (2026-11-28)
/** The bill for a use, per minute. */
export const billOf = (use) => Math.round((use[0] + use[1]) * UTIL.rate);

// ---------- boats ----------
/** How often a boat comes to an island and how many it brings (2026-11-28): as many as the island's shops can take in,
 *  a little more (SLACK), so a few are always turned away and a fuller shop draws more boats. Most of them (SHARE) want
 *  what the island sells; the rest want any kind, which is what asks for new buildings. take: guests a second the
 *  island's shops serve together (Σ 1 / interval). Before, boats grew with the number of shops alone and soon brought
 *  several times what the shops could serve: the faces showed dozens waiting and the only answer was another building. */
export const BOAT = { slack: .15, share: .75, maxPeople: 14, every: [5, 16] };
export const boatPlanOf = (shops, fixtures, take = 0) => {
  if (!shops || !(take > 0)) return { every: 16, people: 3, shops, fx: fixtures };
  const rate = take * (1 + BOAT.slack) / BOAT.share, first = Math.max(8, 14 - 2 * shops);   // guests a second; a boat every `first` s to start from
  const people = Math.max(2, Math.min(BOAT.maxPeople, Math.round(rate * first))), every = Math.round(Math.max(BOAT.every[0], Math.min(BOAT.every[1], people / rate)));
  return { every, people, shops, fx: fixtures };
};

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
