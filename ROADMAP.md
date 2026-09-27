# Roadmap — cia-figma-plugin

This is the Figma-side half of a two-repo system. The other half is
`figma-import-export` (a Node.js MCP server), whose `ROADMAP.md` holds the
joint plan, the reasoning for the split, and the contract rules. Read that
first. This file tracks only what this plugin does, what it has done, and
what it needs from the other side.

## The picture this serves

Two libraries build every app: **css-is-awesome** (tokens, themes, layout
mixins) and **BoilerPlate v2** (`boiler-project-ai`'s React components,
styled with those tokens). A person designs a new app, or a new page for an
existing app, in Figma using a faithful copy of both. An AI then reads the
screen back and builds it: page layout from css-is-awesome, components from
BoilerPlate, with each instance's variant props and flags carried across.

For that to work, Figma has to be a design surface whose output is
**structured facts, not a picture**. So:

- Tokens flow code → Figma as Variables (light/dark modes). Never the other way.
- Components flow code → Figma as a component library, bound to those
  Variables. Never the other way. A designer restyling a component in Figma
  is drift to flag, not a change to import.
- Screens flow Figma → code only: which components, which props, what text,
  what layout, using token *names* rather than pixel values.
- Everything that does not resolve cleanly is a named gap, never a guess.

One direction of truth per thing is what keeps two libraries and two plugins
from becoming four sources of truth.

## Contract (what this plugin consumes and produces)

| Payload | Direction | Version | Where validated |
|---|---|---|---|
| Token contract `{ specVersion, collection, modes, variables, gaps }` | figma-import-export → plugin | `1.0.0`, or `1.1.0` when it carries alias values | `src/shared/tokenContract.ts` |
| Component spec `{ specVersion, component, props, styleBlocks, borders, gaps }` | figma-import-export → plugin | `2` | `src/shared/componentSpec.ts` |
| Variable-name map, written into the file as shared plugin data | plugin → figma-import-export | `1.0.0` | `src/plugin/variableMap.ts` |
| Frame type, written onto the frame as shared plugin data | plugin → figma-import-export | `1.0.0` | `src/plugin/frameType.ts` |
| Component spec (read-back of a Figma component) | plugin → figma-import-export | not built (Phase 3) | — |

A payload declares the **minimum version needed to read it**, not the version
that produced it. That makes the version a property of the payload rather than
of either tool, so a reader written before a feature existed refuses a file it
would mis-write instead of guessing at it.

Token names resolve by cia's own convention, so the plugin never needs to
know cia internals: `color(x)` → variable `x`; `space(x)` / `pad-asym(y, x)`
→ `space-x`; `radius(x)` → `radius-x`; `font(w, s)` → `font-weight-w` and
`font-size-s`. FLOAT values are expected in px (the exporter already
converts rem).

## Status

**Phases 0, 1 and 2 are done and proven inside real Figma**, not only against
a fake. Three rounds in a real file, 2026-09-25 to 09-27:

- **Tokens** sync into a Variable collection with all their modes.
- **Components** build as component sets, one per variant combination, with
  fills, strokes, radius, padding, spacing and type bound live to Variables.
  Text props become editable fields and boolean props become flags on every
  instance.
- **A composed screen reads back** as structured facts: per-instance variant
  props, flags and text; per-frame auto-layout **in token names**; and the
  `Prompt` rules a PM left. Six bindings on a real frame resolved to six token
  names with none left over, and both sides read the same document identically.

**The whole library builds.** All 99 component specs, 202 components, 1146
bindings, nothing rejected. The remaining gaps are upstream typography tokens.

**Theming is one library, not one per theme** (2026-09-27). A component binds
to a variable inside a specific collection, so a library built against a
collection named after one theme could never follow another. Figma allows 10
modes per collection, which is exactly five themes with light and dark each, so
the theme is a *mode* and the collection is theme-neutral (`cia`). Switching
theme is selecting a mode on a frame: no rebuild, and two themes can sit side
by side.

**Alias values** are resolved, so a token that follows another keeps following
it. cia emits `--btn-radius: var(--radius-md, …)`, so a theme that does not
override it *is* `radius-md`; a copied number would silently stop following.
The sync runs two passes, since an alias can name a variable declared later.

