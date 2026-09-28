/**
 * Checks the test fixtures against two things they are supposed to stand for:
 * the Figma node fields this builder writes, and the tokens cia actually exports.
 *
 * Run once by hand this found six fields being written to a fake that had never
 * heard of them, so a typo could not have failed, and two tokens the fake claimed
 * that cia does not export, so two tests asserted a binding that can never
 * happen. Both are invisible in any output: the code was right in the first case
 * and the test was green in the second.
 *
 * It is a test rather than a script because the hole it looks for reopens every
 * time a field is added, and nothing about adding one prompts anyone to re-run a
 * script they have forgotten exists.
 *
 * THE CHECK ITSELF IS THE MOST LIKELY THING TO BE WRONG HERE. Upstream's
 * equivalent was broken on its first run three separate times, and every broken
 * version produced output that looked exactly like a finding. A pattern that
 * matches nothing reports a clean sweep, which is indistinguishable from success.
 * So every extraction below asserts it found a plausible number of things before
 * it asserts anything about them.
 */
import fs from 'fs';
import path from 'path';

// Every builder that writes Figma node fields, and every test that names them.
// A builder missing from this list is audited by nobody, which is the hole the
// audit exists to close, so adding a builder means adding it here.
const SOURCES = ['buildComponent.ts', 'buildText.ts', 'buildPrompt.ts'].map((file) => path.join(__dirname, file));
const TEST_FILES = ['buildComponent.test.ts', 'buildText.test.ts', 'buildPrompt.test.ts'].map((file) =>
  path.join(__dirname, file),
);
const TOKENS =
  process.env.CIA_TOKENS ?? 'K:/repo/figma-import-export/output/variables/cia.variables.json';

const source = SOURCES.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
const tests = TEST_FILES.map((file) => fs.readFileSync(file, 'utf8')).join('\n');

/**
 * Fields the builder assigns on a component, a frame or a text node, plus the
 * ones it reaches through a lookup table, which a plain property-access pattern
 * cannot see. Both forms are real and missing either half is how this kind of
 * check quietly passes.
 */
function fieldsWritten(): string[] {
  const found = new Set<string>();
  for (const match of source.matchAll(/\b(?:component|frame|text)\.([A-Za-z][A-Za-z0-9]*)\s*=/g)) {
    found.add(match[1]);
  }
  for (const match of source.matchAll(
    /'(stroke(?:Top|Right|Bottom|Left)Weight|layoutSizing(?:Horizontal|Vertical)|min(?:Width|Height)|max(?:Width|Height)|padding(?:Top|Bottom|Left|Right)|itemSpacing|(?:top|bottom)(?:Left|Right)Radius)'/g,
  )) {
    found.add(match[1]);
  }
  return [...found].sort();
}

/**
 * Every way a test can name a field: a class field on a fake, a property read,
 * or a key inside an object being compared. Upstream's check missed the third
 * form and reported three fields as untested that were tested.
 */
