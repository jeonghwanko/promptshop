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
| Screens | `src/game/world.js`, `src/game/ui.js` | The world map; small DOM helpers | — |
| Controller | `src/game/main.js` | The game's state (my island, the open shop, the festival, the guide), the frame loop, saving, and the screens not yet split out | — |

## Rules of thumb

- A number that changes how the game plays goes in `rules.js`.
- A function that draws gets the canvas and what to draw as arguments; it does not read the game state.
- A screen module gets what it needs once, through an `init…(ctx)` call (see `initWorld`).
- Saved data never changes shape silently: a change of meaning gets a version on the plot (`lay`) and a step in `migrate.js`.

## Checks

- `node scripts/check-isles.mjs` (with `node scripts/dev.mjs 5300` running): copies the dev island to a throwaway board and drives the main paths in headless Chrome: guide, shop, buying, floors, zoom, long press, festival, panel, cards, world map. Every line must say PASS.
- `tests/render-hash.html`: a hash of every building, cut-away and voxel button. Use it before and after a change to the renderer that should change no pixel.

## Not yet split

`main.js` (about 1,000 lines) still holds several screens: the HUD, the panel and request cards, the guide, the in-place shop and its buttons, building and extending. They share the controller's state directly. The next step is one state object passed to per-screen modules, the way `world.js` already works.
