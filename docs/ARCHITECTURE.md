# Architecture

The game page is `isles.html`. It holds markup only; its style is `src/game/isles.css` and its code starts at `src/game/main.js`.

## Layers

Each layer may use the layers below it, never the ones above.

| Layer | Files | What it owns | May not touch |
| --- | --- | --- | --- |
| Rules | `src/game/rules.js` | Prices, land, permits, island levels, boats, festival sizes and stars. Numbers and pure functions. | DOM, saved state, clock |
| Model | `src/v2/spec.js`, `steps.js`, `check.js`, `catalog.js` | A building as data: the steps Claude writes, the checks, normalising | DOM, three.js |
| Simulation | `src/v2/townsim.js` (map walkers), `src/v2/inside.js` (inside a shop) | Who walks where, queues, seats, payments. Fixture costs, levels, shop rates. | DOM, canvas |
| Geometry | `src/v2/isles.js`, `src/v2/interior.js`, `src/v2/exterior.js` | Island shapes and plots; a building's rooms, fixtures and walls as three.js groups | DOM |
| Render | `src/v2/render.js` | One isometric camera and outline pipeline for buildings, cut-aways and voxel buttons | Game state |
| Views | `src/v2/insideview.js`, `src/v2/townview.js`, `src/game/mapfx.js`, `src/ui/voxelui.js`, `src/ui/icons.js` | Drawing what they are given: a shop's cut-away, walkers, the building site, boats, buttons, pixel icons | Saving, rules |
| Saved data | `src/game/migrate.js` | Bringing islands saved under older rules up to date (pure: a doc in, a doc out) | DOM |
| Game state | `src/game/state.js` | The runtime handles (db, user, Claude), the map canvas, the walkers, and `S`: everything about this page that changes | DOM other than the map canvas |
| Game model | `src/game/model.js` | What the saved islands mean now: plots, fixtures, rates, the wallet's permits and level; `rebuild()` turns the docs into the map and the walkers' buildings. It tells the screens through `hooks` | DOM |
| Saving | `src/game/persist.js`, `src/game/lease.js` | Saving my doc, loading the board, the board summary; which tab may write my island | DOM |
| Running | `src/game/economy.js` | Payments from the walkers' events, boats, the festival, VIP guests, restocking, furniture coming in by itself | DOM other than through the HUD |
| Screens | `src/game/camera.js`, `mapview.js`, `hud.js`, `guide.js`, `panel.js`, `invite.js`, `shop.js`, `build.js`, `move.js`, `input.js`, `world.js`, `ui.js` | The camera and zoom; drawing the map each frame; the HUD and messages; the guide (choosing an island, the first loop, the invite); the side panel; the invite link and card; the open shop and its buttons; build mode, Claude building, extending; moving a building; pointer and keys; the world map; DOM helpers | — |
| Start | `src/game/main.js` | Puts the pieces together: calls each `init…()`, sets the model's hooks, runs the frame loop, the debug hook | — |

## Rules of thumb

- A number that changes how the game plays goes in `rules.js`.
- A function that draws gets the canvas and what to draw as arguments; it does not read the game state.
- State that changes lives on `S` in `state.js`, never in a module's own `let`. A module may keep its own private bookkeeping (a timer, a cache, an effect's particles) when other modules reach it only through its functions (for example `stakeSite` and `dustSite` in `mapfx.js`).
- Screen modules import each other's functions directly. They do nothing when they load: listeners and timers start in their `init…()`, which only `main.js` calls. So the order in which the modules load does not matter.
- `model.js`, `persist.js`, `economy.js` and the layers under them never import a screen other than the HUD. When they need one (a celebration, the first view after loading, the guide, a panel to refresh), they call `hooks` in `model.js`, which `main.js` fills.
- A function that runs after an `await` reads `S` again and checks again what it checked before (a permit, the plot limit, that the building is still there): a newer copy can arrive from another tab, and the player can do other things while Claude writes.
- One tab writes an island at a time (`src/game/lease.js`, a pure `step()`; `src/game/persist.js` acts on it).
  - A new tab claims the island by writing `term` (one more) and `by` (its mark). If the holder let go (it writes `by: null` as its page closes) or has not saved for 15 s (`hb`), the new tab plays at once. Otherwise it waits up to 5 s for the holder's answer.
  - The holder closes what it had open, then answers with `ack` and its whole island, and only watches. One button takes the island back by reloading.
  - Two tabs that claim the same term: the lower mark keeps it, and both work that out alike.
  - The tab that plays never takes the stored copy of its own island. If another tab's save shows up in the store (`wb`, a tab that woke up and saved before it saw the claim), the player saves its own copy again.
  - Saves write only the island fields with `update` (plus `wb` and `hb`); claims write only `term` and `by`. The holder saves at least every 8 s.
- Only the playing tab changes my island: check `canWrite()` before spending or earning.
- A board owner removes someone else's building by a mark in the board's `_mod` doc, keyed by the building's `b.at` (it stays when the building moves); the owner's own playing tab removes it and saves. Marks are not pruned yet. Writing someone else's doc directly would be undone by their next save.
- Saved data never changes shape silently: a change of meaning gets a version on the plot (`lay`) and a step in `migrate.js`.

## Checks

- `node scripts/check-isles.mjs` (with `node scripts/dev.mjs 5300` running): copies the dev island to a throwaway board and drives the main paths in headless Chrome: guide, shop, buying, floors, zoom, long press, moving a building, festival, panel, cards, world map, a refused board name, widening land, furniture coming in by itself. Every line must say PASS.
- `node scripts/check-tabs.mjs`: several tabs on one island — a stale holder, the answer and handing over unsaved changes, the watcher writing nothing, an old copy written over, a closed tab, a shop opened while waiting, two tabs at once, a removal that sticks.
- `node scripts/check-lease.mjs`: the one-writer rule as a table and same-term races, without a browser.
- `node scripts/check-invite.mjs [shots dir]`: the first session with a friend — choosing an island on the map, the invite step and link, the friend landing next to the inviter, the free half bridge, the inviter seeing them arrive, the funnel log.
- `node scripts/funnel.mjs [db.json] [board]`: the first-session funnel from the logs `track()` writes (`log/<board>~<user>`).
- `tests/render-hash.html`: a hash of every building, cut-away and voxel button. Use it before and after a change to the renderer that should change no pixel.

## The first session

- A page without an island shows no list: the guide points at an island on the map (next to the inviter with `?from=`, else one with three neighbours) and the island's card has one button, "이 섬에 살기". `?pick=grid` brings back the number buttons, to compare.
- The guide's last step points at an empty island next door; its card holds the invite link (`?board=<id>&from=<my island>`), shared with the phone's share sheet or copied.
- A friend who moves in next to the inviter gets their first half bridge to the inviter free (`wallet.freeHalf`). The inviter sees the island rise and a mark on 내 섬; nothing pops up.
- `track(event)` logs the steps for the funnel: arrive, pick, tut (each guide step), invite_open, invite_copy, friend_joined, bridge_half.
