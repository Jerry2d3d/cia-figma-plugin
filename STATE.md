# Where we are — 2026-09-27

A pick-up-from-cold note. Read this, then `ROADMAP.md` in this repo, then
`K:\repo\figma-import-export\ROADMAP.md`.

## TYPOGRAPHY AND SIZES NOW BUILD (2026-09-27, latest)

Four commits: `9a4a038a`, `17ac709a`, `41034157`, `fec57675`.

cia's `type(heading-1)` expands in Sass before any CSS exists, so a spec records
only the preset name, and that was reported as a gap. Five of Heading's six
variants carry nothing else, so every level built at the same size: Heading sat
in the `ready` folder and was broken by outcome. `$_type-scale`, `$font-sizes`,
`$line-heights` and `$letter-spacings` are now mirrored in `buildComponent.ts`
next to `FONT_TYPE_PRESETS`, which already mirrored `$_font-types`. Heading
builds six sizes, 36px down to 14px.

**Three things called unrepresentable were not.**

- A font size with no exported Variable. cia exports only `font-size-base`, so
  everything else was a gap and the text stayed at Figma's default. The scale is
  fixed, so the value is exact. 354 gaps became applied values.
- A line height. A unitless multiplier fits no Figma FLOAT, which is why it
  cannot be *bound*, but Figma accepts PERCENT and 1.5 is exactly 150%. 49 calls
  now apply.
- A font weight. Figma derives `fontWeight` from `fontName.style` and will not
  let you set it directly, so a missing token never cost the weight, only the
  binding. Reporting it as a gap claimed the text had lost its weight.

All three now report as skips saying the value was applied but **cannot follow a
theme**. That is the accurate claim and it is the real upstream ask: 92 values
are correct in Figma and hardcoded, so every heading in every theme is the same
size until the numbered typography tokens exist.

**Widths and heights.** figma-import-export added a `dimensions` array
(`eda398b`), 485 declarations, 76 on blocks this version builds. Container was
blocked entirely on it and now builds its five maxWidth variants. Figma applies
`minWidth`/`maxWidth` only to auto-layout frames, which every component now is,
because of the next item.

**The 100x100 frame.** A component whose spec has no `flex()` call kept Figma's
default size, which clipped a 30px heading. It now hugs its label. Side effect
worth knowing: declared padding is now visible, because Figma ignores padding on
a frame with no layout. Components that looked like they had no padding had it
all along.

**One ambiguity that used to resolve by luck.** Checkbox's base block sets
`font-size` three times, because its `[data-size]` rules are mutually exclusive
variants the exporter folded into one block. Previously an unbindable size
produced no operation, so whichever value had a token was the only one left
standing. Now all three resolve and last-wins would render every small checkbox
large. The builder prefers the candidate that has a token and reports every
candidate, saying the missing thing is the variant axis, not the values.

**Variants from tagged declarations (`275ca5fc`).** The exporter now tags each
declaration with the prop value it came from when it sat in a nested selector, so
`&[data-size="sm"]` inside a root rule is finally distinguishable from the base.
That retired the ambiguity above: Checkbox's three sizes became three variants of
a `size` axis. 8 components gained an axis. Done as a spec rewrite before
anything reads the spec, so axis discovery and op caching needed no changes.

Two cases are deliberately not split. A tagged declaration inside a `part` styles
a child, so making it a variant of the root would put styling on the wrong node.
A declaration tagged with one prop inside a block that is already a variant of
another belongs to two axes at once, which one block cannot express, so it is
reported. No cases of the second exist today.

**Measured over all 99 shipped specs:**

|                      | 09-26 | after typography | after variants |
|----------------------|-------|------------------|----------------|
| variants             | 202   | 202              | 233            |
| bindings             | 1120  | 1111             | 1142           |
| gaps                 | 131   | 70               | 61             |
| applied-unthemeable  | 0     | 92               | 92             |
| empty frames         | 21    | 21               | 21             |

Then descendant paths landed, which corrected the node a lot of that was on:

