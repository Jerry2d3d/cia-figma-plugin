/**
 * One place for everything the site states as fact, so a status change is a
 * single edit rather than a hunt through five pages.
 */

export type StatusLevel = 'working' | 'blocked' | 'pending';

export interface StatusItem {
  title: string;
  level: StatusLevel;
  detail: string;
}

export const STATUS: StatusItem[] = [
  {
    title: 'Tokens into Figma',
    level: 'working',
    detail:
      '128 variables in one collection with Light and Dark modes. Colours, numbers and font stacks all land correctly.',
  },
  {
    title: 'Button component',
    level: 'working',
    detail:
      '12 variants and 243 live variable bindings, plus a label text field and a disabled flag on every instance.',
  },
  {
    title: 'Prompt component',
    level: 'working',
    detail:
      'Eight variants across scope and kind, so a PM writes a rule next to the part of the design it governs.',
  },
  {
    title: 'Screen read-back',
    level: 'working',
    detail:
      'Per-instance props, flags, text, auto-layout as token names, and Prompts. Built, not yet run against a real screen.',
  },
  {
    title: 'The other 34 components',
    level: 'blocked',
    detail:
      'Their variant styles arrive labelled as parts, so they build flat with no variants. The fix belongs in the spec producer.',
  },
  {
    title: 'Component read-back',
    level: 'pending',
    detail:
      'Serialising a Figma component back into a spec, so drift between design and code can be flagged.',
  },
];

export interface LogEntry {
  slug: string;
  round: string;
  title: string;
  date: string;
  level: StatusLevel;
  body: string[];
  facts: { label: string; value: string }[];
}

export const LOG: LogEntry[] = [
  {
    slug: 'round-3',
    round: 'Round 3',
    title: 'The full loop',
    date: 'next',
    level: 'pending',
    body: [
      'Compose a Login screen from Button and Prompt instances, then read it back with the screen mapper. The first time the whole idea runs end to end.',
    ],
    facts: [
      { label: 'Watching for', value: 'whether layout returns token names or raw pixels' },
      { label: 'Also', value: 'whether an untouched Prompt target reads as null' },
    ],
  },
  {
    slug: 'round-2',
    round: 'Round 2',
    title: 'Component properties and the Prompt',
    date: '2026-09-26',
    level: 'working',
    body: [
      'Button rebuilt with a label text field and a disabled flag, and the Prompt component built and worked.',
      'One real bug surfaced on the way. The Prompt build threw "node must be an auto-layout frame or a child of an auto-layout frame" because the text width mode was set before the text was added to its frame. The text nodes now carry an explicit width and the frame hugs them.',
      'Only real Figma could have caught that: the test double allowed something the real API refuses. It now throws the same error, so the mistake cannot return unnoticed.',
    ],
    facts: [
      { label: 'Bindings', value: '243, up from 235' },
      { label: 'Prompt', value: '8 variants, rule and target per instance' },
      { label: 'Fixed after', value: 'an empty default for target, so an untouched Prompt reports none' },
    ],
  },
  {
    slug: 'round-1',
    round: 'Round 1',
    title: 'First run inside Figma',
    date: '2026-09-25',
    level: 'working',
    body: [
      'The first time either repo executed inside Figma. Tokens synced and Button built as a 12-variant component set, with no errors.',
      'The large button hugged at 89 by 41, which is the text plus 24 pixels of padding each side and 12 top and bottom. That proved the spacing was live variable bindings rather than baked numbers.',
      'Every gap reported was already predicted, and the skipped count came back at exactly 18 as expected, which meant the builder\u2019s model of the spec matched reality.',
    ],
    facts: [
      { label: 'Variables', value: '128 created, Light and Dark' },
      { label: 'Variants', value: '12' },
      { label: 'Gaps', value: '9, all known and upstream' },
      { label: 'Found', value: 'the combined export drops space-2xs, still open' },
    ],
  },
  {
    slug: 'phases-0-2',
    round: 'Phases 0 to 2',
    title: 'The plugin from scratch',
    date: '2026-09-11 to 09-17',
    level: 'working',
    body: [
      'The old Tokens Studio fork was set aside for a minimal plugin owned outright, with its own manifest, build and tests.',
      'Phase 1 syncs the token contract into Figma Variables. Phase 2 builds components from a versioned spec, one component per variant combination, with everything that cannot be bound reported rather than approximated.',
    ],
    facts: [{ label: 'Proven', value: 'in unit tests first, in Figma from round 1' }],
  },
];

export interface NextStep {
  owner: string;
  title: string;
  detail: string;
}

export const NEXT_STEPS: NextStep[] = [
  {
    owner: 'figma-import-export',
    title: 'Classify variant styles for every component',
    detail:
      'Button builds 12 variants only because its style class names happen to match its prop values. Everywhere else the names are prefixed, the producer labels them parts, and the component builds flat. The producer already has both halves, so matching them belongs there.',
  },
  {
    owner: 'Both',
    title: 'Run the loop end to end',
    detail: 'Compose a screen, read it back, and confirm the facts are right. That is round 3.',
  },
  {
    owner: 'cia-figma-plugin',
    title: 'Scale to all 35 components',
    detail:
      'Once specs carry real variants, rebuild across the set and fix whatever that surfaces.',
  },
  {
    owner: 'Both',
    title: 'Child structure in the spec',
    detail:
      'A single frame with a label cannot express a data table, a modal or a multi-step form. That needs a spec version carrying children and slots, designed by both sides together.',
  },
  {
    owner: 'Both',
    title: 'Read a component back, and flag drift',
    detail:
      'Serialise a Figma component into the same spec shape, then diff it against the spec that built it.',
  },
];

export const PATHS = {
  manifest: 'K:\\repo\\cia-figma-plugin\\packages\\cia-plugin\\manifest.json',
  tokens: 'K:\\repo\\figma-import-export\\output\\boilerplate.variables.json',
  spec: 'K:\\repo\\cia-figma-plugin\\packages\\cia-plugin\\src\\__fixtures__\\Button.component-spec.json',
  state: 'K:\\repo\\cia-figma-plugin\\STATE.md',
  env: 'K:\\repo\\figma-import-export\\.env.local',
  envLine: 'FIGMA_ACCESS_TOKEN=figd_paste_the_token_here',
  build: 'node ..\\..\\.yarn\\releases\\yarn-1.18.0.cjs build',
  test: 'node ..\\..\\.yarn\\releases\\yarn-1.18.0.cjs test',
  rule1: 'Login uses Google SSO only. No email or password form.',
  rule2: 'Put the passkey button behind the PASSKEYS feature flag.',
  readRequest: 'Run figma_map_screen on this URL and show me the full result:',
};
