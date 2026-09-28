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
| Component spec `{ specVersion, component, props, styleBlocks, tree, gaps }` | figma-import-export → plugin | `2` | `src/shared/componentSpec.ts` |
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

Four of cia's Sass maps are **mirrored** in `buildComponent.ts`, because they
expand at compile time and leave nothing in the CSS to read: `$_type-scale`,
`$font-sizes`, `$line-heights` and `$letter-spacings`. Without them
`type(heading-1)` was a gap and every Heading level built at the same size. If
cia changes one of those maps the mirror must change with it, so a test asserts
the typography contract is still one step per axis and fails the day it grows.

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

**The whole library builds, with its inner parts** (2026-09-28). All 99 specs,
282 components, 4935 bindings, nothing rejected. A component now arrives as a
nested tree of named frames rather than one styled box, so the styling of its
label, icon and rows lands on the right element. 3 components still arrive empty
because their JSX cannot be scanned. The figures are a floor: they are measured
against one theme's tokens, and a collection carrying several holds the union.

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

**Text component** (2026-09-28): the first library primitive. One variant per
cia type preset, display down to overline, each with and without wrapping, the
text as a property. Size, weight, line height and spacing bind where the
collection has a variable and are set as numbers where it does not. Built from
cia's presets with cia's values, so heading-1 is 30px bold rather than whatever a
hand demo used.

**Decided 2026-09-28: composition, in dependency order.** Every component will
place a Text instance where it has text and a Button instance where it has a
button, rather than building its own. A big component is cut into components of
its own parts: DataTable's top bar with its heading, search and buttons is one
component, its action menu another, and DataTable is those placed together. So
the build order is variables, Text, Button, then everything that uses them, and
Figma's 64-variant cap is met by cutting rather than truncating. Not built yet;
the element tree already knows the subtrees.

**Decided 2026-09-28: a page per component, read instead of the source.**
BoilerPlate will render each component into a page from the compiled component,
showing every flag state, with `data-component` on each root and each rendered
instance labelled with its props, and the text as placeholders. figma-import-
export reads those pages, HTML plus compiled CSS, rather than SCSS and JSX. That
removes every mirrored Sass map from this side, brings in the three components a
source scan cannot follow because the page has already made the runtime choices,
and makes composition visible because Modal's page contains real Buttons. Icons
are skipped in the first pass.

**What the page format must give, measured 2026-09-28** (figma-import-export
a7c02bf). 170 boolean props across the 99 components; 60 map to a part today,
110 do not; 30 of those sit in the components a source scan cannot follow, 20 in
DataTable alone. The flag-to-part mapping is NOT declared in the page. The page
renders **pairs of instances one prop apart** and the reader derives the mapping
by diff, because a diff is an observation where a declared rule is BoilerPlate
re-deriving from source what the reader already derives, with the same bugs. Where
the page does know the rule cheaply it may state it too, and a disagreement
between the stated rule and the observed diff is reported, not resolved.

1. For every boolean flag, at least one pair of instances identical except that
   flag. A curated gallery fails this silently: two instances two props apart are
   attributable to neither.
2. Every instance's props stated completely, defaults included. An unstated
   default is the same hole as Figma omitting an alignment field.
3. A stable part key on the element: `data-part`, which survives scoped-class
   hashing and says which element is the part.
4. A diff yields three kinds of change. A subtree appearing or vanishing is
   `controls`, which the contract has. Text changing is a text property. A class
   or attribute changing on an element that stays is a **state**, which the
   contract does not model today. Decided: we want states, because in Figma
   `disabled`, `open` and `loading` are a boolean variant axis whose values
   restyle the same parts, which the builder already knows how to make. The field
   is designed once a real diff exists, not before.

36 of the 110 read as state and hide nothing. A behavioural flag (`loop`,
`autoplay`, `allowMultiple`) has no static DOM difference at all, so absent keeps
meaning unknown, never controls-nothing.

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

## Parts are built (2026-09-28). This section used to be the biggest gap

It said 85% of the design system never reached Figma, because v1 built one frame
plus a label and skipped `part` blocks. That was true and is no longer.

figma-import-export now ships each component's element tree, read from its JSX:
every node with its parent and its tag, for 93 of 99. Every node is built as a
nested frame and each part's styling lands on the element it names. Unstyled
nodes are built too, because a designer has to see and switch off the parts.

| | before | after |
|---|---|---|
| bindings | 891 | 4935 |
| arriving empty | 25 | 3 |

**What it took, in case any of it is needed again.** Nine additive contract
fields, none of them changing specVersion: the element tree, descendant paths,
per-declaration variant tags, mutually exclusive class names, which declaration
each node came from, widths and heights, resolved mixin arguments, logical border
properties, and per-qualifier values for a local custom property. Each one was
co-designed before either side built, and each one landed because the consumer
said what it could not represent rather than guessing.

