/**
 * Builds every shipped component spec against the real cia variable list, in
 * memory, and checks the things that should be true of the library as a whole.
 *
 * This exists because of a failure class neither side's own test suite can see.
 * Every number either repo publishes is a count of things *present*, so a thing
 * that never arrived is invisible: a selector that vanished from an export was
 * not mis-reported, it was absent, and absence cannot show up in a total. Three
 * separate bugs were caught upstream by comparing against a count taken from
 * outside the pipeline being measured. This is the same pattern one level up:
 * the builder counting the exporter's output, rather than either counting itself.
 *
 * It has earned its place. Run as a throwaway it found 251 bindings applied to
 * the wrong node, and three stale spec files duplicated across bucket folders
 * that would have built three extra component sets in a real Figma test.
 *
 * Skipped rather than failed when the spec folder is not there, because the two
 * repos are deliberately separate and a checkout of this one alone must still
 * pass its tests. Totals are printed, not asserted: they move legitimately with
 * every upstream change, and a test that has to be edited on every real
 * improvement gets edited without being read.
 */
import fs from 'fs';
import path from 'path';
import { BuildApi, buildComponent } from '@/plugin/buildComponent';
import { ComponentSpec, validateComponentSpec } from '@/shared/componentSpec';
// The site publishes these to a person about to run the build by hand.
import { MEASURED, MEASURED_TOKENS } from '../../../../site/src/content/measured';

/** Where figma-import-export writes its bucketed specs and its token export. */
const SPEC_ROOT = process.env.CIA_SPEC_ROOT ?? 'K:/repo/figma-import-export/output/components';
const TOKENS =
  process.env.CIA_TOKENS ?? 'K:/repo/figma-import-export/output/variables/cia.variables.json';

/** The folders this export is the authority for, one bucket per readiness. */
const BUCKETS = ['ready', 'partial', 'blocked'];

const available = fs.existsSync(SPEC_ROOT) && fs.existsSync(TOKENS);
const describeLibrary = available ? describe : describe.skip;

class FakeVariable {
  constructor(
    public name: string,
    public variableCollectionId: string,
    public resolvedType: VariableResolvedDataType,
  ) {}

  get id() {
    return this.name;
  }
}

class FakeText {
  name = '';

  fontName: FontName = { family: '', style: '' };

  characters = '';

  fontSize = 12;

  lineHeight: unknown = { unit: 'AUTO' };

  letterSpacing: unknown = { value: 0, unit: 'PERCENT' };

  textCase = 'ORIGINAL';

  fills: SolidPaint[] = [];

  bound: Record<string, string> = {};

  componentPropertyReferences: Record<string, string> | null = null;

  setBoundVariable(field: string, variable: Variable) {
    this.bound[field] = variable.id;
  }
}

class FakeProperties {
  private counter = 0;

  addComponentProperty(name: string) {
    this.counter += 1;
    return `${name}#${this.counter}:0`;
  }
}

class FakeComponent extends FakeProperties {
  name = '';

  itemSpacing = 0;

  paddingTop = 0;

  paddingLeft = 0;

  fills: SolidPaint[] = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];

  strokes: SolidPaint[] = [];

  strokeWeight = 0;

  strokeAlign = '';

  layoutMode = 'NONE';

  primaryAxisSizingMode = '';

  counterAxisSizingMode = '';

  primaryAxisAlignItems = '';

  counterAxisAlignItems = '';

  width = 100;

  height = 100;

  minWidth: number | null = null;

  maxWidth: number | null = null;

  minHeight: number | null = null;

  maxHeight: number | null = null;

  children: (FakeText | FakeComponent)[] = [];

  bound: Record<string, string> = {};

  resize(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  appendChild(child: FakeText | FakeComponent) {
    this.children.push(child);
  }

  setBoundVariable(field: string, variable: Variable) {
    this.bound[field] = variable.id;
  }
}

class FakeComponentSet extends FakeProperties {
  name = '';

  constructor(public children: FakeComponent[]) {
    super();
  }
}

