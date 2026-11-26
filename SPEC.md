# Shop spec

A shop is `{ "line": string, "ext": Exterior, "int": Interior }`. `line` is the one-line description the spec came from. It is not rendered.

Units are tiles. One tile is 40 px wide on screen. Colors are `#rrggbb`.

## Exterior

The exterior is centered on the origin. The front (`+z`) faces the screen's lower-left. The side (`+x`) faces the lower-right.

| Field | Type | Notes |
| --- | --- | --- |
| `size` | `[w, d]` | Footprint in tiles, for example `[2.4, 1.8]` |
| `floors` | `1` or `2` | One floor is about 1.55 tiles high |
| `wall` | `{ mat, color }` | `mat`: `plank`, `plaster`, `brick` |
| `trim` | color | Frames, beams and sign edges |
| `roof` | `{ type, color, curl? }` | `type`: `gable`, `hip`, `flat`, `shed`. `curl: true` turns up the eaves of a gable roof |
| `front` | `{ type, door? }` | `type`: `counter` (open stall front), `glass` (display window and door), `door`. `door`: color |
| `awning` | `{ a, b }` | Two stripe colors, over the display window |
| `noren` | `{ color, text }` | Cloth curtain over a `counter` front |
| `sign` | `{ text, place, bg, fg, glow? }` | `place`: `front` (above the entrance), `roof` (standing on the roof), `blade` (vertical, on the side corner). `glow` makes it unlit, so it reads as lit up |
| `neon` | color | Neon strip along the top of the front and side walls |
| `chimney` | boolean | |
| `night` | boolean | Side windows glow warm |
| `props` | `Prop[]` | Placed in front of the shop unless noted |

### Exterior props

`x` is the offset along the front, from `-w/2` to `w/2`.

| `type` | Fields |
| --- | --- |
| `lantern` | `x`, `color`. Hangs under the eaves |
| `stool`, `plant`, `bench`, `crate`, `bookstand`, `standee` | `x` |
| `menuboard` | `x`, `text` |
| `flag` | `x`, `color` |
| `barrel` | `z`. Stands beside the side wall |
| `cat` | `on`: `roof` or `sill` |
| `glove` | `on`: `roof`, `color`. A giant boxing glove on the roof |

## Interior

The room spans `x` from 0 to `w` and `z` from 0 to `d`. The back walls stand at `z = 0` (upper-right on screen) and `x = 0` (upper-left). The two front walls are cut away.

| Field | Type | Notes |
| --- | --- | --- |
| `size` | `[w, d]` | For example `[4, 3]` |
| `floor` | `{ type, a, b? }` | `type`: `wood` (uses `a`), `checker` (uses `a` and `b`) |
| `wall` | `{ mat, color }` | Same as the exterior wall |
| `items` | `Item[]` | |

### Interior items

Floor items take `at: [x, z]`. Wall items take `wall: "x" | "z"` and `at`, the distance along that wall.

| `type` | Placement | Fields |
| --- | --- | --- |
| `counter` | floor | `len`, `color`, `on`: `bowls`, `coffee`, `register`. `rot: 90` turns it |
| `stove`, `stool`, `plant`, `bag` (hanging sandbag), `case` (glass display), `catbed`, `cat` | floor | |
| `chair` | floor | `color` |
| `table`, `sofa` | floor | `color` |
| `rug` | floor | `size: [w, d]`, `color` |
| `pendant` | floor position, hangs from the ceiling | `color` (the light) |
| `shelf` | against the `z` wall at `at: [x, z]`, or against the `x` wall with `wall: "x"` | `len`, `goods`: `bowls`, `figures`, `gloves` |
| `bookshelf` | wall | `len` |
| `window`, `poster` (`text`, `color`), `lantern` (`color`), `neon` (`color`) | wall | |

## Asking an LLM for a spec

A prompt that works:

> Design a small shop for an isometric pixel-art town from this line: "&lt;description&gt;". Reply with only JSON in the shop spec format below. Keep the interior's colors and materials consistent with the exterior. Use 3 to 8 props outside and 6 to 12 items inside.
>
> &lt;paste this file&gt;
