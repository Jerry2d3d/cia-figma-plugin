# Where we are — 2026-09-26

A pick-up-from-cold note. Read this, then `ROADMAP.md` in this repo, then
`K:\repo\figma-import-export\ROADMAP.md`.

## THE BLOCKING TEST PASSED (2026-09-25)

Jerry ran the first real-Figma run. **No errors.** Both halves work inside
Figma for the first time:

- **Tokens:** `boilerplate.variables.json` → "Collection boilerplate: 128
  created, 0 updated, 1 mode(s) added." Figma's Variables panel shows the
  collection with Light and Dark columns: colors as swatches, `r-sm/md/lg`
  and `duration-*` as numbers, `font-*` as strings. No gaps.
- **Components:** Button built as a **12-variant component set**, with
  **235 bindings** against `boilerplate` and **247** against
  `boilerplate-dark`. Variant properties show up in Figma's own UI as
  `variant` and `size` dropdowns on the instance.
- **Auto-layout resolves from the bound variables:** the `size=large`
  variant hugs at 89 × 41, which is text width plus `space-lg` (24) each
  side and `space-sm` (12) top and bottom. Padding, gap, radius and fills
  are all live Variable bindings, not baked numbers.
- **Gaps came back exactly as predicted**, no surprises: 9 against
  `boilerplate` (the 5 known causes, reported per style block) and 7
  against `boilerplate-dark` (no `space-2xs` gaps there, because the
  single-mode export has that token). 18 skipped items, which is precisely
  the count the v1 scope predicts.

**Conclusion: Phases 1 and 2 are proven in real Figma.** Everything
reported was a known upstream gap, not a plugin fault.

**One visual item still to confirm:** a screenshot of
`variant=secondary, size=large` shows a near-white button with blue text.
The code binds its fill and stroke to `action-secondary-default` (#dc2626
red in Light) and its text to `text-inverse` (white), verified by a
one-off run of the real builder against the real spec. Either the
screenshot is too small to read or Figma disagrees with the code. Ask
Jerry to select that variant and read the **Fill** row in the right
sidebar: it should name `action-secondary-default`. Resolve before
scaling to other components.

## Built since the test passed (2026-09-26, committed)

The test unblocked real work. All of it is unit-tested; none of it has been
re-run inside Figma yet.

**Builder coverage widened after surveying all 35 real specs.** Button was
the only component the v1 resolver fully understood. Now also handled:
- `background` as well as `background-color` (cia emits both; the old code
  silently skipped the first, which would have left Badge and Avatar unfilled).
- `brand(x)` as a colour, resolving to the `brand-x` variable.
- `font-size(x)` and `font-weight(x)` as independent bindings, rather than
  only the combined `font()`.
- `font()`'s first argument read as a **cia type preset**, not a weight key.
  `$_font-types` is copied from css-is-awesome, so `font(reg, ...)` correctly
  looks up `font-weight-normal` and `medium-it` yields Figma's "Medium
  Italic". Before this it looked up a nonexistent `font-weight-reg`.
- `padding: a b` arriving as two same-property calls, collapsed per CSS
  shorthand rules.
- `line-height()`, `z()`, `animate()`, `shadow()` reported as skipped with
  reasons instead of "unsupported".
- `type(preset)` reported as a **gap**: it is a Sass preset with no token to
  bind, and guessing its expansion is exactly what the contract forbids.

**Figma component properties.** Every component now exposes its text prop as a
TEXT property and its boolean props as BOOLEAN properties, so a PM sets them
on an instance and the screen read-back can report them. Button gets
`label: TEXT` and `disabled: BOOLEAN`. Booleans carry intent only for now;
that limitation is reported in the skipped list rather than left implicit.

**The Prompt component is built** (`src/plugin/buildPrompt.ts`), matching the
decided shape: 8 variants over `scope` (app/page/section/component) and
`kind` (page/tooling), plus `rule` and `target` as TEXT properties. It uses
flat colours, never Variables, so it looks the same in every theme and is
never mistaken for a design element. A new Prompt panel in the plugin UI adds
it with one click.

33 tests pass, lint and build clean.

## The one thing blocking every component except Button

Surveying all the real specs showed the same structural problem everywhere:
**figma-import-export classifies their variant blocks as `part`, not
`variant`**, so they build flat with no variants at all.

Button works only because its SCSS class names happen to equal its prop enum
values (`.primary`, `.small`). Everywhere else the selector is prefixed and
camelCased, and the classifier gives up:

| Component | Prop and value | Selector in the spec |
|---|---|---|
| Badge | `variant=primary` | `.badgePrimary` |
| Badge | `size=sm` | `.badgeSm` |
| Text | `weight=medium` | `.textWeightMedium` |
| Text | `size=sm` | `.textSm` |
| Avatar | `size=lg` | `.avatarLg` |
| Heading | `level=1` | `.heading1` |
| Card, Container, Spinner | same pattern | same pattern |

