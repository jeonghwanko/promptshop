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
| Saving | `src/game/persist.js` | Saving my doc (numbered by `rev`), loading the board, the board summary | DOM |
| Running | `src/game/economy.js` | Payments from the walkers' events, boats, the festival, VIP guests, restocking, furniture coming in by itself | DOM other than through the HUD |
| Screens | `src/game/camera.js`, `mapview.js`, `hud.js`, `guide.js`, `panel.js`, `shop.js`, `build.js`, `move.js`, `input.js`, `world.js`, `ui.js` | The camera and zoom; drawing the map each frame; the HUD and messages; the guide; the side panel; the open shop and its buttons; build mode, Claude building, extending; moving a building; pointer and keys; the world map; DOM helpers | — |
| Start | `src/game/main.js` | Puts the pieces together: calls each `init…()`, sets the model's hooks, runs the frame loop, the debug hook | — |

## Rules of thumb

- A number that changes how the game plays goes in `rules.js`.
- A function that draws gets the canvas and what to draw as arguments; it does not read the game state.
- State that changes lives on `S` in `state.js`, never in a module's own `let`. A module may keep its own private bookkeeping (a timer, a cache, an effect's particles) when other modules reach it only through its functions (for example `stakeSite` and `dustSite` in `mapfx.js`).
- Screen modules import each other's functions directly. They do nothing when they load: listeners and timers start in their `init…()`, which only `main.js` calls. So the order in which the modules load does not matter.
- `model.js`, `persist.js`, `economy.js` and the layers under them never import a screen other than the HUD. When they need one (a celebration, the first view after loading, the guide, a panel to refresh), they call `hooks` in `model.js`, which `main.js` fills.
- A function that runs after an `await` reads `S` again and checks again what it checked before (a permit, the plot limit, that the building is still there): a newer copy can arrive from another tab, and the player can do other things while Claude writes.
- Each save carries `rev` (one more each time) and `by` (the tab that saved). A page takes the stored copy when its `rev` is higher, or equal but saved by another tab, so two tabs on one island end up with the same copy. Edits made in both tabs within the same few seconds are not merged: the last save wins.
- Saved data never changes shape silently: a change of meaning gets a version on the plot (`lay`) and a step in `migrate.js`.

## Checks

- `node scripts/check-isles.mjs` (with `node scripts/dev.mjs 5300` running): copies the dev island to a throwaway board and drives the main paths in headless Chrome: guide, shop, buying, floors, zoom, long press, moving a building, festival, panel, cards, world map, a refused board name, widening land, furniture coming in by itself. Every line must say PASS.
- `tests/render-hash.html`: a hash of every building, cut-away and voxel button. Use it before and after a change to the renderer that should change no pixel.
