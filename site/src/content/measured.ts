/**
 * What a real build of the whole library actually produces.
 *
 * These are the numbers the runbook tells a tester to expect, so they are the
 * numbers a person compares against the plugin panel. When they and the panel
 * disagree, a tester cannot tell whether the build is wrong or the page is stale,
 * and a stale page is the more likely of the two while being the one that looks
 * like a bug.
 *
 * So they live here rather than inside prose, and the plugin's library dry run
 * asserts them against a real build of all 99 specs. Changing the builder or
 * pulling new specs fails that test until this file is updated, which is the
 * point: a published claim that nothing checks is exactly what cost the other
 * half of this project a border mixin for a fortnight. Nothing asserts these are
 * RIGHT, only that they are still TRUE.
 */
export interface MeasuredLibrary {
  /** Spec files in the export, which is also what Ctrl+A should select. */
  specs: number;
  /** Figma components produced, counting every variant of every set. */
  variants: number;
  /** Fields bound to a Variable, so they follow the theme. */
  bindings: number;
  /** Gaps this builder found, which are fixed in this repo. */
  buildGaps: number;
  /** Gaps the spec itself reports, which are fixed in the component or in cia. */
  specGaps: number;
  /** Components whose styling is all in children this version cannot build. */
  arriveEmpty: number;
}

/**
 * Measured against the BOILERPLATE token file, because these are BoilerPlate
 * components and boilerplate is the only one of the eight themes that declares
 * `space-2xs`, which 53 of them use. Measuring against a combined export that
 * excluded it showed 73 gaps that were the theme selection rather than a missing
 * token. A collection holding boilerplate and others can only do better, since it
 * carries the union, so these are the floor for a real run rather than a target.
 */
export const MEASURED: MeasuredLibrary = {
  specs: 99,
  variants: 282,
  bindings: 4935,
  buildGaps: 79,
  specGaps: 58,
  arriveEmpty: 3,
};

/**
 * The token file is deliberately NOT given expected totals, and the reason is a
 * mistake worth not repeating.
 *
 * `output/` in the other repo is local scratch, so the file sitting there is
 * whichever export somebody last ran. Reading it and publishing its totals looked
 * like measuring; it was sampling. The runbook had said 133 variables and 10
 * modes, which was correct for the five-theme export it was written against, and
 * lowering it to match a two-theme file on disk would have been pinning the
 * ground to the last footprint on it.
 *
 * So the runbook carries the COMMAND instead, and the test checks what is true of
 * any export rather than of one: a mode per theme and scheme, and every gap
 * carrying a reason. A tester who runs the command gets whatever that theme set
 * produces, and nothing here has to be right about a number nobody measured.
 */
export const TOKEN_EXPORT = {
  /** The themes Jerry chose. Up to five fit in one collection. */
  themes: ['sketchbook', 'boilerplate', 'terminal', 'glass', 'press'],
  tool: 'figma_export_tokens',
} as const;
