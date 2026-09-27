# Figma runbook — from an empty file (2026-09-27)

Start a brand new Figma file and build everything up from nothing: five
themes, the whole component library, the Prompt component, a two-screen
design, and a theme switch.

About 40 minutes, most of it waiting on one build. Nothing here can damage
anything outside the new Figma file.

---

## The plugin panel

Four sections. Two buttons say **Choose File**, so every step below says which.

```
cia

Tokens                             <- SECTION 1
  [ Choose File ]                  <- BUTTON A   a .variables.json token file

Components                         <- SECTION 2
  Collection  [ cia  v ]           <- DROPDOWN
  Spec files
  [ Choose File ]                  <- BUTTON B   one or many .component-spec.json
  [ Build ]                        <- BUTTON C

Prompt                             <- SECTION 3
  [ Add Prompt component ]         <- BUTTON D

Frames                             <- SECTION 4
  Type  [ page  v ]                <- DROPDOWN
  [ Mark selected as page ]        <- BUTTON E
```

Token files go in **A**. Component specs go in **B**. Putting a spec in A
reports an unsupported version, which is the wrong door rather than a bug.

---

## Part 0 — new file and plugin (3 min)

1. Open the **Figma desktop app**. The browser version cannot run a local
   plugin.
2. **New design file.** Name it something like `cia library`. On the Starter
   plan the library and the screens share one file, which is fine.
3. **Plugins → Development → Import plugin from manifest**, and pick:

   ```
   K:\repo\cia-figma-plugin\packages\cia-plugin\manifest.json
   ```

   If it is already imported from an earlier session, skip this and just run
   it: the build on disk is current.
4. **Plugins → Development → cia (dev)**. Check you can see all four section
   headings: Tokens, Components, Prompt, Frames. If Frames is missing, Figma
   has cached an older build: remove the plugin under **Manage plugins in
   development** and import it again.

---

## Part 1 — the five themes (3 min)

**Uses Button A.**

1. Under **Tokens**, click **Button A** and choose:

   ```
   K:\repo\figma-import-export\output\variables\cia.variables.json
   ```

2. Expect: **Collection cia: 133 created, 0 updated, 9 mode(s) added**, no
   gaps, and a line saying the variable map was saved with 133 names.

   > Nine modes added, not ten, is correct. A new collection arrives with one
   > mode already, which gets renamed rather than left behind as "Mode 1".

3. Open Figma's **Variables** panel (right sidebar, **Local variables**).
   Confirm a collection named **cia** with **ten mode columns**:
   `sketchbook Light`, `sketchbook Dark`, `boilerplate Light`,
   `boilerplate Dark`, `terminal Light`, `terminal Dark`, `glass Light`,
   `glass Dark`, `press Light`, `press Dark`.
4. Find **btn-radius**. In most columns it should show the name
   **radius-md** rather than a number, because it points at that variable
   instead of copying it. Terminal shows 0 and press shows 2, which are real
   overrides.

**Send me:** a screenshot of the Variables panel showing the ten columns.

---

## Part 2 — the whole component library (10 min, mostly waiting)

**Uses the Collection dropdown, then Button B, then Button C.**

1. In **Components**, check the **Collection** dropdown says `cia`.
2. Click **Button B**. In the file dialog, go to:

   ```
   K:\repo\figma-import-export\output\components
   ```

3. **Press Ctrl+A.** That folder holds the 99 component specs and nothing
   else, so selecting everything is the right move. You should have **99
   files** selected.
4. **Button C** should read **Build 99 components**. Click it.
5. **Wait.** This builds 202 components with around 1146 variable bindings.
   Figma will be busy for a while. Do not click anything else in the plugin.
6. Expect: **Built 99 components: 202 variants and about 1146 bindings in
   total**, a gap list, and a collapsed list of things not built in v1.

   > The gaps are expected and already known. They are mostly missing
   > typography tokens in the design system, which is written up separately.
   > Nothing there is a plugin fault.

7. On the canvas the component sets are laid out in a grid, not stacked.

