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
 * What the token file the runbook points at actually contains. This is the FIRST
 * thing a tester does, so a wrong number here is the one that makes them think
 * the whole thing is broken before they reach anything else.
 */
export interface MeasuredTokens {
  /** Variables in the combined export. */
  variables: number;
  /** Modes in it, which is two per theme. */
  modes: number;
  /** Themes it combines. Eight exist as separate files; this is how many are in. */
  themes: number;
  /** Values the export could not represent, all of them CSS keywords. */
  gaps: number;
}

export const MEASURED_TOKENS: MeasuredTokens = {
  variables: 131,
  modes: 4,
  themes: 2,
  gaps: 57,
};

export const MEASURED: MeasuredLibrary = {
  specs: 99,
  variants: 282,
  bindings: 4639,
  buildGaps: 152,
  specGaps: 58,
  arriveEmpty: 3,
};