The plugin reports this as a named contract gap and refuses to invent a
selector naming convention, because a wrong mapping would silently produce
wrong components. **The fix belongs upstream**, in the spec producer, which
already knows both the prop enums and the selectors.

Two smaller upstream items found in the same survey: `Heading` and
`Container` have **no base style block at all** (every block is a part), and
`Card` uses `shadow(sm)`, which has no Figma Variable type.

---

# Earlier snapshot — 2026-09-23

A pick-up-from-cold note. If a session is lost, read this, then
`ROADMAP.md` in this repo, then `K:\repo\figma-import-export\ROADMAP.md`.

## The one-line answer

Phases 0, 1 and 2 of this plugin are written, tested and committed.
**Nothing has ever run inside real Figma.** That test is the blocker for
everything else and it needs a person at Figma. Both repos are waiting on
it.

## The goal, in Jerry's framing

Two libraries build every app: **css-is-awesome** (tokens, themes, layout
mixins) and **BoilerPlate v2** (`boiler-project-ai`'s 35 React components,
styled with those tokens). A PM designs a new app, or a new page for an
existing app, in Figma using a faithful copy of both. Then an AI reads the
screen back and builds the app: page layout from css-is-awesome, components
from BoilerPlate, matching each instance's variant props and on/off flags.
A `Prompt` component carries PMO rules ("this login is Google") next to the
part of the design they apply to.

For that, Figma must be a design surface whose output is **structured
facts, not a picture**. One direction of truth per thing:
tokens and components flow code → Figma; screens flow Figma → code; a
designer restyling a component in Figma is drift to flag, never an import.

## Done and committed (this repo, branch `main`)

| Commit | What |
|---|---|
| `594e2502` | Phases 0-1: from-scratch `packages/cia-plugin/` + token sync |
| `8b945a9e` | Phase 2: build components from specVersion 2 specs |
| `c8f5f20c` | ROADMAP.md moved into this repo |
| `56ec0720`, `27089487` | Prompt component decision, Starter-plan note |

24 unit tests pass, lint clean, production build clean. Run them with the
vendored yarn (`yarn` is not on PATH):
`node ..\..\.yarn\releases\yarn-1.18.0.cjs test` from `packages/cia-plugin/`.

Sibling repo `figma-import-export` is committed through `93eea50`, which
includes its Phase 3 (the token contract this plugin consumes) and all of
our shared decisions.

## The blocking test (Jerry's hands, not startable by Claude)

1. New Figma file (Starter plan = library, Prompts and screens all in one file).
2. Plugins → Development → Import plugin from manifest →
   `K:\repo\cia-figma-plugin\packages\cia-plugin\manifest.json`. `dist/` is
   current. If Figma rejects the placeholder `id`, delete the `id` line and
   re-import.
3. Run "cia (dev)". Tokens panel → load
   `K:\repo\figma-import-export\output\boilerplate.variables.json`
   (or `sketchbook.variables.json` — same variable names; the sibling's
   notes say sketchbook, Jerry said boilerplate, **either is fine, just say
   which**). Expect: collection `boilerplate`, 1 mode added, no gaps.
4. Figma's Variables panel shows that collection with Light and Dark columns.
5. Components panel → the dropdown now lists the collection → load
   `packages\cia-plugin\src\__fixtures__\Button.component-spec.json` → Build.
6. Expect a 12-variant Button component set, selected, and **5 gaps**:
   border width, `space-2xs`, `font-weight-semibold`, `font-size-sm`,
   `font-size-lg`. These are known and correct, not plugin bugs.
7. Select `variant=primary, size=medium`: fill and stroke should read
   `action-primary-default`, radius `radius-lg`, padding `space-xs` /
   `space-md`.
8. Send back: screenshots of the plugin result panel, the Variables panel,
   and the selected variant's design panel; any error text verbatim.

## Known open items

- **Bug to relay to the figma-import-export session (still open, confirmed
  in Figma 2026-09-25):** the combined two-mode exports
  (`boilerplate.variables.json`, `sketchbook.variables.json`) are missing
  `space-2xs`, while the single-mode `-light` / `-dark` files each have it.
  The Light+Dark merge drops it. Proven by the real run: building against
  `boilerplate` produced two `space-2xs` gaps, building against
  `boilerplate-dark` produced none. Regenerating the exports on 2026-09-24
  did not fix it.
- **Contract gaps** the builder reports on every Button build, all real,
  all upstream: spec has `border-color` but no width (SCSS says 2px,
  defaults to 1px); `font-weight-semibold`, `font-size-sm`, `font-size-lg`
  have no cia token at all; line height deliberately unbound (cia's token
  is a unitless 1.5, Figma binds px).
