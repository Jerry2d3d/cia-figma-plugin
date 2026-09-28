import { COMPONENT_SPEC_VERSION, validateComponentSpec } from '@/shared/componentSpec';
import buttonSpec from '@/__fixtures__/Button.component-spec.json';

const minimal = {
  specVersion: COMPONENT_SPEC_VERSION,
  component: 'Thing',
  props: [{ name: 'label', optional: false, type: 'string', values: null }],
  styleBlocks: [
    {
      selector: '.thing',
      kind: 'base',
      ciaCalls: [{ fn: 'color', args: ['surface-default'], property: 'background-color', state: 'default' }],
    },
  ],
};

describe('validateComponentSpec', () => {
  it('accepts the real Button spec exported by figma-import-export', () => {
    expect(validateComponentSpec(buttonSpec)).toEqual({ valid: true, spec: buttonSpec });
  });

  it('accepts a minimal well-formed spec', () => {
    expect(validateComponentSpec(minimal).valid).toBe(true);
  });

  it('rejects specVersion 1 (no property/state on ciaCalls)', () => {
    const result = validateComponentSpec({ ...minimal, specVersion: 1 });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0]).toMatch(/specVersion 1 \(expected 2\)/);
    }
  });

  it('rejects a variant block without prop/value', () => {
    const result = validateComponentSpec({
      ...minimal,
      styleBlocks: [{ selector: '.primary', kind: 'variant', ciaCalls: [] }],
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toEqual([
        'styleBlocks[0].prop must be a non-empty string for a variant block',
        'styleBlocks[0].value must be a non-empty string for a variant block',
      ]);
    }
  });

  it('rejects a call with an unknown state', () => {
    const result = validateComponentSpec({
      ...minimal,
      styleBlocks: [
        {
          selector: '.thing',
          kind: 'base',
          ciaCalls: [{ fn: 'color', args: ['x'], property: 'color', state: 'pressed' }],
        },
      ],
    });
    expect(result.valid).toBe(false);
  });

  it('rejects a non-object payload', () => {
    expect(validateComponentSpec('nope').valid).toBe(false);
  });
});

describe('the element tree', () => {
  const withTree = (tree: unknown) => ({
    specVersion: 2,
    component: 'Treeish',
    props: [],
    styleBlocks: [],
    tree,
  });

  it('accepts a well-formed tree', () => {
    const result = validateComponentSpec(
      withTree([
        { selector: '.root', parent: null, tag: 'div' },
        { selector: '.label', parent: '.root', tag: 'span' },
      ]),
    );
    expect(result.valid).toBe(true);
  });

  it('accepts null, which is how the producer says it could not scan the component', () => {
    expect(validateComponentSpec(withTree(null)).valid).toBe(true);
  });

  it('accepts several roots, because that is a real signal rather than malformed input', () => {
    const result = validateComponentSpec(
      withTree([
        { selector: '.a', parent: null, tag: 'div' },
        { selector: '.b', parent: null, tag: 'div' },
      ]),
    );
    // 18 of 99 components arrive this way. The builder reports the ambiguity;
    // rejecting the tree here would lose the parts it does place correctly.
    expect(result.valid).toBe(true);
  });

  it('rejects a parent that is not in the tree, which would build nothing', () => {
    const result = validateComponentSpec(
      withTree([{ selector: '.label', parent: '.missing', tag: 'span' }]),
    );
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0]).toContain('names parent ".missing", which is not in the tree');
    }
  });

  it('rejects a duplicate selector, because two nodes cannot be one element', () => {
    const result = validateComponentSpec(
      withTree([
        { selector: '.root', parent: null, tag: 'div' },
        { selector: '.root', parent: null, tag: 'span' },
      ]),
    );
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0]).toContain('appears twice in the tree');
    }
  });

  it('rejects a parent cycle rather than walking it forever', () => {
    const result = validateComponentSpec(
      withTree([
        { selector: '.a', parent: '.b', tag: 'div' },
        { selector: '.b', parent: '.a', tag: 'div' },
      ]),
    );
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((error) => error.includes('parent cycle'))).toBe(true);
    }
  });
});

describe('a conditional class in the tree', () => {
  const withTree = (tree: unknown) => ({
    specVersion: 2,
    component: 'Modish',
    props: [],
    styleBlocks: [],
    tree,
  });

  it('accepts a modifier that names another node', () => {
    const result = validateComponentSpec(
      withTree([
        { selector: '.text', parent: null, tag: 'p' },
        { selector: '.textMuted', parent: null, tag: 'p', modifierOf: '.text' },
      ]),
    );
    expect(result.valid).toBe(true);
  });

  it('rejects a modifier that names itself, which modifies nothing', () => {
    const result = validateComponentSpec(
      withTree([{ selector: '.text', parent: null, tag: 'p', modifierOf: '.text' }]),
    );
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((error) => error.includes('modifies nothing'))).toBe(true);
    }
  });
});