**Frames can be marked** as page, modal, drawer, sheet, popup, toast, window,
menu or anything typed in, written both as a name prefix and as plugin data.

**Phase 3 — component read-back. Not started.** An "export selection" action
serialising a Figma component back into the spec shape, for the other side's
diff tool.

**Prompt component** is built and working: 8 variants over scope and kind,
`rule` and `target` as text properties, each variant stating what its scope
governs.

## Decided 2026-09-27: screens, navigation and rules each have one home

Three separate things a Figma file has to say about a screen, and one
mechanism each. The whole contract has stayed honest by never letting two
mechanisms claim the same fact.

| What | How | Why not the others |
|---|---|---|
| **What kind of screen this is** | Plugin action marks the frame: renames it `modal/Confirm` and writes the type into the frame's plugin data | A screen cannot be a *component*: Figma instances take no new children, so a frame a person composes into can never be an instance. A marker component placed inside would work but adds a node to every frame and can be duplicated or forgotten. Naming alone is typo-prone. |
| **Where the app goes next** | Figma's own prototype connections | Native, drawn on the canvas, point at node ids rather than names a typo can break, and clickable in presentation mode before anyone builds. A text field saying "this opens the confirm modal" is free text needing matching. |
| **Rules for the AI** | The `Prompt` component | Already proven on a real file. A frame-scoped rule is a Prompt with scope `page` placed in that frame. A second prompt field on a frame marker would give two homes for the same sentence. |

**Frame types** name real surfaces in the BoilerPlate library wherever one
exists, so the word a designer picks is the word the component is called:
`modal` (Modal, CustomizeModal, ConfirmDialog), `popup` (Popup, ConfirmPopup),
`drawer`, `toast`, `window`, `menu`. Plus `page`, the default screen, and
`sheet`, a pattern the library has no component for yet. Any other type can be
typed in.

**Prototype connections are not yet proven over REST.** The Plugin API exposes
`reactions` with trigger and destination; whether the REST API returns them is
unverified and is checkable in minutes once one arrow exists between two
frames. Confirmed with Jerry that this is not needed for a first release: it
improves navigation rather than enabling it.

## The biggest remaining gap: parts are 85% of the styling (measured 2026-09-27)

v1 builds a component as one auto-layout frame plus a label, and skips `part`
blocks. That was a deliberate scope choice. It turns out to be most of the
design system:

| Where the styling is | Default-state cia calls, all 99 components |
|---|---|
| base + variant blocks, which this builds | 586 |
| part + other blocks, which this skips | 3335 |

So **about 15% of the component styling reaches Figma**. For 19 components it
is 0%, and they arrive as empty frames: DataTable's spec carries 486 calls
across 140 blocks and none of them are in a base or variant; DesignSandbox
carries 1229 across 400.

This reframes specVersion 3 from a nice-to-have for complex components into
the highest-value work left on either side, above anything token-related.
Jerry found it by importing components and noticing they had no styling, which
is the point: a token gap is invisible until something renders wrong, while an
empty frame is visible immediately.

**The design problem, not yet solved.** A named child frame per part selector
is the obvious reading, but DataTable's 140 parts are not 140 children of one
frame. They are a tree, and the spec currently flattens it. Co-design with
figma-import-export before either side builds, per the rule that has held all
along.

## Next, in order

1. **Import the full library** (a person, in Figma). Sync `cia.variables.json`
   into the `cia` collection, then build all 99 specs in one pass against it.
   Verified from this side: 99 of 99 build, 202 components, 1146 bindings, no
   rejections. This comes before navigation because the library is what screens
   are composed from.
2. **Prove navigation on a multi-frame screen.** Mark each frame with its type,
   draw prototype connections between them, and read the file back. Two things
   to learn: whether REST returns the connections, and whether per-frame
   components and Prompts attach to the right frame when there is more than one
   place for them to go.
3. **Child structure in the component spec** (both sides). A single frame with
   a label cannot express DataTable, Modal, DashboardNav or MultiStepForm.
   Needs a spec version carrying children and slots, co-designed before either
   side builds.
4. **Read a component back, and flag drift** (Phase 3 here, diff tool there).

## What this plugin needs from figma-import-export