**Send me:** a screenshot of the plugin result panel after the build.

---

## Part 3 — the Prompt component (2 min)

**Uses Button D.**

1. Click **Button D**, *Add Prompt component*. Once only.
2. Expect: **Added Prompt with 8 variants and properties rule: TEXT,
   target: TEXT**.
3. On the canvas, a pale yellow note-like set of 8. Each says what its scope
   governs, so you do not have to remember the convention.

> If you click it twice you get two sets and the panel will say so. Delete
> the spare; do not delete both.

---

## Part 4 — a two-screen design (12 min)

This is the part that has never been tested. One page and one modal.

1. Press **F**, draw a frame about **1200 × 800**, name it **`Login`**.
2. Press **F** again, draw a smaller frame about **400 × 240** beside it,
   name it **`Confirm`**.
3. **Mark them.** Select the `Login` frame, set the **Frames** dropdown to
   **page**, click **Button E**. The frame is renamed `page/Login`.
4. Select the `Confirm` frame, set the dropdown to **modal**, click
   **Button E**. It becomes `modal/Confirm`.
5. **Fill the Login screen.** Ctrl-drag three **Button** instances out of the
   Button set into `page/Login`. Set them to different variants and type real
   labels, for example primary large "Sign in with Google", outline medium
   "Use a passkey", ghost small "Need help?" with **disabled** on.
6. Select the three buttons and press **Shift+A** to wrap them in auto-layout.
   Name that frame **`Actions`**, set it vertical.
7. **Bind its spacing.** With `Actions` selected, hover the **gap** field in
   the right panel, click the small variable icon, and pick **space-md**.
   Do the same for padding with **space-lg**.

   > Typing 16 by hand looks the same and binds nothing. The binding is the
   > whole point.

8. **Fill the modal.** Ctrl-drag one Button into `modal/Confirm` and label it
   "Delete".
9. **Add a Prompt** to `page/Login`: Ctrl-drag one Prompt variant out, set
   **scope** to `page`, **kind** to `page`, and type into **rule**:

   ```
   Login uses Google SSO only. No email or password form.
   ```

10. **Make it float.** With the Prompt selected, set **Position: Absolute** in
    the right panel, so it sits over the screen instead of joining the
    auto-layout row.
11. **Optional but valuable:** switch to **prototype mode** (the tab at the
    top of the right sidebar) and drag a connection from the "Delete" button
    in `modal/Confirm` back to `page/Login`. This is the navigation test and
    nobody has proven it comes back over the API yet.

**Send me:** a screenshot of the layers panel showing both frames and what is
inside them.

---

## Part 5 — the theme switch (2 min)

This is the payoff for the whole day's theming work.

1. Select the **`page/Login`** frame.
2. In the right panel, find the **variable modes** control. On a frame it
   appears near the top of the Appearance section, listing the `cia`
   collection with its current mode.
3. Change it from `sketchbook Light` to **`terminal Dark`**.
4. The whole screen should re-theme: colours, radii, spacing. Nothing is
   rebuilt and nothing is relinked.
5. Try **`glass Light`** and **`press Dark`** too.

**Send me:** two screenshots of the same screen in two different themes.

---

## Part 6 — the read-back

1. Select the **`page/Login`** frame, right-click → **Copy link to
   selection**.
2. Paste that link here and I will read the file directly.

---

## What to send back

1. Part 1: the Variables panel with ten mode columns.
2. Part 2: the build result panel.
3. Part 4: the layers panel with both frames.
4. Part 5: the same screen in two themes.
5. Part 6: the frame link.
6. Any error text, word for word, and which part and step it happened on.

## If something goes wrong

- **A step fails:** tell me the part and step number and the exact message.
  I can read your Figma file directly now, so I can usually see the problem
  without a screenshot.
- **The build seems stuck:** 99 specs is a lot. Give it a few minutes before
  deciding it has hung.
- **The plugin looks stale:** close and reopen it. If a panel is missing,
  re-import from the manifest.