| | after descendants |
|----------------------|-------|
| variants             | 233   |
| bindings             | 891   |
| gaps                 | 51    |
| applied-unthemeable  | 69    |
| empty frames         | 25    |

Components with zero gaps: `ready` 5 of 9, `partial` 49 of 69, `blocked` 6 of 21.

The nine lost bindings are correct: Button and ToggleButton variants whose own
size has no token used to keep the base binding and silently render at the base
size. Trading a binding for the right size is the trade this whole change makes.

**None of the 61 remaining gaps is a builder fault.** In the `ready` bucket the
remaining ones are upstream: `space-2xs` (five), `font-size-2xs` (one) and Stack's
`space($gap)`, an unresolved mixin parameter the exporter chose to leave alone
because there is one occurrence. LightDarkToggle's `onChange`, which was typed as
an enum because the union came off the callback's parameter, is fixed upstream.

**Descendant paths (`8ce48876`), and this one was a real correction.** The
exporter now records the descendant selectors a declaration sat inside, so
`.label { font-size: ... }` written inside `.inputWrapper` is distinguishable
from the wrapper setting its own size. 501 declarations carry a path, 169 on
blocks this version builds, and **those 169 were being painted onto the root
frame**. A declaration inside a descendant now becomes a synthetic `part` block,
so it stops reaching the root and flows into the existing "not built" reporting.

That took bindings from 1142 to 891. The 251 are a correction, not a regression:
they were root frames wearing their children's font sizes, colours and spacing,
which is why some components looked plausible and wrong. Four more components now
correctly report that all their styling is in children.

All five font-size folds are gone, so the ambiguity machinery from `17ac709a` has
nothing left to resolve in this library. It stays, because a block really can
state two sizes for one element, but it is no longer load-bearing.

**Three stale spec files, found and fixed at the cause.** `Calendar`,
`ConfirmPopup` and `Stack` each existed twice, in `blocked/` and in `partial/` or
`ready/`, because the bucket classifier only ever wrote and never cleaned, so a
component moving between buckets kept its old file forever. One of the stale
copies had mixin arguments leaked into its selector. Fixed upstream in `de51c3c`:
writing a spec now removes that component's file from the sibling buckets and
reports what it removed. 99 files for 99 components.

## THE ELEMENT TREE IS BUILT (`c6602bed`, latest)

figma-import-export ships the tree read from each component's JSX: every node
with its parent and its JSX tag, for 93 of 99. That was the last missing piece.
Until now a part's styling was resolved, reported and thrown away, because there
was no node to put it on.

Every node is built as a nested frame, and each part block's styling lands on the
node it names. Unstyled nodes are built too, because a designer has to be able to
see and switch off the parts, and an unstyled node is still a real element.

| | before | after |
|--------------|------|------|
| bindings     | 891  | 3731 |
| arrive empty | 25   | 5    |
| gaps         | 51   | 165  |

**Twenty of the twenty-five empty components now build their parts.** That is the
number a person can see on the canvas.

The gaps tripling is the same shape as everything else this week: those gaps
existed all along and nothing counted them. 466 part blocks are resolved for the
first time, so their missing tokens are visible instead of being skipped before
anything looked. 53 of them are one absent token, `space-2xs`.

Each built frame carries a text child, which is not decoration: an auto-layout
frame with no children collapses to nothing in Figma, so a part with only a
background would be invisible. The component's own text moves into the node that
renders it, matched against the same prop names the text prop is already found by.

**18 of 99 arrive with several nodes claiming no parent, and it is never a real
forest.** Checkbox's `.label` and `.checkboxContainer` are genuinely descendants
of `.checkboxRow` and the scan could not join them. Switch's `.disabled` and
Text's `.textMuted` are conditional classes on an element that already has one,
so they are not separate elements at all. The base style block names the root
independently of the tree, so it settles which root is real; the others are
reported and left unbuilt, because attaching them would invent containment for
Checkbox and invent an element for Text.

`radius-raw` is now bound, like `space-raw` already was. Worth 108 bindings.

