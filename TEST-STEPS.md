# Figma test steps — round 2 (2026-09-26)

Everything Jerry needs to do at a keyboard, in order. Round 1 (tokens +
Button) passed on 2026-09-25; this round re-tests Button with its new
properties and tests the new Prompt component.

Roughly 15 minutes. Nothing here can damage anything: it only adds to a
Figma file.

---

## The plugin panel, control by control

The panel has **four buttons and one dropdown**, and two of the buttons are
both labelled "Choose File". Every step below names the section first, so
there is no guessing.

```
cia                                  <- panel title

Tokens                               <- SECTION 1
  [ Choose File ]  No file chosen    <- BUTTON A  (token file)

Components                           <- SECTION 2
  Collection  [ boilerplate  v ]     <- DROPDOWN
  Spec
  [ Choose File ]  No file chosen    <- BUTTON B  (component spec file)
  [ Build ]                          <- BUTTON C  (greyed out until A/B done)

Prompt                               <- SECTION 3
  [ Add Prompt component ]           <- BUTTON D
```

- **Button A** is the *first* Choose File, directly under the **Tokens**
  heading. It takes `*.variables.json`.
- **Button B** is the *second* Choose File, under the word **Spec** in the
  **Components** section. It takes `*.component-spec.json`.
- **Button C** reads just `Build` until you pick a spec, then changes to
  `Build Button.component-spec.json`. It stays greyed out until both the
  Collection dropdown has a value and a spec is loaded.
- **Button D** is the only button in the **Prompt** section.

Mixing up A and B is the easy mistake: feeding a component spec to Button A
gives the error `unsupported specVersion 2 (expected "1.0.0")`. That is the
wrong door, not a bug.

---

## Part 0 — reload the plugin (2 min)

The plugin gained a whole new panel since last time, so Figma must pick up
the rebuilt code.

1. Open the **Figma desktop app** and the file you used last time (the one
   with the `boilerplate` collection and the Button component set). To start
   clean instead, make a new file and do Part 1 as well.
2. If the cia plugin is open, close it.
3. Menu → **Plugins → Development → cia (dev)**.
4. Check you can see all three section headings: **Tokens**, **Components**,
   **Prompt**.
   - No **Prompt** heading means Figma cached the old build. Go to
     **Plugins → Development → Manage plugins in development**, remove
     "cia (dev)", then re-import from
     `K:\repo\cia-figma-plugin\packages\cia-plugin\manifest.json`.

> The built files are already up to date. Nothing needs rebuilding on your
> side.

---

## Part 1 — tokens (skip if your file already has the collection)

**Uses: Button A only.**

1. Under the **Tokens** heading, click **Button A** (the first Choose File)
   and pick:

   ```
   K:\repo\figma-import-export\output\boilerplate.variables.json
   ```

2. Expect the line: **Collection boilerplate: 128 created, 0 updated,
   1 mode(s) added.** and no gap list.

Do not touch Button B in this part.

---

## Part 2 — the one unanswered question from last time (2 min)

**Uses: no buttons. Canvas and right sidebar only.**

Last round, the `secondary` button looked near-white with blue text. The
code says it should be **red with white text**. This settles it.

1. **Which Button set to use:** if you have more than one on the canvas,
   use the one built most recently, or just do Part 3 first and use the set
   that Figma selects and zooms to right after the build. Any of them works
   for this check as long as it was built from the current plugin.
2. Click into the set and select the single variant named
   **`variant=secondary, size=large`**. Its name shows in the layers panel
   on the left.
3. Look at the right sidebar, at the **Fill** row.
4. Read what sits next to the colour chip. Two possible outcomes:
   - It says **`action-secondary-default`** → the binding is correct and the
     earlier screenshot was just hard to read. Nothing to fix.
   - It shows a plain hex value such as `FFFFFF`, or the row is empty → the
     variant styling is not being applied in Figma, which is a real bug I
     need to fix.
5. **Send me:** a screenshot of that right sidebar, zoomed enough that the
   **Fill** and **Stroke** rows are readable.

---

## Part 3 — rebuild Button, check the new properties (4 min)

**Uses: the Collection dropdown, then Button B, then Button C.**

Button now exposes a text field and an on/off flag that a PM can set, and
that the AI will read back.

