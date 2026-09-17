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