**A conditional class is not an element** (`1d4d3784`). The exporter now marks one
with `modifierOf`, and 27 such nodes were being built as frames. None is now,
which removed 45 bindings sitting on invented elements. Five of the 18 phantom
roots were this, so that count is 13.

They split into two kinds:

- 18 modify another element. `.itemOpen` is `.item` while open, so there is nothing
  to build and it is reported like any other non-default state.
- 9 name their OWN element, where `modifierOf` equals `parent`. The class was the
  element's only class, chosen by a ternary, so the scanner had no unconditional
  class to attach it to and fell back to the container. Input's info button and
  MultiStepForm's slide direction, both confirmed in source. An element genuinely
  exists but nothing says which alternative is default, so none is invented.

A naming heuristic was tried and **rejected**: a real modifier usually extends its
target's name, but `.active` on `.navLink`, `.selected` on `.colorSwatch` and
`.disabled` on `.switchWrapper` are all genuine and do not. `modifierOf` equalling
`parent` is a structural fact rather than a guess about names.

**Mutually exclusive class names** (`b2abdd82`). The 9 self-contradictory
modifiers became `alternativeTo`: each branch of a conditional is its own node
with the right parent, naming the others the same node can have. One frame is
built per set, not per branch, because building both invents a sibling and
building neither loses an element. No styling is taken from any member, since
exactly one applies and nothing says which.

A set is one element only when its **closure is complete**, every member naming
every other. The first version of that check was wrong: it accepted
`.runnerArmLeft` and `.runnerArmUp` as a pair while `.runnerArmUp` also named
`.runnerArmRight`. DesignSandbox uses one class on two different lines, so the
relation collects three classes that are two elements. Left and Right never name
each other, which proves they are not the same node, so the group is refused.

**The spec's own findings were being dropped** (`16e3bce9`). The producer reports
what it could not resolve about the source and this plugin had no field for it.
149 findings across the 99 specs, and the panel never mentioned one. Same failure
as everything else this week: a count only covers what it was built to count.

They are relayed untouched and marked `origin: 'spec'`, shown as a separate
collapsed list, because a builder gap is fixed here and a spec gap is fixed in the
component or the design system. Gaps 160 to 309, and all 149 were already true.

The most useful is one this builder cannot discover: CustomizeModal's
`.helperText` is rendered under `.label`, `.section` and `.footer`. The tree keeps
one node per class, so the builder puts it in one position and had nothing to say
about the other two. 10 parts across 6 components.

**Multiplicity was asked for and declined; positions were asked for and shipped.**
The tree says a part exists, never how many times it is rendered, so nine
`.section` blocks are one node. figma-import-export offered to design a
multiplicity field. The answer given back: not needed, because a component library
wants one instance of each part and repetition is content a designer adds by
duplicating. What was wanted instead was every *position*, which is a different
thing: `.helperText` inside `.section` and inside `.footer` are two elements, not
two copies of one. That shipped as `parents` and the builder now places a node
once per position (`c2bf0e7e`).

Three readings had to change with it:

- A node is only a **root** if every one of its positions is a root position.
  Skeleton's `.skeleton` is inside `.lines` and also stands alone, so it is a
  reused child, not a second root. Two phantom roots gone with no stitching.
- **Reachability replaced acyclicity** in the validator. A class may name ITSELF
  as a position, because markup nests recursively and DesignSandbox really puts a
  `.demoRow` label inside a `.demoRow` div, so the old walk-to-root check would
  have rejected real data. What is checked now is that at least one path reaches a
  root, since a node with none could never be placed.
- A stated position is **realised once along any one path**. That is what makes
  the self-position terminable without dropping it: refusing it loses a position
  the spec states, allowing it freely descends forever.

One correction worth recording, because a fixture was pinned on the wrong value:
`.helperText` has two positions, `.section` and `.footer`, not three. The third
came from a scanner bug and was never a fact about the source.

