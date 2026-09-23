# Where we are — 2026-09-23

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

- **Bug to relay to the figma-import-export session (still open 2026-09-23):**
  the combined two-mode exports (`boilerplate.variables.json`,
  `sketchbook.variables.json`) are missing `space-2xs`, while the
  single-mode `-light` / `-dark` files each have it. The Light+Dark merge
  drops it. Button's `small` size needs it.
- **Contract gaps** the builder reports on every Button build, all real,
  all upstream: spec has `border-color` but no width (SCSS says 2px,
  defaults to 1px); `font-weight-semibold`, `font-size-sm`, `font-size-lg`
  have no cia token at all; line height deliberately unbound (cia's token
  is a unitless 1.5, Figma binds px).
- **Uncommitted here:** `packages/tokens-studio-for-figma/manifest.json`
  has a leftover name change to "cia Tokens (dev)". Left alone on purpose;
  that package is read-only until removal.

## Next steps, in order

1. **Jerry:** run the blocking test above. Everything else waits on it.
2. **Claude, no dependency on the test:** build the `Prompt` component
   (shape in `ROADMAP.md`), hand-defined, unit-tested like Button. Jerry
   was asked whether to start this before the test results and had not
   answered when he stepped away.
3. **Claude, after the test:** fix whatever real Figma disagrees with, then
   scale the builder to the simple components (Badge, Link, Text, Heading,
   Avatar, Spinner, Tooltip fit the frame + label model as-is), then turn
   `disabled` / `icon` into Figma boolean properties.
4. **figma-import-export session, after the test:** per-instance detail
   from `figma_map_screen` (component name, variant props, flags, text
   overrides, enclosing frame), then `Prompt` reading, then layout
   read-back reporting token *names* not pixels.
5. **Both sessions together:** specVersion 3 with child structure, for the
   components a single frame + label cannot express (DataTable, Modal,
   DashboardNav, MultiStepForm, Card).
6. **Later:** Phase 3 read-back here, drift diff there.

## Message to paste into the figma-import-export session

```
Three things from the cia-figma-plugin side:
1. Bug: output/boilerplate.variables.json and output/sketchbook.variables.json
   are missing space-2xs, while the -light and -dark files each have it.
   The Light+Dark merge drops it. Button's small size needs it for padding.
2. Status: cia-figma-plugin Phases 0-2 are committed (594e2502, 8b945a9e)
   and its roadmap now lives in its own repo. The first real-Figma run is
   still pending on Jerry.
3. After that run, start the "Next on this side" list in order:
   per-instance detail from figma_map_screen, then Prompt component
   reading, then layout read-back with token names.
```