function fieldsNamedByTests(): Set<string> {
  const found = new Set<string>();
  for (const match of tests.matchAll(/^\s{2}(?:set |get )?([A-Za-z][A-Za-z0-9]*)[\s:=(]/gm)) {
    found.add(match[1]);
  }
  for (const match of tests.matchAll(/\.([A-Za-z][A-Za-z0-9]*)\b/g)) {
    found.add(match[1]);
  }
  for (const match of tests.matchAll(/\b([A-Za-z][A-Za-z0-9]*)\s*:/g)) {
    found.add(match[1]);
  }
  return found;
}

describe('the test fixtures against what the builder writes', () => {
  it('extracts a plausible number of written fields, so a broken pattern fails loudly', () => {
    // A pattern that matches nothing would report every field covered. This is
    // the assertion that turns that silence into a failure.
    const written = fieldsWritten();
    expect(written.length).toBeGreaterThan(25);
    expect(written).toContain('fills');
    expect(written).toContain('strokeBottomWeight');
    expect(written).toContain('layoutMode');
  });

  it('names every field it writes, so a typo or a dropped write can fail', () => {
    const named = fieldsNamedByTests();
    const unnamed = fieldsWritten().filter((field) => !named.has(field));
    // Six were unnamed when this was first run: four radius corners and two
    // padding sides, all correct and none of them checkable.
    expect(unnamed).toEqual([]);
  });
});

const realTokens = fs.existsSync(TOKENS)
  ? new Set<string>(
      (JSON.parse(fs.readFileSync(TOKENS, 'utf8')).variables as { name: string }[]).map(
        (variable) => variable.name,
      ),
    )
  : null;

// Skipped rather than failed without the other repo, like the library dry run:
// a checkout of this one alone must still pass.
const describeTokens = realTokens ? describe : describe.skip;

describeTokens('the test collection against what cia exports', () => {
  /**
   * The names the default fake collection claims exist. A test may also pass a
   * token explicitly, which is how it says it is hypothetical, and those are
   * deliberately not checked here.
   */
  function claimedByDefault(): string[] {
    const found: string[] = [];
    for (const block of tests.matchAll(/const BOILERPLATE_(?:COLORS|FLOATS) = \[([\s\S]*?)\];/g)) {
      for (const name of block[1].matchAll(/'([^']+)'/g)) {
        found.push(name[1]);
      }
    }
    return found;
  }

  it('reads a plausible number of claimed tokens', () => {
    expect(claimedByDefault().length).toBeGreaterThan(15);
  });

  it('claims no token cia does not export', () => {
    // A fake MISSING a real token fails loudly for the wrong reason, which at
    // least gets looked at. A fake claiming one that does not exist passes, and
    // what it certifies is that the code binds something that can never arrive.
    const invented = claimedByDefault().filter((name) => !(realTokens as Set<string>).has(name));
    expect(invented).toEqual([]);
  });

  it('carries the whole type scale or none of it, never a partial one', () => {
    // This used to assert one step per axis, which was the truth until
    // 2026-09-28, when the exporter began emitting the tokens cia computes. It
    // fired on the day, which was its job. What is true of ANY export now is
    // consistency: a file with one derived size has all ten steps and every
    // alias, because a partial scale would bind some headings and not others,
    // which looks like a theme problem and is an export problem.
    const names = realTokens as Set<string>;
    const derived = [...names].filter((name) => /^font-size-(?:[1-9]|10)$/.test(name));
    if (derived.length === 0) {
      // A file from before the derived tokens, or a single-theme export not yet
      // regenerated. Not wrong, just older; the dry run measures it as it is.
      expect(names.has('font-size-base')).toBe(true);
      return;
    }
    expect(derived).toHaveLength(10);
    ['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl'].forEach((alias) => {
      expect(names.has(`font-size-${alias}`)).toBe(true);
    });
    ['light', 'normal', 'medium', 'semibold', 'bold', 'black'].forEach((weight) => {
      expect(names.has(`font-weight-${weight}`)).toBe(true);
    });
    ['none', 'tight', 'snug', 'normal', 'relaxed', 'loose'].forEach((key) => {
      expect(names.has(`line-height-${key}`)).toBe(true);
    });
  });

  it('stores a line height as a percentage, since a bound multiplier would read as 1.5%', () => {
    const payload = JSON.parse(fs.readFileSync(TOKENS, 'utf8')) as {
      modes: string[];
      variables: { name: string; valuesByMode: Record<string, number> }[];
    };
    // The DERIVED steps. The declared alias `line-height-normal` is cia's own
    // multiplier, 1.5, and sits in the same file beside `line-height-4` at 150.
    // This test first ran against exactly that file and caught it: bound to a
    // text node whose unit is PERCENT, the alias reads as 1.5%. The builder now
    // binds the numbered step only, and upstream has been asked to re-emit the
    // alias as a percentage too, at which point the exclusion below can go.
    const lineHeights = payload.variables.filter((variable) => /^line-height-[1-6]$/.test(variable.name));
    if (lineHeights.length === 0) {
      return; // a file from before the derived tokens
    }
    expect(lineHeights).toHaveLength(6);
    lineHeights.forEach((variable) => {
      const value = variable.valuesByMode[payload.modes[0]];
      expect({ name: variable.name, value }).toEqual({ name: variable.name, value: expect.any(Number) });
      expect(value).toBeGreaterThanOrEqual(100);
    });
  });
});