/** A child of the element tree. Same styled surface as a component. */
class FakeFrame extends FakeComponent {}

function specFiles(): { file: string; bucket: string }[] {
  const found: { file: string; bucket: string }[] = [];
  const walk = (dir: string, bucket: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, BUCKETS.includes(entry.name) ? entry.name : bucket);
      } else if (entry.name.endsWith('.json')) {
        found.push({ file: full, bucket });
      }
    }
  };
  walk(SPEC_ROOT, 'root');
  return found.sort((a, b) => a.file.localeCompare(b.file));
}

function realVariables(): FakeVariable[] {
  const payload = JSON.parse(fs.readFileSync(TOKENS, 'utf8'));
  return payload.variables.map(
    (variable: { name: string; type: string }) =>
      new FakeVariable(variable.name, 'cia-id', variable.type as VariableResolvedDataType),
  );
}

function createApi(variables: FakeVariable[]) {
  const components: FakeComponent[] = [];
  const api = {
    createComponent: () => {
      const component = new FakeComponent();
      components.push(component);
      return component as unknown as ComponentNode;
    },
    createText: () => new FakeText() as unknown as TextNode,
    createFrame: () => new FakeFrame() as unknown as FrameNode,
    combineAsVariants: (nodes: ComponentNode[]) =>
      new FakeComponentSet(nodes as unknown as FakeComponent[]) as unknown as ComponentSetNode,
    loadFontAsync: async () => undefined,
    setBoundVariableForPaint: (paint: SolidPaint) => paint,
    getLocalVariableCollectionsAsync: async () => [{ id: 'cia-id', name: 'cia' }],
    getLocalVariablesAsync: async () => variables as unknown as Variable[],
    currentPage: {},
  } as unknown as BuildApi;
  return { api, components };
}

describeLibrary('the token file the runbook points at', () => {
  it('still contains what the runbook tells a tester to expect', () => {
    // The first step of the test run. A wrong number here is the one that makes
    // somebody think the whole pipeline is broken before reaching anything else,
    // and the runbook had claimed 133 variables, 9 modes and no gaps against a
    // file holding 131, 4 and 57.
    const payload = JSON.parse(fs.readFileSync(TOKENS, 'utf8'));
    expect({
      variables: payload.variables.length,
      modes: payload.modes.length,
      themes: new Set((payload.modes as string[]).map((mode) => mode.split(' ')[0])).size,
      gaps: (payload.gaps ?? []).length,
    }).toEqual(MEASURED_TOKENS);
  });
});

