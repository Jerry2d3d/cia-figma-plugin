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
    title: 'All 99 components build',
    level: 'working',
    detail:
      '282 components and 4610 live bindings across the whole library, 42 of them with real variants. Up from one component with variants two days ago.',
  },
  {
    title: 'Components build their inner parts',
    level: 'working',
    detail:
      'A component arrives as a nested tree of named frames rather than one styled box, so the styling of its label, icon and rows lands on the right element. Twenty-two of the twenty-five that used to arrive empty now build; three still cannot be scanned.',
  },
  {
    title: 'Typography builds at the right size',
    level: 'working',
    detail:
      'Headings come out at six sizes rather than six identical ones. The sizes, weights, line heights and letter spacing are correct, and 69 of them are hardcoded rather than bound, because the design system exports no Variable for them yet.',
  },
  {
    title: 'Props and flags on instances',
    level: 'working',
    detail:
      'Text props become editable fields and boolean props become flags, so a PM sets them on an instance and the read-back reports them.',
  },
  {
    title: 'Prompt component',
    level: 'working',
    detail:
      'Eight variants across scope and kind, so a PM writes a rule next to the part of the design it governs.',
  },
  {
    title: 'Layout reads back as token names',
    level: 'working',
    detail:
      'The plugin saves a variable map into the file, so a bound gap reports as space-md rather than an opaque id. No Enterprise plan needed.',
  },
  {
    title: 'Five themes, one library',
    level: 'working',
    detail:
      'Every component binds once to a single collection. Switching a frame to another theme re-themes it instantly, with no rebuild, and two themes can sit side by side.',
  },
  {
    title: 'The screen read-back',
    level: 'working',
    detail:
      'Proven on a real screen. Six bindings resolved to six token names with none left over, and both sides read the same document identically.',
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
    slug: 'theming',
    round: 'Round 4',
    title: 'One library, five themes',
    date: '2026-09-27',
    level: 'working',
    body: [
      'A component binds to a variable inside a specific collection, so a library built against a collection named after one theme can never follow another. Every component would have to be rebuilt per theme. Figma allows ten modes per collection, which is exactly five themes with light and dark each, so the theme became a mode instead and the collection became theme-neutral.',
      'That reframing turned a rebuild into a dropdown. It also had to land before importing the full library, because 202 components bound to the wrong collection name would have meant importing them twice.',
      'Along the way a question about how to represent a missing token turned out to be the wrong question. Of eight tokens that looked absent, four were a real bug in the design system, where one theme emitted its page colours outside any selector so they applied to nothing in any browser, and four were never missing at all: they follow a documented default, and now do so through a real alias rather than a copied number.',
    ],
    facts: [
      { label: 'Themes live at once', value: '5, with light and dark' },
      { label: 'Variables', value: '133, sharing one collection' },
      { label: 'Rebuilds to switch theme', value: 'none' },
      { label: 'Bugs found upstream', value: '3, all fixed at source' },
    ],
  },
  {
    slug: 'loop-closed',
    round: 'Round 3',
    title: 'The loop closed',
    date: '2026-09-27',
    level: 'working',
    body: [
      'A person wrapped a frame in auto-layout and bound its spacing to tokens. The screen read back with every binding resolved to a token name: the gap as space-md, all four padding sides as space-lg, the background as paper. Six bindings, six names, nothing unresolved.',
      'That is the difference the whole project turns on. A screen that reports a gap of 16 pixels tells an AI almost nothing. A screen that reports a gap of space-md tells it exactly which token to write.',
      'Both halves read the same file independently and described it identically, down to the variable ids. The read also found three bugs in the reader that only a real file could surface: paint bindings were being ignored, a note sitting on the canvas was described as being inside a frame that did not exist, and frames were tracked by name so two called Card would have merged.',
    ],
    facts: [
      { label: 'Bindings resolved', value: '6 of 6' },
      { label: 'Unresolved', value: 'none' },
      { label: 'Instances read', value: '3, with distinct variants and real labels' },
      { label: 'Bugs found', value: '3, all fixed' },
    ],
  },
  {
    slug: 'round-3',
    round: 'Next',
    title: 'A second screen',
    date: 'next',
    level: 'pending',
    body: [
      'One screen with one frame is proven. The next genuinely new thing is a screen with several frames, so component references and Prompt attachment can be checked when there is more than one place for them to go.',
    ],
    facts: [
      { label: 'Needs', value: 'a screen with two or more frames' },
      { label: 'Watching for', value: 'whether each frame gets its own components and prompts' },
    ],
  },
  {
    slug: 'library-unblocked',
    round: 'Both sides',
    title: 'The whole library builds',
    date: '2026-09-26',
    level: 'working',
    body: [
      'Only Button could build with variants, because its style class names happened to match its prop values. Every other component named them differently, so the spec producer labelled them parts and they built flat. That fix landed, covering four naming shapes, and the result across all 99 specs went from 35 components to 202 and from 243 bindings to 1072.',
      'Running the whole library at once found three problems a single component never would. Seven specs were rejected because a border width declared on its own carries no style, and the validator demanded one. Flex multiplied out to 600 variant combinations across four independent axes, which would have made an unusable component set. And several compound mixins were being reported as unsupported when nothing was missing at all.',
      'Two findings also turned out to be wrong, both mine. The border width was never absent from the contract: the fixture being tested against was nine days stale. And a missing spacing token belonged to the design system rather than the exporter.',
    ],
    facts: [
      { label: 'Specs building', value: '99 of 99, none rejected' },
      { label: 'Components', value: '202, from 35' },
      { label: 'Bindings', value: '1072, from 243' },
      { label: 'Remaining gaps', value: '121, all genuine and all upstream' },
    ],
  },
  {
    slug: 'variable-map',
    round: 'Both sides',
    title: 'Layout can name its own tokens',
    date: '2026-09-26',
    level: 'working',
    body: [
      'Figma only reports a variable id for a bound field over its API, and resolving ids to names needs an Enterprise plan. So a gap bound to a spacing token read back as an opaque id, which is useless to anything trying to rebuild the layout.',
      'The plugin is the one place that knows both, because it holds the live document. It now saves that map into the file on every token sync. It covers every local variable rather than only the ones it created, so a variable added by hand resolves too, and anything it has never heard of comes back with its id rather than a pixel value dressed up as a token name.',
    ],
    facts: [
      { label: 'Written', value: 'into the file itself, on every sync' },
      { label: 'Plan needed', value: 'none, works on Starter' },
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
      'One real bug surfaced on the way. The Prompt build failed because a text layer was given its width mode before it was added to its frame, so it had no auto-layout parent yet. Only real Figma could have caught it: the test double allowed something the real API refuses. It now throws the same error, so the mistake cannot return unnoticed.',
    ],
    facts: [
      { label: 'Prompt', value: '8 variants, rule and target per instance' },
      { label: 'Lesson', value: 'a fake is only as good as the rules it is taught' },
    ],
  },
  {
    slug: 'round-1',
    round: 'Round 1',
    title: 'First run inside Figma',
    date: '2026-09-25',
    level: 'working',
    body: [
      'The first time either half executed inside Figma. Tokens synced and Button built as a 12-variant component set, with no errors.',
      'The large button hugged at 89 by 41, which is the text plus 24 pixels of padding each side and 12 top and bottom. That proved the spacing was live variable bindings rather than baked numbers.',
      'Every gap reported was already predicted, and the skipped count came back at exactly the expected 18, which meant the builder\u2019s model of the spec matched reality.',
    ],
    facts: [
      { label: 'Variables', value: '128 created, Light and Dark' },
      { label: 'Variants', value: '12' },
      { label: 'Gaps', value: '9, all known and upstream' },
    ],
  },
  {
    slug: 'phases-0-2',
    round: 'Phases 0 to 2',
    title: 'The plugin from scratch',
    date: '2026-09-11 to 09-17',
    level: 'working',
    body: [
      'The old forked plugin was set aside for a minimal one owned outright, with its own manifest, build and tests.',
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
    owner: 'A person, in Figma',
    title: 'Compose one screen and send its link',
    detail:
      'Everything on both sides is built and idle until a real composed screen exists. A frame with three Button instances and two Prompts is enough. This is the only thing blocking the first end-to-end proof.',
  },
  {
    owner: 'A decision, not a task',
    title: 'Decide whether layout primitives belong in the library',
    detail:
      'Flex declares four independent axes, which multiply out to 600 combinations. Nobody picks "Flex that is row, space-between, stretch, gap-md" from a list of 600: those are props a developer sets, not variants a designer picks. Grid and Stack are the same shape of thing. Container was the genuine edge case, since its five widths are a deliberate design choice, and it now builds: the exporter records plain widths and heights, so 640px through 1280px arrive as real Figma bounds.',
  },
  {
    owner: 'A person, in Figma',
    title: 'Import the whole library',
    detail:
      'Sync the themed collection, then build all 99 component specs against it in one pass. Verified from the plugin side: every spec builds, producing 233 components and 3686 live bindings, with nothing rejected. 160 build gaps remain, none a builder fault, plus 58 the spec itself reports about the source. The panel shows them apart, because they are fixed in different repos.',
  },
  {
    owner: 'Both',
    title: 'Prove navigation across several frames',
    detail:
      'Mark each frame as a page, a modal or a drawer, draw prototype connections between them, and read the file back. Two things to learn: whether the connections come back over the API, and whether components and rules attach to the right frame when there is more than one place for them to go.',
  },
  {
    owner: 'css-is-awesome',
    title: 'Promote thirteen typography tokens',
    detail:
      'Thirteen missing tokens account for 482 call sites across the library, and two of them, the small and extra-small font sizes, are 311 of that alone. Both halves measured this independently and agree. It is the single change that would most improve how components look in Figma.',
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
  tokens: 'K:\\repo\\figma-import-export\\output\\variables\\cia.variables.json',
  spec: 'K:\\repo\\figma-import-export\\output\\components',
  state: 'K:\\repo\\cia-figma-plugin\\STATE.md',
  env: 'K:\\repo\\figma-import-export\\.env.local',
  envLine: 'FIGMA_ACCESS_TOKEN=figd_paste_the_token_here',
  build: 'yarn build',
  test: 'yarn test',
  rule1: 'Login uses Google SSO only. No email or password form.',
  rule2: 'Put the passkey button behind the PASSKEYS feature flag.',
  readRequest: 'Run figma_map_screen on this URL and show me the full result:',
};
