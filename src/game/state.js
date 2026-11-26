// The game's state, in one place. Every screen module reads and writes it here instead of keeping its own copy.
// Runtime handles (db, user, Claude) and the map canvas are fixed for the page; everything that changes is on S.
import { makeIsles, islesProjection, drawIsles, WORLD } from '../v2/isles.js';
import { TownSim } from '../v2/townsim.js';
import { $ } from './ui.js';
import { FEST } from './rules.js';

const use = async (n) => (await window.claude?.use?.(n)?.catch?.(() => null)) ?? null;
export const [db, user, sample] = await Promise.all([use('db'), use('user'), use('sample')]);
export const me = user ? await user.id() : null, isOwner = user ? await user.isOwner() : false;

// which board (ten islands of one group of friends) this page shows; the first board keeps the old collection name
export const BOARD = new URLSearchParams(location.search).get('board') || 'main';
export const COL = BOARD === 'main' ? 'i' : 'i-' + BOARD;

// the map canvas and its projection
export const pr = islesProjection(), map = $('map'); map.width = pr.width; map.height = pr.height;
export const g = map.getContext('2d'); g.imageSmoothingEnabled = false;

/** The map's walkers. Nobody lives here until someone builds. */
export const sim = new TownSim(11, { w: WORLD.w, d: WORLD.d, isRoad: () => false, lots: [] }, { base: 0 });

// lists that only grow and shrink (never replaced)
export const pops = [];          // floating words over buildings: { key, text, mine, bad, t }
export const earned = [];        // [time, coins] my shops earned, for coins per minute
export const boats = [];         // boats on the sea
export const nextBoat = new Map();   // slot → when its next boat leaves (seconds)
export const splash = [];        // spray and dust particles on the map

export const now = () => Date.now();

export const S = {
  // saved islands
  docs: new Map(),               // uid → { slot, at, plots, half, wallet, land, rev }
  owners: new Map(),             // slot → uid (first to take it)
  myDoc: null, mySlot: 0,
  dirty: false,                  // myDoc changed since the last save
  names: {}, boardName: BOARD === 'main' ? '첫 군도' : '',
  world: makeIsles(new Set(), new Map()),
  ground: null,                  // the islands drawn once, under everything
  // the camera
  zoom: 1, scrolled: false,
  // what the player is doing
  current: null,                 // what the panel shows: { kind: 'info' | 'build', key }
  size: 'S', hover: null, buildMode: false,
  card: null,                    // the request card picked for the next building
  building: null,                // the building Claude is writing now: { x, z, size, stage }
  moving: null,                  // the building being moved: { key, size }
  watching: null,                // the shop whose inside is open
  zoomShop: null, camBefore: null,   // the roof lifting off an opened shop; the camera to go back to
  joinShown: false, guided: false, tutSpot: null,
  // the map as last drawn
  drawn: [], lastTops: {}, landAnim: null, unmet: [],
  // boats and the festival
  callReady: 0, fest: null, nextFest: performance.now() / 1000 + FEST.first,
};
S.ground = drawIsles(S.world, pr);