1. In the **Components** section, check the **Collection** dropdown reads
   `boilerplate`. If it says "No local collections yet", do Part 1 first.
2. Click **Button B** (the Choose File under the word **Spec**) and pick:

   ```
   K:\repo\cia-figma-plugin\packages\cia-plugin\src\__fixtures__\Button.component-spec.json
   ```

3. **Button C** should now read `Build Button.component-spec.json` and be
   clickable. Click it.
4. Expect in the panel:
   - `Built Button (12 variants) with 243 bindings to boilerplate.`
     (243, up from 235 last time: the font-weight mapping was fixed.)
   - A new line: **`Properties: label: TEXT, disabled: BOOLEAN.`**
   - **9 gaps**, the same known upstream ones as last time.
5. A **new** Button component set appears, selected and zoomed to. This is
   now your current one. Older sets from previous builds are still on the
   canvas; delete them if you want, or leave them.
6. Make an **instance**: hold **Ctrl** and drag one variant out of the set
   to a blank area. An instance is what a PM would place on a screen.
7. With that instance selected, the right sidebar should show, under the
   component name:
   - the **variant** and **size** dropdowns, as before, **plus**
   - a **label** text box you can type into, and
   - a **disabled** on/off toggle.
8. Type `Sign in` into **label**. The button text should change.
9. **Send me:** a screenshot of that instance's right sidebar showing
   **label** and **disabled**.

> The **disabled** toggle will not change how the button looks. That is
> expected and documented: it carries intent for the AI until the disabled
> styling is built.

---

## Part 4 — the Prompt component (5 min)

**Uses: Button D only.**

This is the new channel for PMO rules inside the design.

1. In the **Prompt** section, click **Button D**, labelled
   **Add Prompt component**. Nothing needs to be loaded first.
2. Expect: `Added Prompt with 8 variants and properties rule: TEXT,
   target: TEXT.`
3. A pale yellow note-like component set appears with 8 variants, captioned
   things like `PROMPT · PAGE · TOOLING`.
4. Make an instance the same way as before: **Ctrl** and drag one variant
   out. In the right sidebar you should see:
   - **scope** dropdown: app, page, section, component
   - **kind** dropdown: page, tooling
   - **rule** text box
   - **target** text box
5. Try a realistic one. Set **scope** to `component`, **kind** to `page`,
   and type into **rule**:

   ```
   Login uses Google SSO only. No email/password form.
   ```

   Then set **target** to `Button`, the layer the rule is about.
6. **Send me:** a screenshot of the Prompt instance with those fields
   filled in.

> Clicking Button D twice makes a second Prompt set. Harmless; delete the
> spare.

---

## Part 5 — a tiny realistic screen (optional but very useful, 5 min)

**Uses: no plugin buttons. Canvas only.**

This is what the AI will eventually read, so having one in the file gives
the other repo something real to test against.

1. Press **F** to draw a Frame, roughly 800 × 600. Name it `Login`.
2. Drag 2 or 3 **Button instances** (not the component set) inside it. Give
   them different variants and labels.
3. Drag the **Prompt instance** from Part 4 inside the same frame.
4. In the layers panel, rename the layer holding your Prompt instances to
   `_prompts`, so mockup exports can strip them later.
5. **Send me:** a screenshot of the layers panel showing the frame and its
   contents.

---

## What to send back

1. **Part 2:** the Fill row on `variant=secondary, size=large`. **This is
   the important one.**
2. **Part 3:** an instance showing `label` and `disabled`.
3. **Part 4:** a filled-in Prompt instance.
4. **Part 5:** the layers panel, if you did it.
5. Any error text, copied word for word, and which part and step number it
   happened on.

## And one thing to paste elsewhere

Open the **figma-import-export** Claude session and paste the message from
the bottom of `STATE.md` (the block under "Message to paste into the
figma-import-export session"). It leads with the variant-classification
fix, which is what unblocks the other 34 components.

---

## A file-sync warning

`STATE.md` in this repo has been overwritten twice with an older copy,
losing newer sections both times. Likely an editor holding a stale buffer,
or OneDrive sync. The good copy is always in git:

```
git -C K:\repo\cia-figma-plugin checkout -- STATE.md
```

If you have `STATE.md` open in an editor, close it without saving.