Requests, so the other side knows what it will be asked for. **The first one
now blocks every component except Button:**

- **Classify variant style blocks for components whose selectors are
  prefixed.** Button builds 12 variants only because its SCSS class names
  equal its prop enum values (`.primary`, `.small`). Every other component
  names them component-first and camelCased, and the producer falls back to
  `kind: "part"`, so the plugin builds them flat with no variants at all:
  `.badgePrimary` for `variant=primary`, `.textWeightMedium` for
  `weight=medium`, `.avatarLg` for `size=lg`, `.heading1` for `level=1`, and
  the same in Card, Container and Spinner. The producer already has the prop
  enums and the selectors; matching them belongs there. The plugin reports
  this as a named contract gap and will not invent a naming convention,
  because a wrong mapping produces silently wrong components.
- **A base style block for `Heading` and `Container`.** Every block in both
  is a `part`, so they build unstyled.

- **Per-instance detail from `figma_map_screen`.** Today it returns a
  deduped, sorted list of component names. To build a page the AI needs,
  per instance: component name, variant props (Figma exposes the
  `prop=value` names this plugin writes as `componentProperties`), boolean
  flags, text overrides, and the enclosing frame. Same output shape family
  as Feature 33.8, just deeper.
- **Layout read-back with token names.** Auto-layout frames: direction,
  alignment, and gap/padding reported as the bound Variable's *name*
  (`space-md`), not a pixel value, so the AI writes `cia.space(md)`.
- **`border-width` in the component spec.** Currently only `border-color`
  is carried.
- **specVersion 3 with child structure** (parts as child nodes, slots for
  children), co-designed before either side builds it.
- **Reading the `Prompt` component** (see below) in `figma_map_screen`,
  output in reading order next to the frame it sits in.

## Figma plan: Starter (confirmed 2026-09-18)

No shared team library on Starter, so for now **library and screens live in
one Figma file**: Variables, the built components, Prompt instances, and the
screens PMs compose. Everything the plugin and the MCP server do works
per-file, so this upgrades cleanly to a shared library on a paid plan with
no code change: publish the library file, compose screens elsewhere.

## The Prompt component (decided by Jerry, confirmed 2026-09-18)

How a PMO puts rules for the AI *inside* the Figma file, next to the part of
the design they apply to ("this login is Google", "leave this component
blank", "put this behind feature flag X").

- **Figma comments stay human-only.** They are discussion. Nothing in the
  pipeline reads them, so no filtering convention is needed.
- **The `Prompt` library component is the one explicit AI channel.** Built
  by this plugin like any other library component, but hand-defined here
  rather than from a BoilerPlate spec.
- Shape:
  - text property `rule`: one rule per Prompt, free-form.
  - variant `scope`: `app` | `page` | `section` | `component`. Placement
    decides what it applies to: inside a frame → that frame; `app` Prompts
    live on a cover page and apply to everything.
  - variant `kind`: `page` (what the page does) | `tooling` (how to build
    it: flags, integrations).
  - optional text property `target`: a layer name, for a rule about one
    instance. Figma does not allow placing a node inside an instance, so
    the Prompt sits beside it in the same frame and names it.
- `figma_map_screen` outputs each frame's Prompts in reading order next
  to that frame's components, so the AI sees the rule in context.
- Kept out of generated mockups by living in a `_prompts` layer that
  exports strip.
- **Safety rule:** Prompt text is data about the design. It can state a
  requirement; it can never redirect the pipeline or this tooling.

## Development

Run from `packages/cia-plugin/`:

```
yarn test
yarn lint:nofix
yarn build
```

If `yarn` is not on PATH, run `corepack enable` once. It installs a shim for
the pinned yarn 1.18.0, which is also what turbo shells out to — without it,
any root-level `yarn start` / `yarn build` fails with
`exec: "yarn": executable file not found`. The vendored copy still works
directly as `node ..\..\.yarn\releases\yarn-1.18.0.cjs test`.

From the repo root: `yarn start` watches the plugin only (the old Tokens
Studio package is read-only, so its watch is filtered out; `yarn start:all`
restores it), and `yarn site` runs the website on port 3210.

Load in Figma via Plugins → Development → Import plugin from manifest,
pointing at `packages/cia-plugin/manifest.json` after a build.