**Ten of the fourteen multi-root trees are several components in one file**
(`456b2df7`). One `.tsx` usually declares several things that render JSX, and the
tree covers the whole file, so `Menu.tsx` produces MenuList, Menu and ContextMenu
together. `declaredIn` now names each node's declaration. The report saying the
scan "could not connect them" was asserting a cause wrong more often than right.

Selection is unchanged: the base style block names the root element and is the
only evidence independent of the JSX scan. Which of the other declarations are
separate components and which are parts of this one is left open, because a second
declaration often IS a part of the first (ScrollTop's `DEFAULT_ICON` is markup
ScrollTop renders) and the file name does not always match a declaration name.

**The root rule needed a caveat.** "Only a root if every position is a root
position" was right for Skeleton, wrong for Menu. `.menuPopup` has a root position
and its other position is `.contextTarget` from a DIFFERENT declaration, so
nothing in Menu's own markup contains it and there it really is the top. The test
is now whether a containing position shares the node's declaration, which
separates that from Skeleton's reused child and from ColorPicker's `.swatch`.

Final: **233 variants, 3713 bindings, 160 build gaps plus 156 relayed, 3 arriving
empty, 163 tests.**

**The dry run is now permanent** (`libraryDryRun.test.ts`), because of a failure
class neither repo's own suite can see. Every number either side publishes is a
count of things *present*, so a thing that never arrived is invisible: the
selector that vanished from an export was not mis-reported, it was absent, and
absence cannot show up in a total. To catch it you need a count taken from
outside the pipeline being measured, which is what the builder counting the
exporter's output is. It asserts one spec per component and that every spec
validates; the totals are printed rather than asserted, because they move
legitimately with every upstream improvement. It skips when the other repo is not
checked out, so this repo still passes alone.

Fixtures now pin the real shipped Button, Heading and Container specs, so the
exporter and the builder fail together rather than drifting apart.

## THEMING: ONE LIBRARY, FIVE THEMES (2026-09-27)

**Decided and built.** A component binds to a variable inside a specific
collection, so a library built against a collection named `boilerplate` could
never follow another theme: switching would mean rebuilding all 202
components. Figma allows **10 modes per collection** on this plan, which is
exactly five themes with light and dark each. So the theme is a *mode*, and
the collection is theme-neutral.

  collection: `cia`
  modes: sketchbook / boilerplate / terminal / glass / press, each Light + Dark
  133 variables, 26 alias values

Switching theme is selecting a mode on a frame. No rebuild, and a page frame
and a modal beside it can show different themes at once. **This had to land
before the full library import**, or 202 components would have been bound to
a collection named after one theme and need importing twice.

**Alias values** (`{ "aliasOf": "radius-md" }`) landed in commit `53b4ceee`.
cia emits `--btn-radius: var(--radius-md, …)`, so a theme that does not
override it *is* `radius-md`; copying the number would silently stop following
the moment someone edited `radius-md`. The sync runs two passes so an alias can
name a variable declared later. Missing target, type mismatch and loops are
gaps with the mode left unset, never a literal.

**specVersion now accepts 1.0.0 or 1.1.0.** The rule, which came from the other
side and is better than what I would have written: a payload declares the
minimum version needed to **read** it, not the version that produced it. That
makes it a property of the payload rather than of either tool, so it protects a
reader written before the feature existed. Single-theme exports stay 1.0.0 and
keep working with any build of this plugin.

**The "how do we represent missing" question was the wrong question.** Eight
variables looked absent. Four were a real css-is-awesome bug: press emitted its
page-surface tokens inside `@media print` and outside any selector, so they
applied to nothing in any browser. Their deriving script inserted before the
last closing brace, and press is the only theme whose file ends with a media
query. Four more were never missing: they follow a documented library default
and now alias to it. One remains, `space-2xs`, honestly unset because the
library states no default to follow.

Two further upstream bugs fell out of the parity check css-is-awesome added in
response: terminal-light had rounded buttons in a square-cornered family, and
boilerplate base lacked a spacing alias both its variants set. Still open there:
sketchbook declares `--space-2xs` in its `-light` variant only.

