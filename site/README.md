# The pipeline site

A small Next.js app that documents the two halves of the Figma pipeline and
carries the internal build log and test runbook.

It is built with the same design system it documents: **css-is-awesome** for
tokens and the SCSS API, and **BoilerPlate v2**'s own React components. Nothing
here re-implements a button.

## Run it

```
npm install
npm run dev      # http://localhost:3210
npm run build    # production build, all routes prerender static
npm run start    # serve the production build, also on 3210
```

Port **3210**, deliberately not 3000: boiler-project-ai and most other Next
apps here take that one, and having two of them fight over it is a bad way to
spend a morning. Override per run with `npm run dev -- -p 4000`.

## Routes

| Route | Audience | What it is |
|---|---|---|
| `/` | public | What the pipeline is, the loop, current status |
| `/how-it-works` | public | The two runtimes, the contract, the rules |
| `/plugins` | public | What each plugin does, and the Prompt component |
| `/docs` | internal | The current test runbook, with copy buttons |
| `/log` | internal | Every real Figma run, newest first, plus what's next |

Internal routes are linked separately in the nav (dashed outline) so they can be
dropped in one edit before a public launch.

## Editing content

Status, log entries, next steps and every copyable path live in
`src/content/pipeline.ts`. A status change is one edit there, not a hunt through
five pages.

## How it consumes the other repos

- `css-is-awesome` is a normal npm dependency. The prebuilt CSS and the
  `boilerplate` theme are imported in `src/app/layout.tsx`; the SCSS API is used
  by every stylesheet here.
- `@boilerai/react` ships TypeScript and SCSS Module *source*, not a build, and
  its exports map points at `.ts` files that the bundler will not resolve through
  a symlink. So components are aliased to that source as `@bp/*` in
  `next.config.js` and `tsconfig.json`, and compiled with this app.
- `sassOptions.loadPaths` must include cia's own `scss` directory, because
  `api.scss` uses a relative `@use './system'` the bundler cannot resolve alone.
  `src/styles` must stay *off* that list, or a local partial would shadow a cia
  module of the same name.

## Deploying later

Every route prerenders static, so this can move to GitHub Pages, Hostinger or
any static host. The only change needed is `output: 'export'` in
`next.config.js`.
