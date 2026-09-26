export const COMPONENT_SPEC_VERSION = 2;

export type StyleBlockKind = 'base' | 'part' | 'variant' | 'other';
export type CiaCallState = 'default' | 'hover' | 'focus' | 'active' | 'disabled';

const BLOCK_KINDS: StyleBlockKind[] = ['base', 'part', 'variant', 'other'];
const CALL_STATES: CiaCallState[] = ['default', 'hover', 'focus', 'active', 'disabled'];

/** One `cia.<fn>(...)` call found in a component's SCSS, tagged with what it sets. */
export interface CiaCall {
  fn: string;
  args: string[];
  /** The CSS property the call sets (`background-color`, `padding`, ...), or null when it could not be derived. */
  property: string | null;
  state: CiaCallState;
}

/**
 * A border or outline width declared on a block. `border: none` arrives as
 * width `0px` with style `none`, which is an instruction to draw nothing rather
 * than an absent value, so it is kept rather than filtered out.
 */
export interface BorderSpec {
  property: string;
  width: string;
  /** Null when the width was declared longhand, with no style alongside it. */
  style: string | null;
  state: CiaCallState;
}

export interface StyleBlock {
  selector: string;
  kind: StyleBlockKind;
  /** For `variant` blocks: the React prop this selector corresponds to (e.g. `variant`, `size`). */
  prop?: string;
  /** For `variant` blocks: the prop value that activates this selector (e.g. `primary`). */
  value?: string;
  ciaCalls: CiaCall[];
  /** Added upstream 2026-09-24; absent on specs produced before that. */
  borders?: BorderSpec[];
}

export interface ComponentProp {
  name: string;
  optional: boolean;
  type: string;
  values: string[] | null;
  default?: string;
}

export interface ComponentSpec {
  specVersion: number;
  component: string;
  props: ComponentProp[];
  styleBlocks: StyleBlock[];
}

export type ComponentSpecValidation =
  | { valid: true; spec: ComponentSpec }
  | { valid: false; errors: string[] };

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function validateCall(call: unknown, where: string, errors: string[]): void {
  if (typeof call !== 'object' || call === null) {
    errors.push(`${where} is not an object`);
    return;
  }
  const c = call as Record<string, unknown>;
  if (typeof c.fn !== 'string' || c.fn.length === 0) {
    errors.push(`${where}.fn must be a non-empty string`);
  }
  if (!isStringArray(c.args)) {
    errors.push(`${where}.args must be an array of strings`);
  }
  if (c.property !== null && typeof c.property !== 'string') {
    errors.push(`${where}.property must be a string or null`);
  }
  if (typeof c.state !== 'string' || !CALL_STATES.includes(c.state as CiaCallState)) {
    errors.push(`${where}.state must be one of ${CALL_STATES.join(', ')}`);
  }
}

function validateBlock(block: unknown, where: string, errors: string[]): void {
  if (typeof block !== 'object' || block === null) {
    errors.push(`${where} is not an object`);
    return;
  }
  const b = block as Record<string, unknown>;
  if (typeof b.selector !== 'string' || b.selector.length === 0) {
    errors.push(`${where}.selector must be a non-empty string`);
  }
  if (typeof b.kind !== 'string' || !BLOCK_KINDS.includes(b.kind as StyleBlockKind)) {
    errors.push(`${where}.kind must be one of ${BLOCK_KINDS.join(', ')}`);
  }
  if (b.kind === 'variant') {
    if (typeof b.prop !== 'string' || b.prop.length === 0) {
      errors.push(`${where}.prop must be a non-empty string for a variant block`);
    }
    if (typeof b.value !== 'string' || b.value.length === 0) {
      errors.push(`${where}.value must be a non-empty string for a variant block`);
    }
  }
  if (!Array.isArray(b.ciaCalls)) {
    errors.push(`${where}.ciaCalls must be an array`);
  } else {
    b.ciaCalls.forEach((call, index) => validateCall(call, `${where}.ciaCalls[${index}]`, errors));
  }
  if (b.borders !== undefined) {
    if (!Array.isArray(b.borders)) {
      errors.push(`${where}.borders must be an array`);
    } else {
      b.borders.forEach((border, index) => validateBorder(border, `${where}.borders[${index}]`, errors));
    }
  }
}

function validateBorder(border: unknown, where: string, errors: string[]): void {
  if (typeof border !== 'object' || border === null) {
    errors.push(`${where} is not an object`);
    return;
  }
  const b = border as Record<string, unknown>;
  if (typeof b.property !== 'string' || b.property.length === 0) {
    errors.push(`${where}.property must be a non-empty string`);
  }
  if (typeof b.width !== 'string' || b.width.length === 0) {
    errors.push(`${where}.width must be a non-empty string`);
  }
  // `border-width: 2px` on its own carries no style, which arrives as null.
  if (b.style !== null && typeof b.style !== 'string') {
    errors.push(`${where}.style must be a string or null`);
  }
  if (typeof b.state !== 'string' || !CALL_STATES.includes(b.state as CiaCallState)) {
    errors.push(`${where}.state must be one of ${CALL_STATES.join(', ')}`);
  }
}

/**
 * Structural check for figma-import-export's `figma_export_component_spec`
 * output (specVersion 2: every `ciaCalls` entry carries `property` + `state`).
 * Same discipline as the token contract: a mismatched version or malformed
 * shape is a readable error list, never a guess and never an opaque throw.
 */
export function validateComponentSpec(input: unknown): ComponentSpecValidation {
  if (typeof input !== 'object' || input === null) {
    return { valid: false, errors: ['payload is not an object'] };
  }
  const value = input as Record<string, unknown>;
  const errors: string[] = [];

  if (value.specVersion !== COMPONENT_SPEC_VERSION) {
    errors.push(
      `unsupported specVersion ${JSON.stringify(value.specVersion)} (expected ${COMPONENT_SPEC_VERSION})`,
    );
  }
  if (typeof value.component !== 'string' || value.component.length === 0) {
    errors.push('"component" must be a non-empty string');
  }
  if (!Array.isArray(value.props)) {
    errors.push('"props" must be an array');
  } else {
    value.props.forEach((prop, index) => {
      if (typeof prop !== 'object' || prop === null) {
        errors.push(`props[${index}] is not an object`);
        return;
      }
      const p = prop as Record<string, unknown>;
      if (typeof p.name !== 'string' || p.name.length === 0) {
        errors.push(`props[${index}].name must be a non-empty string`);
      }
      if (typeof p.type !== 'string') {
        errors.push(`props[${index}].type must be a string`);
      }
      if (p.values !== null && p.values !== undefined && !isStringArray(p.values)) {
        errors.push(`props[${index}].values must be an array of strings or null`);
      }
    });
  }
  if (!Array.isArray(value.styleBlocks)) {
    errors.push('"styleBlocks" must be an array');
  } else {
    value.styleBlocks.forEach((block, index) => validateBlock(block, `styleBlocks[${index}]`, errors));
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }
  return { valid: true, spec: value as unknown as ComponentSpec };
}