**The three that still arrive empty** are DataTable, HeroCodePanel and one other
whose JSX picks class names at runtime through `styles[variant]`, which a static
scan cannot follow and should not guess. That is the honest limit.

## Waiting on Jerry (2026-09-28)

Nothing here blocks the Figma run. They are decisions only he can make, written
down because they have been scattered across messages rather than recorded.

**1. The old Tokens Studio package.** `packages/tokens-studio-for-figma/` is
1,798 files and 199 MB of the forked plugin this one replaced. He asked for it to
go; it was not deleted because deleting that much is not reversible from here
without an explicit yes. Nothing in `cia-plugin` imports it. One word and it goes.

**2. css-is-awesome: what should `font-size(2xs)` do?** Four components ask for
a size cia does not define, and cia silently falls back to 16px instead of
erroring, so they render at body size and nobody sees a problem. The
css-is-awesome session recommends **warning rather than erroring** (erroring is a
breaking change for any consumer doing it today) and **not adding a `2xs` step**
(adding it would silently change those four from 16px to 10px, which is a
different wrong nobody chose). It wants Jerry to decide. Note `space()`
deliberately accepts unknown keys so layout mixins take raw lengths, so this
cannot be a blanket fix across all accessors.

**3. Three token asks, which need three different people.** Deliberately not
routed as one list, because bundling them puts the only one needing judgement
behind the only one needing typing:

| Ask | Size | Who |
|---|---|---|
| 27 components override a semantic colour in dark | Largest. A design question | Whoever owns the semantic layer. If `surface-default` were right in dark, Checkbox would not reach for `surface-subtle` |
| No scrim or backdrop colour exists | One token | Whoever owns the token set. A dimmed backdrop is the one colour a dark theme must change, and it is currently a hardcoded `rgba()` in 7 places |
| 12 hardcoded shadows | 12 edits | Anyone. `elevation()` already exists; these components just are not using it |

**4. Promote three tokens into the base?** `space-2xs` is declared by
boilerplate only, `modal-radius` by three themes, `tooltip-radius` by one. If a
component using any theme should get them, they belong in the base. The other
five varying tokens look deliberate: a theme wanting square cards declares no
card radius.

**5. Resolved without Jerry (2026-09-28).** The typography scale was one step
per axis; the exporter now emits the 44 tokens cia computes, and the plugin binds
them. Hardcoded typography values fell 354 to 76. Left here so the numbering
above stays stable.

## Next, in order

1. **Compose a real screen in Figma** (Jerry, by hand). This is the only thing
   outstanding on either side, and everything below it is blocked on what it
   shows. The runbook on the site is the step-by-step:
   `http://localhost:3210/docs`. Export the tokens first, because the file on
   disk is whatever export ran last.
2. **Prove navigation on a multi-frame screen.** Mark each frame with its type,
   draw prototype connections, read the file back. Two unknowns: whether REST
   returns the connections, and whether per-frame components and Prompts attach
   to the right frame when there is more than one place for them to go.
3. **Read a component back, and flag drift** (Phase 3 here, diff tool there).
   An "export selection" action serialising a Figma component into the spec
   shape, so a designer restyling a component in Figma is reported rather than
   silently diverging.
4. **The three components that cannot be scanned**, if they matter. Their JSX
   picks class names at runtime, which a static scan cannot follow.

## What this plugin needs from figma-import-export

**Everything previously listed here has been delivered** (2026-09-28). Nine
additive contract fields over two days, each co-designed before either side
built it. Kept below as a record of what the asks were, because the pattern is
the useful part: every one was found by a consumer saying what it could not
represent, rather than by a producer guessing what might help.

Delivered: variant classification for prefixed selectors; a base block for
Heading; `border-width`; the element tree; descendant paths; per-declaration
variant tags; mutually exclusive class names; the declaration each node came
from; widths and heights; resolved mixin arguments; logical border properties;
per-qualifier values for a local custom property.

**Still open, and small:**

- **Per-instance detail from `figma_map_screen`.** Needed to build a page from
  a screen: per instance, the component name, variant props, boolean flags, text
  overrides and enclosing frame. Partly there; proven on one screen.
- **Layout sizing read-back.** Delivered upstream but **unverified against real
  data**, and worth wiring before alignment if frames are ever rebuilt from a
  screen map. A frame rebuilt with wrong alignment looks wrong immediately; one
  rebuilt with wrong sizing looks correct until its content changes length.
- **Reading the `Prompt` component** in `figma_map_screen`, in reading order
  next to the frame it sits in.

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
