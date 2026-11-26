# Research notes

What we learned before planning spec v2: how to let one line of text become most kinds of real-world buildings, outside and inside, including multi-floor buildings. Sources are linked. Items marked *(unverified)* were not opened during research.

## 1. Real-world vocabulary: OpenStreetMap

OpenStreetMap already describes buildings the way our renderer needs, so we adopt its vocabulary instead of inventing one.

- **Building types** ([Key:building](https://wiki.openstreetmap.org/wiki/Key:building)): housing, commercial, religious, civic, farm, sport, storage, technical and landmark groups, about 80 values.
- **Simple 3D Buildings** ([S3DB](https://wiki.openstreetmap.org/wiki/Simple_3D_Buildings)): a footprint plus `building:part` volumes. Each part has `building:levels`, `building:min_level`, `height`, `min_height`, `roof:shape`, `roof:height` or `roof:angle`, `roof:orientation` (along or across), `roof:direction`, `building:material`, `building:colour`, `roof:material`, `roof:colour`.
- **Roof shapes** ([Key:roof:shape](https://wiki.openstreetmap.org/wiki/Key:roof:shape)): flat, gabled, gabled_height_moved, skillion, saltbox, hipped, half-hipped, side_hipped, side_half-hipped, hipped-and-gabled, mansard, gambrel, bellcast_gable, pyramidal, crosspitched, sawtooth, butterfly, cone, dome, onion, round, concave. The wiki discourages `many` and says to split the building into parts instead.
- **Materials**: [building:material](https://wiki.openstreetmap.org/wiki/Key:building:material) and [roof:material](https://wiki.openstreetmap.org/wiki/Key:roof:material).

## 2. Building families and interior programs

A town needs about 50 types in 12 families: food and retail, hospitality, civic, education, health, culture and exhibition, sport and leisure, transport, industry and storage, residential, religious, landmarks.

Each type has a typical scale, a floor range, signature exterior features and an interior program. A program is a list of zones, and each zone has 3 to 5 fixtures that make it recognisable.

| Type | Zones and the fixtures that identify them |
| --- | --- |
| Restaurant | host stand → dining (tables, booths, bar) → pass → kitchen (range, hood, prep island) → WC |
| Café | counter (espresso machine, pastry case, menu board) → seating (small tables, window bar, sofa) |
| Convenience store | aisles (gondola shelves) → fridge wall → checkout (till, hot food case) → stockroom |
| Hotel | lobby (front desk, bell cart, lounge) → elevator core → corridor of rooms (bed, desk, wardrobe) → restaurant, pool |
| Clinic | waiting (rows of chairs) → consulting room (desk, exam couch, sink) → ward (beds, curtains) → nurse station |
| School | lockers → corridor → classroom (desks in rows, board) → gym, canteen, library |
| Museum | foyer (ticket desk) → galleries (plinths, vitrines, wall art, benches) → shop, café |
| Gym | reception (turnstile) → cardio row → free weights (racks, mirrors) → studio → lockers |
| Train station | concourse (departure board, ticket machines, kiosks) → waiting benches → platforms (canopy, tracks) |
| Office | lobby (security desk) → elevator core → open plan (desk clusters) → meeting room, pantry |
| Apartment | lobby (mailboxes) → stair and elevator → unit (living, kitchen, bedroom, bath, balcony) |
| Factory | loading dock → production floor (machines, conveyor, crane) → racks → office, lockers |

References: Neufert, *Architects' Data* (Wiley); [WBDG space types](https://wbdg.org/node/440) *(unverified)*; [Designing Buildings: types of building](https://www.designingbuildings.co.uk/w/Types_of_building). The tables come from standard architectural knowledge. We did not check them page by page against those books.

**Styles** change the look of the same type through a small set of parameters: roof shape, pitch, overhang and eave curve, wall and roof material, window rhythm (punched, bands, grid, curtain), window shape, ornament and palette. Ten families cover most towns: East Asian / hanok, Victorian, Art Deco, Brutalist, modern glass, Mediterranean, Nordic wood, classical civic, industrial loft, timber-framed.

## 3. Procedural modeling

- **Split grammars**, Wonka et al. 2003, "Instant Architecture" ([doi](https://doi.org/10.1145/882262.882324)). A facade is a box that is split into floors and bays by rules ("repeat 3 m"). Windows come from rules, not coordinates.
- **CGA shape**, Müller et al. 2006, the basis of CityEngine ([doi](https://doi.org/10.1145/1141911.1141931)). It uses the hierarchy lot → mass → facade → floor → tile → element. A survey ([arXiv 2504.11734](https://arxiv.org/abs/2504.11734)) notes that LLMs editing predefined CGA templates work better than LLMs generating free geometry.
- **Townscaper / wave function collapse** ([how it works](https://www.gamedeveloper.com/game-platforms/how-townscaper-works-a-story-four-games-in-the-making)). The player states only intent (filled or empty, colour). Corner, roof and stair modules are picked from neighbour states, so the style is always right.
- **BuildingBlock**, SIGGRAPH 2025 ([arXiv 2505.04051](https://arxiv.org/abs/2505.04051)). An LLM writes a two-level JSON of components with style and material. Components are retrieved from a kit by category and size ratio.
- **CityGenAgent**, 2026 ([arXiv 2602.05362](https://arxiv.org/abs/2602.05362)). Block and building "programs" written by the LLM. Format accuracy rises from 70–83% to 98% after fine-tuning.

## 4. Interiors and floor plans

- **Merrell et al. 2010** ([doi](https://doi.org/10.1145/1866158.1866203)). The room program (rooms, sizes, adjacency) is kept separate from the layout solver.
- **Squarified treemaps**, Marson & Musse 2010 ([doi](https://doi.org/10.1155/2010/624817)). The footprint is split by room-area weights in zones, with a corridor pass. It is deterministic, fast and suits boxy footprints.
- **Infinigen Indoors**, CVPR 2024 ([arXiv 2406.11824](https://arxiv.org/abs/2406.11824)). A constraint DSL (relations, free space in front of appliances), solved by annealing.
- **MANSION**, 2026, multi-floor ([arXiv 2603.11554](https://arxiv.org/abs/2603.11554)). Stair and elevator cores are fixed first and cut out of every floor. The LLM gives bubble diagrams, never polygons.

## 5. LLMs writing 3D scenes

- **Holodeck**, CVPR 2024 ([arXiv 2312.09067](https://arxiv.org/abs/2312.09067)). The LLM writes relations ("against wall", "near", "faces"), a solver places the objects, and assets are retrieved.
- **LayoutGPT**, 2023 ([arXiv 2305.15393](https://arxiv.org/abs/2305.15393)). Raw coordinates from the LLM collide and float. This is why later work moved to relations.
- **PSDL**, SIGGRAPH Asia 2025 ([arXiv 2510.16147](https://arxiv.org/abs/2510.16147)), and **SpatialGrammar**, 2026 ([arXiv 2604.27555](https://arxiv.org/abs/2604.27555)). A DSL with a compiler. The compiler's violation messages go back to the LLM for one revision.
- **SceneCraft** ([arXiv 2403.01248](https://arxiv.org/abs/2403.01248)) and **3D-GPT** ([arXiv 2310.12945](https://arxiv.org/abs/2310.12945)). The LLM calls procedural functions, and a vision model critiques the render.

**What keeps output valid in all of these:**
1. The LLM gives meaning and relations; a solver gives geometry.
2. Objects come from a closed library, chosen by retrieval or fallback.
3. Generation is hierarchical.
4. A validator or critic drives a repair loop.

## 6. Games

**Multi-floor interiors**
- **Tiny Tower** ([wiki](https://en.wikipedia.org/wiki/Tiny_Tower)): stacked cross-section strips with one floor template, changed only in theme, so 100+ floors stay readable.
- **SimTower** ([wiki](https://en.wikipedia.org/wiki/SimTower)): visible elevator shafts tie the floors together.
- **Project Highrise** ([store](https://store.steampowered.com/app/423580)): planning every floor by hand became tedious, so repeated floors should be stamped.
- **Fallout Shelter** ([wiki](https://fallout.wiki/wiki/Fallout_Shelter_rooms)): identical neighbours merge into one wider room.
- **The Sims**: shows one floor at a time, with walls up, down or cut away.
- **Theme Hospital / Two Point**: low walls keep interiors visible.
- **Habbo and Stardew Valley**: the interior lives on its own screen.

**Readability at small size**
- **SimCity 2013** ([GDC talk](https://gdcvault.com/play/1017823/Building-SimCity-Art-in-the)): the art serves the simulation.
- **Islanders** ([wiki](https://en.wikipedia.org/wiki/Islanders_(video_game))): a type is read by its silhouette; colour is only decoration.
- **Kenney / Pocket City** ([assets](https://kenney.nl/assets?q=isometric)): one oversized prop per type.
- **Cities: Skylines**: plan a cheap far-view version separately.

**Generated content**
- **Kate Compton's "10,000 bowls of oatmeal"** ([article](https://www.gamedeveloper.com/design/practical-procedural-generation-for-everyone-)): outputs that are mathematically unique still look the same. Vary what people perceive.
- **GDMC** ([arXiv 2108.02955](https://arxiv.org/pdf/2108.02955)): automate checks for broken output, and let humans judge taste.
- **Spore**: player abuse arrived within days, so moderate both the prompt and the result.

**Eight cues that make a building recognisable:** silhouette and massing, roof colour by family, a sign with an icon and a short name, one oversized hero prop, the ground-floor frontage, the category material, ambient life (customers, smoke, night lights), and a visible band per floor.