- **Uncommitted here:** `packages/tokens-studio-for-figma/manifest.json`
  has a leftover name change to "cia Tokens (dev)". Left alone on purpose;
  that package is read-only until removal.

## Next steps, in order (revised 2026-09-26)

1. **Jerry, in Figma:** rebuild from the current `dist/`, then (a) check the
   Fill row on `variant=secondary, size=large`, (b) click **Add Prompt
   component** in the new Prompt panel and confirm the 8 variants and the
   `rule`/`target` fields, (c) rebuild Button and confirm the new `label`
   and `disabled` properties appear on an instance.
2. **Jerry, relay:** paste the message below into the figma-import-export
   session. The variant-classification fix there unblocks every component
   except Button.
3. **figma-import-export session:** the variant classification fix, then
   per-instance detail from `figma_map_screen` (component name, variant
   props, flags, text overrides, enclosing frame), then `Prompt` reading,
   then layout read-back reporting token *names* not pixels.
4. **Claude, once specs carry real variants:** re-run the builder across
   all 35 components and fix whatever that surfaces.
5. **Both sessions together:** specVersion 3 with child structure, for the
   components a single frame + label cannot express (DataTable, Modal,
   DashboardNav, MultiStepForm, Card).
6. **Later:** Phase 3 read-back here, drift diff there.

## Message to paste into the figma-import-export session

```
THE BIG ONE: your spec classifier marks variant blocks as "part" for every
component except Button, so the plugin builds them flat with no variants.
Button only works because its SCSS class names happen to equal its prop enum
values (.primary, .small). Everywhere else the selector is the component name
plus the value, camelCased, and the classifier gives up:

  Badge   variant=primary -> .badgePrimary      size=sm -> .badgeSm
  Text    weight=medium   -> .textWeightMedium  size=sm -> .textSm
  Avatar  size=lg         -> .avatarLg
  Heading level=1         -> .heading1
  Card, Container, Spinner: same pattern

You already have both halves (the prop enums from the TSX, the selectors from
the SCSS), so please match them there and emit kind:"variant" with prop/value.
The plugin deliberately will not invent this naming convention, because a
wrong mapping produces silently wrong components.

Also found while surveying all 35 specs:
- Heading and Container have NO base style block at all; every block is a
  part, so they build unstyled.
- Card uses shadow(sm), which has no Figma Variable type. The plugin skips it
  with a reason, matching how your token export reports shadows as gaps.
- border-width is still missing from the spec (Button's SCSS says 2px).

The first real-Figma run happened on 2026-09-25 and it worked. Three things:

1. UNBLOCKED: a real 12-variant Button component set now exists in a Figma
   file, built by the plugin, with variant/size exposed as Figma component
   properties and padding/gap/radius/fills bound to Variables. That is what
   figma_map_screen needs to read. Please start the "Next on this side"
   list in order: per-instance detail (component name, variant props,
   flags, text overrides, enclosing frame), then Prompt component reading,
   then layout read-back reporting token names rather than pixel values.

2. BUG, confirmed in Figma and still present after the 2026-09-24
   regeneration: output/boilerplate.variables.json and
   output/sketchbook.variables.json are missing space-2xs, while the
   -light and -dark files each have it. The Light+Dark merge drops it.
   Proof: building Button against the boilerplate collection produced two
   space-2xs gaps; building against boilerplate-dark produced none.

3. FYI, the token sync itself was clean: 128 variables created, 1 mode
   added, no gaps, colors and numbers and strings all landed correctly in
   Figma's Variables panel.
```


## Message to paste into the Figma-export session
Built Button (12 variants) with 235 bindings to boilerplate.

9 gap(s) to route upstream:

.button: no variable named "font-weight-semibold" in the collection (needed for font(semibold, base, normal) as font weight)
.small: no variable named "space-2xs" in the collection (needed for pad-asym(2xs, sm) as vertical padding)
.small: no variable named "font-weight-semibold" in the collection (needed for font(semibold, sm, normal) as font weight)
.small: no variable named "font-size-sm" in the collection (needed for font(semibold, sm, normal) as font size)
.small: no variable named "space-2xs" in the collection (needed for space(2xs) as gap)
.medium: no variable named "font-weight-semibold" in the collection (needed for font(semibold, base, normal) as font weight)
.large: no variable named "font-weight-semibold" in the collection (needed for font(semibold, lg, normal) as font weight)
.large: no variable named "font-size-lg" in the collection (needed for font(semibold, lg, normal) as font size)
contract: spec carries border-color but no border width; stroke weight defaulted to 1px
18 thing(s) not built in v1
