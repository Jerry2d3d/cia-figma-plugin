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
| Token contract `{ specVersion, collection, modes, variables, gaps }` | figma-import-export → plugin | `"1.0.0"` | `src/shared/tokenContract.ts` |
| Component spec `{ specVersion, component, props, styleBlocks }` | figma-import-export → plugin | `2` | `src/shared/componentSpec.ts` |
| Component spec (read-back of a Figma component) | plugin → figma-import-export | not built (Phase 3) | — |

Token names resolve by cia's own convention, so the plugin never needs to
know cia internals: `color(x)` → variable `x`; `space(x)` / `pad-asym(y, x)`
→ `space-x`; `radius(x)` → `radius-x`; `font(w, s)` → `font-weight-w` and
`font-size-s`. FLOAT values are expected in px (the exporter already
converts rem).

## Status

**Phase 0 — clean slate. Done 2026-09-11.** `packages/cia-plugin/` is a
from-scratch package: own `manifest.json`, webpack + SWC, Jest, `code.ts`
main thread, thin React panel (plain `useState`, no state library). The old
`packages/tokens-studio-for-figma/` fork stays read-only until this package
covers what is needed, then gets removed.

**Phase 1 — own the Variables read/write. Coded 2026-09-11, committed
2026-09-17 (`594e2502`).** `syncTokenContract` creates or reuses a
collection, renames the default mode, adds modes, creates or updates
variables, and reports type conflicts and undeclared modes as gaps. Unit
tested against a fake `figma.variables`. **Not yet run against a real
export inside Figma**: the matching exporter shape only landed on the other
side on 2026-09-17.

**Phase 2 — component creation. Coded and committed 2026-09-17
(`8b945a9e`).** `buildComponent` consumes a specVersion 2 spec and builds a
component set: one component per variant-prop combination (Button → 12,
named `variant=primary, size=medium` so Figma exposes them as component
properties), each an auto-layout frame plus a label, with fills, strokes,
corner radius, padding, item spacing, font size and font weight bound live
to Variables in a user-chosen collection. Reported, never approximated:

- *gaps* (route upstream): missing or wrongly typed variables; the spec's
  missing border width (Button's SCSS says 2px; stroke defaults to 1px).
- *skipped* (v1 scope, with reasons): hover/focus/active/disabled states,
  `part` blocks (`.icon`), media-query blocks, transitions, `font-family`
  (cia's value is a CSS stack, not a loadable family; Inter is used), and
  line height (cia's token is a unitless 1.5, Figma binds px).

Unit tested end to end against a fake Plugin API using the real Button spec
checked in at `src/__fixtures__/Button.component-spec.json`. **Not yet run
inside real Figma** for the same reason as Phase 1.

Known typography gap (cia side, confirmed 2026-09-13): only
`font-size-base`, `font-weight-medium`, `line-height-normal` are live
tokens. Button's `semibold`, `sm`, `lg` have no variable to bind to.

**Phase 3 — component read-back. Not started.** "Export selection" panel
action serializing a Figma component back into the spec shape, for the
other side's future diff tool.

## Next, in order

1. **Prove the loop in real Figma** (needs a person at Figma):
   `figma_export_tokens` → sync in the Tokens panel → load
   `Button.component-spec.json` in the Components panel → build → inspect
   bindings in the Variables panel. Fix what real Figma disagrees with.
2. **Wait for / consume richer screen read-back** on the other side (see
   below). No plugin work needed for it, but it is the piece that makes
   "design, then generate" real.
3. **Scale the builder to all 35 components.** Simple ones first (Badge,
   Link, Text, Heading, Avatar, Spinner, Tooltip fit the frame + label
   model as is). Structural ones (DataTable, Modal, DashboardNav,
   MultiStepForm, Card with children) need a spec that carries child
   structure and slots: specVersion 3, designed with the other side.
   Boolean props (`disabled`, `icon`) become Figma boolean component
   properties.
4. **Phase 3 read-back**, then the drift diff on the other side.

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

Run from `packages/cia-plugin/`. `yarn` is not on PATH on the dev machine;
use the vendored copy:

```
node ..\..\.yarn\releases\yarn-1.18.0.cjs test
node ..\..\.yarn\releases\yarn-1.18.0.cjs lint:nofix
node ..\..\.yarn\releases\yarn-1.18.0.cjs build
```

Load in Figma via Plugins → Development → Import plugin from manifest,
pointing at `packages/cia-plugin/manifest.json` after a build.