**Lesson worth keeping:** we were an hour from building machinery to represent
absence faithfully, for eight cases where almost nothing was absent. Jerry's
"why do we need this" is what caught it. Ask it whenever either side proposes
new structure: is this a real hole, or a symptom?

**Caveat for a person, not a session:** the press fix is on css-is-awesome's
`main` but not in production. Their chain is main → qa → production with a
manual approval only Jerry can run. Our export reads the checkout so we are
unaffected; the published package and live site are not.

## THE LOOP IS CLOSED (2026-09-27)

**The whole chain now has a real working example at every link**, proven on a
real Figma file, and verified independently by both sides reading the same
document and agreeing exactly.

Jerry wrapped the `Login` frame in auto-layout and bound its spacing. Every
binding resolves through the variable map this plugin writes:

| Field | Resolves to |
|---|---|
| itemSpacing (`VariableID:7:330`) | `space-md` |
| padding, all four (`VariableID:7:331`) | `space-lg` |
| fill (`VariableID:7:227`) | `paper` |

Six bindings, six names, zero unresolved, same ids on both sides. So a screen
reads back as `gap: space-md`, not `gap: 16`. That is the difference between an
AI rebuilding a page and guessing at it.

Also confirmed on the same read: three Button instances with distinct variants
and real label overrides (`Sumit`, `Cancel`, `Notes`), identity resolved
through `componentId` so renaming a layer does not break it, and a Prompt
carrying its rule, scope, kind and target.

**I can now read Figma directly from this session**, using the token in
`K:
epoigma-import-export\.env.local`, so verifying a file no longer
needs a round trip to the other session:

```
curl -s -H "X-Figma-Token: $TOKEN"   "https://api.figma.com/v1/files/<key>?depth=4"
```

Add `?depth=1&plugin_data=shared` to read the variable map off the document
node. Note the map lives on the *document*, so a nodes request for a page or
frame never returns it however deep it goes.

**Three bugs this read found, all in the other side's reader, all fixed
(their `e88ec35`):** paint bindings were ignored entirely, so a frame with a
bound background reported no token; a Prompt on the canvas was described as
being inside a frame called "Page 1" because the root node's name was used as
a fallback; and the enclosing frame was tracked by name, so two frames called
`Card` would have merged.

**Open on this side:** a Prompt dropped into an auto-layout frame becomes a
laid-out sibling of the content. The plugin panel now says to set
`Position: Absolute`, which keeps it inside the frame (so the rule still
attaches) while floating it over the screen. Whether a main component can
carry `layoutPositioning` to its instances is unverified: that is exactly the
kind of thing the test fake would allow and real Figma might refuse, so it has
not been guessed at. Needs one check in Figma.

**Next genuinely new thing to prove:** a second screen with more than one
frame, so per-frame component references and Prompt attachment can be checked
when there is more than one place for them to go.

## WHERE IT STANDS NOW (2026-09-26, latest)

**The whole library builds.** The other side landed variant classification, so
all 99 specs now build: 202 components, 1072 bindings, 26 with real variants,
up from 35 components and 243 bindings. Nothing is rejected and nothing throws.

**Both of my earlier findings were wrong, and were corrected:**
- `border-width` was never missing from the contract. It has been there since
  their commit `13d2e91` on 09-24; our fixture was copied on 09-17. Fixture
  re-synced, Button strokes are 2px from the spec, and the false gap is gone.
- `space-2xs` is not an exporter merge bug. The base boilerplate theme never
  declared it, so it belongs to css-is-awesome. They now report it as
  `missingVsVariants` per theme.

**Three problems the 99-spec survey found, all fixed here:** 7 specs were
rejected because `borders[].style` is null for a longhand width (validator was
too strict); `Flex` multiplies out to 600 variant combinations so the builder
now declines above `MAX_VARIANT_COMBINATIONS` and names the axes; and calls
setting a CSS custom property or using compound mixins (`border`, `elevation`,
`stack`, `contain`, `container`) are now skipped with a reason rather than
called unsupported.

