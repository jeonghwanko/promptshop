# Roadmap: from shops to any building

Goal: one line of text becomes most kinds of real-world buildings (a street stall, a hanok tea house, a 20-floor hotel, a train station), recognisable at a glance outside and believable inside. After that, buildings stand together in one shared town.

The plan follows the research in [RESEARCH.md](RESEARCH.md). Three rules come from it:

1. **The model gives meaning; the engine gives geometry.** The model chooses a type, a style, masses, a room program and relations ("against the back wall", "next to the counter"). Solvers turn these into positions. The model never writes raw coordinates for furniture.
2. **Templates first, overrides second.** Every building type has a template with default masses, facade, roof, hero prop, sign icon, room program and furniture. The model picks a type and changes only what the description needs.
3. **Vary what people see.** Variety is measured in the cues people notice: silhouette, roof, colour, hero prop and frontage. Random numbers do not count.

## Stage 1: more kinds of buildings (now)

### 1.1 Spec v2: a hierarchy streamed as lines

Each line has an `id` and names its parent, so the build can stream and a broken line can be repaired alone.

```
building  type, style, scale (S/M/L/XL), name, palette
mass      id, shape (box/tower/wing/podium/setback/annex/canopy/drum/spire), size, levels, min_level, roof{shape, material, pitch, orientation, overhang, eave}, wall material
facade    mass id, floor height, bay rhythm (punched/bands/grid/curtain), ground floor (shopfront/arcade/portico/canopy/garage/dock/porch/marquee/gate), balconies, sign
prop      relation to a mass and a facade ("front, bay 2", "roof, corner")
floor     range of levels (for example 2-19), kind (lobby/typical/special), zones with area weights and adjacency
fixture   zone id, kind, relation (against wall / near X / facing X / in a row / centred)
```

Vocabulary from OpenStreetMap and the type research:
- **14 roof shapes**: flat, gabled, hipped, half-hipped, hipped-and-gabled, skillion, saltbox, gambrel, mansard, pyramidal, sawtooth, dome, onion, cone. Butterfly, round and crosspitched come later.
- **12 wall materials** and **10 roof materials**.
- **12 masses** and **12 ground-floor fronts**.
- **24 interior zones**, each with 3 to 5 signature fixtures.

Done when: the spec, its validator and the step reader are written, the current examples are converted, and every current example still renders.

### 1.2 Type catalogue

A data file with about 50 types in 12 families. Each type has scale, floor range, default masses, facade, roof, hero prop, sign icon, room program and fixture set. 10 style presets change materials, roof and ornament without changing the type.

Korean types come early because they are the first audience: hanok, small mixed-use building (상가주택), apartment block, pojangmacha, PC bang, convenience store.

Done when: a gallery page renders every type in its default style, and every family can be told apart at town zoom.

### 1.3 Exterior kit

- All 14 roof shapes, with orientation and eave curve.
- Facades built by split rules: floors and bays repeat, and the ground floor is overridden.
- Masses combine. Corner and junction pieces are chosen automatically from neighbours, the Townscaper approach.
- One hero prop per family: giant cup, cross sign, clock, spire, chimney, scoreboard and others.
- A sign shown as an icon plus a short name. Pixel Korean text is not readable at this size, so the name is drawn as a label outside the picture.
- Tall buildings get their real floor count. Typical floors are repeated modules, so 20 floors cost no more to generate than 3.

Done when: in a blind test, people name the family of 24 generated buildings (2 per family) with at least 80% accuracy.

### 1.4 Interiors: the stacked cross-section

- The town view shows the exterior only. Tapping a building opens the building view.
- The building view is a stacked cross-section, Tiny Tower style, in our isometric frame. The floor in focus is drawn with low cut-away walls, and the floors above it are hidden. A visible stair and elevator core joins the floors.
- Floors are written once per kind, for example "2-19: typical guest floor". Repeated floors merge into one strip with a "×18" badge, so 100 floors stay readable.
- Per floor, zones are laid out by a squarified treemap around the fixed core. Fixtures are placed by a small grid solver from relations, with free space kept in front of counters and doors.

Done when: a 20-floor hotel, a 3-floor school and a 1-floor café each show believable floors. No fixtures overlap, and every zone can be reached.

### 1.5 Generation quality

- The prompt is typology-first: pick a type and style, then override.
- The validator repairs cheaply: unknown type → nearest type, overlap → move or drop, out of range → clamp.
- Remaining violations go back to the model as short messages for one revision pass. A pass costs about 30% more.
- An evaluation set of 60 one-liners across all families. Automatic checks cover schema, overlaps and reachability. A taste review sheet and a diversity check cover cue variety across runs of the same line and across lines of the same family.

Done when: at least 95% of evaluation lines build without errors, and the reviewer marks at least 80% as "this is what I asked for".

## Stage 2: one town

- Lots by scale: S 1×1, M 2×2, L 3×3, XL 4×4. Bigger lots cost more, which is the first link to the economy.
- A shared town page: everyone's buildings stand on one map, and you can open anyone's building.
- Ambient life: customers at the door, queues, night lights, smoke.
- Moderation before anything is shared: check the prompt and the sign text, and keep a report button.
- Later: building next to a friend (the "build next door" idea), visits and reactions.

## Costs

The building spec is short text. With a Haiku-class model one building costs about $0.001 (about 1.5 KRW). A revision pass adds about 30%. A typical floor is written once, so floor count does not raise the cost.

## Open decisions

1. **Tall buildings in the town view.** Option A: true height. Option B: compress above about 8 floors with a band that shows the real count. B is recommended, so a skyline does not hide the town.
2. **Building view layout.** The stacked cross-section is recommended. The alternative is floor buttons, like an elevator.
3. **Style presets that come first.** Recommended: hanok, modern glass, brick, Mediterranean, Nordic wood.
