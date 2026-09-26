# Figma steps — round 3: the full loop (2026-09-26)

Rounds 1 and 2 passed. Tokens sync, Button builds with variants and
properties, the Prompt component works.

Round 3 is the first time the **whole idea** runs: compose a screen in
Figma, then have the other repo read it back as structured facts. Nothing
here can damage anything.

About 25 minutes, in four parts. Part A is the important one and takes a
minute.

---

## The plugin panel, control by control

```
cia                                  <- panel title

Tokens                               <- SECTION 1
  [ Choose File ]  No file chosen    <- BUTTON A  (token file)

Components                           <- SECTION 2
  Collection  [ boilerplate  v ]     <- DROPDOWN
  Spec
  [ Choose File ]  No file chosen    <- BUTTON B  (component spec file)
  [ Build ]                          <- BUTTON C  (greyed until A/B done)

Prompt                               <- SECTION 3
  [ Add Prompt component ]           <- BUTTON D
```

Button A takes `*.variables.json`. Button B takes `*.component-spec.json`.
Feeding a spec to Button A gives `unsupported specVersion 2 (expected
"1.0.0")` — that is the wrong door, not a bug.

---

## Part A — relay one message (1 min, do this first)

Open the **figma-import-export** Claude session and paste the block from the
bottom of `K:\repo\cia-figma-plugin\STATE.md`, under *"Message to paste into
the figma-import-export session"*.

It asks for the variant-classification fix. Without it, 34 of the 35
components build flat with no variants, so this unblocks the most work of
anything on the list. That session can work on it while you do the rest.

---

## Part B — refresh the Prompt component (3 min)

The `target` field's default changed, so the Prompt set needs rebuilding.

1. In Figma, delete the existing **Prompt** component set and any Prompt
   instances you made during round 2.
2. Close the cia plugin, then reopen it: **Plugins → Development → cia
   (dev)**. This picks up the rebuilt code.
3. Click **Button D**, *Add Prompt component*.
4. Expect: `Added Prompt with 8 variants and properties rule: TEXT,
   target: TEXT.`
5. Check one instance: Ctrl-drag a variant out. In the right sidebar,
   **target** should now be **empty**, not pre-filled. That matters, because
   the reader treats any text in `target` as a real layer name.

---

## Part C — compose a small screen (8 min)

This is the artefact the read side needs. Keep it small and realistic.

1. Press **F** and draw a frame about **800 × 600**. Name it **`Login`** in
   the layers panel.
2. Put **three Button instances** inside it. Ctrl-drag them out of the
   Button component set, then drag them into the `Login` frame.
3. Give each one different settings in the right sidebar:
   - Button 1: variant `primary`, size `large`, label `Sign in with Google`
   - Button 2: variant `outline`, size `medium`, label `Use a passkey`
   - Button 3: variant `ghost`, size `small`, label `Need help?`, and turn
     the **disabled** toggle **on**
4. Select the three buttons and press **Shift+A** to wrap them in an
   auto-layout frame. Name that frame **`Actions`**. In the right sidebar
   set its direction to vertical and give it some spacing.
5. Add **two Prompt instances** and drag them into the `Login` frame:
   - Prompt 1: scope `page`, kind `page`, rule
     `Login uses Google SSO only. No email or password form.`
     Leave **target** empty.
   - Prompt 2: scope `component`, kind `tooling`, rule
     `Put the passkey button behind the PASSKEYS feature flag.`
     Set **target** to `Use a passkey`.
6. In the layers panel, select both Prompt instances, right-click →
   **Frame selection**, and rename that new frame exactly **`_prompts`**.
   The reader skips that frame's own name, so Prompts do not pollute the
   layout facts, and mockup exports can strip it later.

---

## Part D — read the screen back (10 min)

This is the payoff: Figma in, structured facts out.

1. **One-time token setup**, if not already done. In Figma:
   **Settings → Security → Personal access tokens → Generate new token.**
   Name it `figma-import-export`, scope **File content → Read-only**. Copy
   it immediately, Figma shows it once.
2. Put it in `K:\repo\figma-import-export\.env.local` as:

   ```
   FIGMA_ACCESS_TOKEN=figd_paste_the_token_here
   ```

   Copy `.env.example` to `.env.local` first if that file does not exist.
   Then restart the figma-import-export Claude session, since the file is
   read once at startup.
3. In Figma, select the **`Login` frame** in the layers panel, right-click →
   **Copy link to selection**. The link must point at the frame, not the
   page.
4. In the figma-import-export session, paste this, with your link:

   ```
   Run figma_map_screen on this URL and show me the full result:
   <paste the Copy link to selection URL here>
   ```

5. **What a good result looks like:**
   - `componentReferences` lists `Button`.
   - `instances` has three entries, each with `variantProps` like
     `{ variant: "primary", size: "large" }`, the `label` text, and
     `booleanProps` showing `disabled: true` on the third.
   - `frames` includes `Actions` with a vertical direction and its spacing
     reported as a **token name** such as `space-md`, not a pixel number.
   - `prompts` has both rules, with the right `scope` and `kind`, and
     `target: "Use a passkey"` on the second and `null` on the first.
   - `gaps` should be short or empty. Anything in it is information, not
     failure.

6. **Send me the full result**, or a screenshot of it. Especially:
   - anything in `gaps`
   - whether `frames` reports token names or raw pixel numbers
   - whether `target` on Prompt 1 is `null`

---

## What to send back

1. Part B: the Prompt instance sidebar showing an empty `target`.
2. Part C: the layers panel showing `Login`, `Actions` and `_prompts`.
3. Part D: the whole `figma_map_screen` result.
4. Any error text, word for word, with the part and step number.

---

## A file-sync warning

`STATE.md` has twice been overwritten with an older copy, losing newer
sections. Likely an editor holding a stale buffer, or OneDrive. The good
copy is always in git:

```
git -C K:\repo\cia-figma-plugin checkout -- STATE.md
```

If you have it open in an editor, close it without saving.
