# Figma test steps — round 2 (2026-09-26)

Everything Jerry needs to do at a keyboard, in order. Round 1 (tokens +
Button) passed on 2026-09-25; this round re-tests Button with its new
properties and tests the new Prompt component.

Roughly 15 minutes. Nothing here can damage anything: it only adds to a
Figma file.

---

## Part 0 — reload the plugin (2 min)

The plugin gained a whole new panel since last time, so Figma must pick up
the rebuilt code.

1. Open the **Figma desktop app** and the file you used last time (the one
   with the `boilerplate` collection and the Button component set). If you
   would rather start clean, make a new file and do Part 1 first.
2. If the cia plugin is open, close it.
3. Menu → **Plugins → Development → cia (dev)**.
   - If it still shows only Tokens and Components and no **Prompt** section,
     the old build is cached: remove it under **Plugins → Development →
     Manage plugins in development**, then re-import from
     `K:\repo\cia-figma-plugin\packages\cia-plugin\manifest.json`.
4. You should now see four sections: a **cia** heading, **Tokens**,
   **Components**, and **Prompt**.

> The built files are already up to date. Nothing needs rebuilding on your
> side.

---

## Part 1 — tokens (skip if your file already has the collection)

1. In **Tokens**, click **Choose File** and pick:

   ```
   K:\repo\figma-import-export\output\boilerplate.variables.json
   ```

2. Expect: **Collection boilerplate: 128 created, 0 updated, 1 mode(s)
   added.** and no gap list.

---

## Part 2 — the one unanswered question from last time (2 min)

Last round, the `secondary` button looked near-white with blue text. The
code says it should be **red with white text**. This settles it.

1. On the canvas, find the Button component set and click the variant
   named **`variant=secondary, size=large`**.
2. Look at the right sidebar, at the **Fill** row.
3. Read what is written next to the colour chip. Two possible outcomes:
   - It says **`action-secondary-default`** → the binding is correct and the
     screenshot was just hard to read. Nothing to fix.
   - It shows a plain hex value such as `FFFFFF`, or the row is empty → the
     variant styling is not being applied in Figma, which is a real bug I
     need to fix.
4. **Send me:** a screenshot of that right sidebar, zoomed enough that the
   Fill and Stroke rows are readable.

---

## Part 3 — rebuild Button, check the new properties (4 min)

Button now exposes a text field and an on/off flag that a PM can set, and
that the AI will read back.

1. In **Components**, confirm the **Collection** dropdown says
   `boilerplate`.
2. Click **Choose File** next to **Spec** and pick:

   ```
   K:\repo\cia-figma-plugin\packages\cia-plugin\src\__fixtures__\Button.component-spec.json
   ```

3. Click **Build Button.component-spec.json**.
4. Expect in the panel:
   - `Built Button (12 variants) with 243 bindings to boilerplate.`
     (243, up from 235 last time — the font-weight mapping was fixed.)
   - A new line: **`Properties: label: TEXT, disabled: BOOLEAN.`**
   - **9 gaps**, the same known upstream ones as last time.
5. A second Button component set appears. That is expected, since building
   twice makes two. Delete the older one if you like.
6. Now drag one variant out to create an **instance** (or copy-paste a
   variant and detach nothing — an instance is what a PM would place).
   With the instance selected, the right sidebar should show:
   - the `variant` and `size` dropdowns, as before, **plus**
   - a **label** text box you can type into, and
   - a **disabled** on/off toggle.
7. Type something into **label**, for example `Sign in`. The button text
   should change.
8. **Send me:** a screenshot of that instance's right sidebar showing label
   and disabled.

> The `disabled` toggle will not change how it looks. That is expected and
> documented: it carries intent for the AI until the disabled styling is
> built.

---

## Part 4 — the Prompt component (5 min)

This is the new channel for PMO rules inside the design.

1. In the **Prompt** section, click **Add Prompt component**.
2. Expect: `Added Prompt with 8 variants and properties rule: TEXT,
   target: TEXT.`
3. A pale yellow note-like component set appears with 8 variants, captioned
   things like `PROMPT · PAGE · TOOLING`.
4. Drag one out as an instance. In the right sidebar you should see:
   - **scope** dropdown: app, page, section, component
   - **kind** dropdown: page, tooling
   - **rule** text box
   - **target** text box
5. Try a realistic one. Set scope to `component`, kind to `page`, and type
   into **rule**:

   ```
   Login uses Google SSO only. No email/password form.
   ```

   Then put `target` as `Button` (the layer it is about).
6. **Send me:** a screenshot of the Prompt instance with those fields
   filled in.

---

## Part 5 — a tiny realistic screen (optional but very useful, 5 min)

This is what the AI will eventually read, so having one in the file gives
the other repo something real to test against.

1. Press **F** to draw a Frame, roughly 800 × 600. Name it `Login`.
2. Drop 2 or 3 Button instances inside it. Give them different variants and
   labels.
3. Drop the Prompt instance from Part 4 inside the same frame.
4. Rename the layer holding your Prompt instances to `_prompts`, so mockup
   exports can strip them later.
5. **Send me:** a screenshot of the layers panel showing the frame and what
   is inside it.

---

## What to send back

1. Part 2: the Fill row on `variant=secondary, size=large`. **This is the
   important one.**
2. Part 3: an instance showing `label` and `disabled`.
3. Part 4: a filled-in Prompt instance.
4. Part 5: the layers panel, if you did it.
5. Any error text, copied word for word, and which step number it happened
   on.

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