**The variable map is written** (`src/plugin/variableMap.ts`, commit
`fad0ee20`). Figma only reports a variable *id* over REST and resolving ids to
names is Enterprise-only, so the plugin saves the map as shared plugin data on
`figma.root` after every sync, namespace `cia`, key `variableMap`. Covers every
local variable (`coverage: "all-local"`), rewritten wholesale each sync. The
other side has pinned its reader against this exact payload (their `77302da`).
This is what lets layout read back as `space-md` instead of an id, on Starter.

**121 gaps remain, all genuine and all upstream:** 60 missing typography
tokens, 14 components with no base block, 7 missing spacing tokens, 5 Sass type
presets. The other side measured the same typography gap from the component
side: 13 tokens across 482 call sites, with `font-size-sm` and `font-size-xs`
alone accounting for 311. Their `docs/token-demand.md` is written up for
Gremlin Forge.

**Open decision for Jerry, not for either session:** whether layout primitives
(`Flex`, `Grid`, `Stack`) belong in a Figma library at all. Their axes are
props a developer sets per usage, not variants a designer picks from a list.
`Container` is the genuine edge case: five deliberate widths.

**Nothing is blocked except one thing: a real composed screen in Figma.** Both
halves are built and idle waiting for it.

## THE SITE (added 2026-09-26)

`site/` is a Next.js app documenting both halves of the pipeline, built with
the design system it documents: css-is-awesome for tokens and the SCSS API,
and BoilerPlate v2's own React components. Run it with `npm install` then
`npm run dev` from `site/`, which serves on **port 3210** (not 3000, which
boiler-project-ai and most other Next apps here already use).

Five routes, all prerendering static: `/` (landing), `/how-it-works`,
`/plugins` (public), plus `/docs` (the test runbook, with a copy button on
every path and command) and `/log` (this build log, newest first). The two
internal routes are linked separately in the nav so they can be dropped in
one edit before a public launch.

**Editing it:** status, log entries, next steps and every copyable path live
in `site/src/content/pipeline.ts`. One edit, not five pages. `site/README.md`
records the three integration details that were not obvious (aliasing
`@boilerai/react` source as `@bp/*`, `sassOptions.loadPaths` needing cia's
own `scss` dir, and why `src/styles` must stay off that list).

The site is the human-facing source; this file stays the agent-facing one.

## ROUND 2 PASSED TOO (2026-09-26)

Jerry re-ran everything in Figma after the day's work and reported it all
working: Button rebuilt with its new `label: TEXT` and `disabled: BOOLEAN`
component properties, and the **Prompt component builds and works** (8
variants over scope x kind, with `rule` and `target` editable per instance).

One real bug was found and fixed in between (`8d82d29c`): the Prompt build
threw *"node must be an auto-layout frame or a child of an auto-layout
frame"* because `layoutSizingHorizontal` was set on each text node before
`appendChild`, so it had no auto-layout parent yet. The text nodes now carry
an explicit width and the frame hugs them. The test fake was made strict —
it throws on that same misuse and flags any frame resize — so the mistake
cannot return unnoticed. Only real Figma could have caught this; the
permissive fake let it through.

**Still unconfirmed:** whether the Fill row on `variant=secondary,
size=large` names `action-secondary-default`. Jerry reported everything
working, which implies yes, but it was never read back explicitly.

**Everything this plugin can build today is proven in Figma.** The next
move is not here — it is the variant-classification fix upstream (below),
without which 34 of the 35 components build flat.

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

Unit tests pass, lint clean, production build clean. Run `yarn test` from
`packages/cia-plugin/`. If `yarn` is missing from PATH, run `corepack enable`
once: it installs a shim for the pinned yarn 1.18.0, which is what turbo
shells out to, so without it any root-level `yarn start` fails with
`exec: "yarn": executable file not found`. The vendored copy still works
directly as `node ..\..\.yarn\releases\yarn-1.18.0.cjs test`.

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