describeLibrary('the whole shipped library', () => {
  it('has exactly one spec per component, so a folder-wide import builds nothing twice', () => {
    const byName = new Map<string, string[]>();
    specFiles().forEach(({ file, bucket }) => {
      const name = path.basename(file);
      byName.set(name, [...(byName.get(name) ?? []), bucket]);
    });

    const duplicated = [...byName.entries()].filter(([, buckets]) => buckets.length > 1);
    // This caught three real stale files sitting in `blocked` alongside their
    // newer copies. Selecting the folder in the panel would have built them.
    expect(
      duplicated.map(([name, buckets]) => `${name} in ${buckets.join(' and ')}`),
    ).toEqual([]);
  });

  it('builds every spec, and prints what a real Figma run should report', async () => {
    const variables = realVariables();
    const files = specFiles();
    expect(files.length).toBeGreaterThan(0);

    const totals = { variants: 0, bindings: 0, gaps: 0, skips: 0, unthemeable: 0, empty: 0 };
    const shapes = new Map<string, number>();
    const invalid: string[] = [];
    const builtFromWrongElement: string[] = [];
    let relayed = 0;

    const clean: Record<string, { n: number; zero: number }> = {};

    for (const { file, bucket } of files) {
      const check = validateComponentSpec(JSON.parse(fs.readFileSync(file, 'utf8')));
      if (!check.valid) {
        invalid.push(`${path.basename(file)}: ${check.errors.join('; ')}`);
        continue;
      }
      const spec = check.spec as ComponentSpec;
      const { api } = createApi(variables);
      // eslint-disable-next-line no-await-in-loop
      const { result } = await buildComponent(spec, { collectionName: 'cia' }, api);

      totals.variants += result.variantNames.length;
      totals.bindings += result.bindings;
      totals.gaps += result.gaps.length;
      totals.skips += result.skipped.length;
      totals.unthemeable += result.skipped.filter((skip) =>
        skip.reason.includes('cannot follow a theme'),
      ).length;
      if (result.bindings === 0 && result.unbuiltPartCalls > 0) {
        totals.empty += 1;
      }
      relayed += result.gaps.filter((gap) => gap.origin === 'spec').length;
      result.gaps.forEach((gap) => {
        // Collapse ids and numbers so the same shape of gap groups together.
        const key = gap.reason.replace(/"[^"]*"/g, '"…"').replace(/\d+/g, 'N').slice(0, 72);
        shapes.set(key, (shapes.get(key) ?? 0) + 1);
      });
      // Walk up from the styled element: the root it was built from must be on
      // that path, or the build describes a different element entirely.
      const tree = spec.tree ?? null;
      const base = spec.styleBlocks.filter((block) => block.kind === "base").map((block) => block.selector);
      if (tree && result.builtFrom && base.some((selector) => tree.some((node) => node.selector === selector))) {
        const bySelector = new Map(tree.map((node) => [node.selector, node]));
        const seen = new Set<string>();
        const queue = base.filter((selector) => bySelector.has(selector));
        let contains = false;
        while (queue.length > 0 && !contains) {
          const current = queue.shift() as string;
          if (seen.has(current)) continue;
          seen.add(current);
          if (current === result.builtFrom) { contains = true; break; }
          const node = bySelector.get(current);
          const positions = node?.parents ?? [node?.parent ?? null];
          positions.forEach((position) => {
            if (position && bySelector.has(position)) queue.push(position);
          });
        }
        if (!contains) {
          builtFromWrongElement.push(`${spec.component}: built from ${result.builtFrom}, which does not contain ${base.join(" or ")}`);
        }
      }

      clean[bucket] = clean[bucket] ?? { n: 0, zero: 0 };
      clean[bucket].n += 1;
      if (result.gaps.length === 0) {
        clean[bucket].zero += 1;
      }
    }

    // eslint-disable-next-line no-console
    console.log(
      [
        `${files.length} specs -> ${totals.variants} variants, ${totals.bindings} bindings`,
        `${totals.gaps} gaps, ${totals.skips} skips (${totals.unthemeable} applied but unthemeable)`,
        `${totals.empty} arrive empty, all their styling in children`,
        ...BUCKETS.filter((bucket) => clean[bucket]).map(
          (bucket) => `  ${bucket}: ${clean[bucket].zero} of ${clean[bucket].n} with zero gaps`,
        ),
        'most common gaps:',
        ...[...shapes.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([reason, count]) => `  ${String(count).padStart(3)}  ${reason}`),
      ].join('\n'),
    );

    // The runbook tells a tester to expect these, so a tester comparing the page
    // against the panel must not be the first to notice they diverged. A stale
    // page looks exactly like a broken build and is the likelier of the two.
    // Nothing here says the numbers are RIGHT, only that they are still true.
    expect({
      specs: files.length,
      variants: totals.variants,
      bindings: totals.bindings,
      buildGaps: totals.gaps - relayed,
      specGaps: relayed,
      arriveEmpty: totals.empty,
    }).toEqual(MEASURED);

    // A spec the validator rejects is the one hard failure: it means the two
    // repos disagree about the contract, which no amount of reporting fixes.
    expect(invalid).toEqual([]);

    // The component must be built from something that CONTAINS the element its
    // base style block names. This is the one choice here that can be wrong while
    // everything still looks right: Textarea was built from its toolbar, a
    // sibling, and produced a perfectly plausible component of the wrong thing.
    // Checking it over the whole set is how that class of mistake gets caught,
    // since no single output looks wrong.
    expect(builtFromWrongElement).toEqual([]);
  }, 60000);
});
