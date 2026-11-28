// The game's state, in one place. Every screen module reads and writes it here instead of keeping its own copy.
// Runtime handles (db, user, Claude) and the map canvas are fixed for the page; everything that changes is on S.
import { makeIsles, islesProjection, drawIsles, WORLD } from '../v2/isles.js';
import { TownSim } from '../v2/townsim.js';
import { $ } from './ui.js';
import { FEST } from './rules.js';

const use = async (n) => (await window.claude?.use?.(n)?.catch?.(() => null)) ?? null;
export const [db, user, sample, site] = await Promise.all([use('db'), use('user'), use('sample'), use('site')]);   // site: only on the hosted game (src/site/runtime.js)
export const me = user ? await user.id() : null, isOwner = user ? await user.isOwner() : false;

// which board (ten islands of one group of friends) this page shows; the first board keeps the old collection name
export const BOARD = new URLSearchParams(location.search).get('board') || 'main';
export const COL = BOARD === 'main' ? 'i' : 'i-' + BOARD;
/** On the hosted game the first board is a showcase of sample islands: nobody lives there, everyone makes their own. */
export const SHOWCASE = !!site?.showcase && BOARD === 'main';
/** May I move into this board? Hosted boards are private: their owner, or someone who came by an invite link. */
export const MAY_JOIN = !site || isOwner || !!site.invited;
/** The island of the friend whose invite link opened this page (0: none). */
export const FROM = +(new URLSearchParams(location.search).get('from') ?? 0) || 0;
/** ?pick=grid shows the old number buttons for choosing an island (to compare with choosing on the map). */
export const PICK = new URLSearchParams(location.search).get('pick') === 'grid' ? 'grid' : 'map';

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
/** This tab holds my island and may change it (see lease.js). */
export const canWrite = () => S.role === 'live';

export const S = {
  // saved islands
  role: 'new',                   // this tab and my island: 'new' (not seen yet) | 'settle' (taking over) | 'live' (mine to play) | 'idle' (another tab plays)
  docs: new Map(),               // uid → { slot, at, plots, half, wallet, land, rev }
  owners: new Map(),             // slot → uid (first to take it)
  myDoc: null, mySlot: 0,
  dirty: false,                  // myDoc changed since the last save
  names: {}, boardName: BOARD === 'main' ? '첫 섬마을' : '',
  world: makeIsles(new Set(), new Map()),
  ground: null,                  // the islands drawn once, under everything
  // the camera
  zoom: 1, scrolled: false,
  // what the player is doing
  current: null,                 // what the panel shows: { kind: 'info' | 'build', key }
  size: 'S', hover: null, buildMode: false,
  card: null,                    // the guest's request picked for the next building: { need } (need null: anything I like)
  spot: null,                    // where the next building goes while the bar is open: { x, z, door }
  building: null,                // the building Claude is writing now: { x, z, size, stage }
  moving: null,                  // the building being moved: { key, size }
  watching: null,                // the shop whose inside is open
  zoomShop: null, camBefore: null,   // the roof lifting off an opened shop; the camera to go back to
  joinShown: false, guided: false, guideAt: null,   // the screen point the guide asks to press (guide.js)
  inviteGuide: false,   // 끼룩이 pointing at a free island next door, once the island has grown (guide.js)
 
  // the map as last drawn
  drawn: [], lastTops: {}, landAnim: null, unmet: [],
  // boats and the festival
  callReady: 0, fest: null, nextFest: performance.now() / 1000 + FEST.first,
};
S.ground = drawIsles(S.world, pr);
