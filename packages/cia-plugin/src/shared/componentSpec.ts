export const COMPONENT_SPEC_VERSION = 2;

export type StyleBlockKind = 'base' | 'part' | 'variant' | 'other';
export type CiaCallState = 'default' | 'hover' | 'focus' | 'active' | 'disabled';

const BLOCK_KINDS: StyleBlockKind[] = ['base', 'part', 'variant', 'other'];
const CALL_STATES: CiaCallState[] = ['default', 'hover', 'focus', 'active', 'disabled'];

/**
 * The prop value a declaration belongs to, when it came from a selector nested
 * inside its block rather than from the block itself.
 *
 * `&[data-size="sm"]` written inside the root rule is a variant, not part of the
 * base. Without this the three sizes Checkbox declares were indistinguishable in
 * the spec, so the only available reading was "this block sets font-size three
 * times" and a builder had to pick one. Added upstream 2026-09-28.
 *
 * Absent rather than null when a declaration belongs to its block, so presence
 * carries the meaning. Where selectors nest, the innermost one naming a prop
 * value wins.
 */
export interface DeclarationVariant {
  prop: string;
  value: string;
}

/** One `cia.<fn>(...)` call found in a component's SCSS, tagged with what it sets. */
export interface CiaCall {
  fn: string;
  args: string[];
  /** The CSS property the call sets (`background-color`, `padding`, ...), or null when it could not be derived. */
  property: string | null;
  state: CiaCallState;
  variant?: DeclarationVariant;
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
  variant?: DeclarationVariant;
}

/**
 * A CSS property this block sets through a *local* custom property rather than
 * a direct cia call.
 *
 * Components expose a themeable surface by setting their own variables from
 * cia tokens (`--dropdown-bg-color: color(surface-default)`) and then consuming
 * them in ordinary CSS. The consumption site contains no cia call, so a reader
 * looking only at `ciaCalls` sees a part with a gap and a font size and no
 * background. 37 of 99 components style themselves this way, every form control
 * among them.
 *
 * `from` carries the resolved call, so no join against the defining block is
 * needed, while `localToken` keeps the shared concept visible: one variable
 * consumed by two parts is still one variable.
 */
export interface ConsumedFrom {
  /** The cia function, or null when the local was defined from a plain literal. */
  fn: string | null;
  args: string[];
  /** Set when the local came from a literal rather than a call, e.g. `"1px"`. */
  literal?: string | null;
}

export interface ConsumedToken {
  /** The CSS property being set, e.g. `background-color`. */
  property: string;
  /** The local custom property, e.g. `--dropdown-bg-color`. */
  localToken: string;
  state: CiaCallState;
  variant?: DeclarationVariant;
  /**
   * Where the local's value came from, or null when the producer could not
   * resolve it: usually a local defined twice with different values, which is
   * an ambiguity it refuses to pick between. Those are reported in the spec's
   * own gaps, so null here means "already accounted for upstream".
   */
  from: ConsumedFrom | null;
}

/**
 * A width or height declared as a plain value: `max-width: 640px`, `width: 100%`,
 * `max-width: none`. Added upstream 2026-09-27; absent on older specs.
 *
 * Keywords arrive as written rather than filtered, because "hug your content" is
 * real information. Anything computed is excluded, since a `var()` or `calc()`
 * already belongs to `consumes` or `ciaCalls`.
 */
export interface DimensionSpec {
  /** One of width, height, min-width, min-height, max-width, max-height. */
  property: string;
  /** As written: `640px`, `100%`, `auto`, `none`, `0`, `1.5em`. */
  value: string;
  state: CiaCallState;
  variant?: DeclarationVariant;
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
  /** Widths and heights stated as plain values; absent on older specs. */
  dimensions?: DimensionSpec[];
  /** Styling reached through a local custom property; absent on older specs. */
  consumes?: ConsumedToken[];
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

/**
 * Shared by all four declaration arrays. Absent is valid and common; present
 * means both fields must be there, because half a variant tag would silently
 * build the declaration into the base.
 */
function validateVariantTag(value: unknown, where: string, errors: string[]): void {
  if (value === undefined) {
    return;
  }
  if (typeof value !== 'object' || value === null) {
    errors.push(`${where}.variant must be an object when present`);
    return;
  }
  const tag = value as Record<string, unknown>;
  if (typeof tag.prop !== 'string' || tag.prop.length === 0) {
    errors.push(`${where}.variant.prop must be a non-empty string`);
  }
  if (typeof tag.value !== 'string' || tag.value.length === 0) {
    errors.push(`${where}.variant.value must be a non-empty string`);
  }
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
  validateVariantTag(c.variant, where, errors);
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
  if (b.consumes !== undefined) {
    if (!Array.isArray(b.consumes)) {
      errors.push(`${where}.consumes must be an array`);
    } else {
      b.consumes.forEach((entry, index) => validateConsumed(entry, `${where}.consumes[${index}]`, errors));
    }
  }
  if (b.borders !== undefined) {
    if (!Array.isArray(b.borders)) {
      errors.push(`${where}.borders must be an array`);
    } else {
      b.borders.forEach((border, index) => validateBorder(border, `${where}.borders[${index}]`, errors));
    }
  }
  if (b.dimensions !== undefined) {
    if (!Array.isArray(b.dimensions)) {
      errors.push(`${where}.dimensions must be an array`);
    } else {
      b.dimensions.forEach((entry, index) =>
        validateDimension(entry, `${where}.dimensions[${index}]`, errors),
      );
    }
  }
}

function validateDimension(entry: unknown, where: string, errors: string[]): void {
  if (typeof entry !== 'object' || entry === null) {
    errors.push(`${where} is not an object`);
    return;
  }
  const d = entry as Record<string, unknown>;
  if (typeof d.property !== 'string' || d.property.length === 0) {
    errors.push(`${where}.property must be a non-empty string`);
  }
  // `0` is a real width and `none` is a real instruction, so only an absent or
  // non-string value is wrong here.
  if (typeof d.value !== 'string' || d.value.length === 0) {
    errors.push(`${where}.value must be a non-empty string`);
  }
  if (typeof d.state !== 'string' || !CALL_STATES.includes(d.state as CiaCallState)) {
    errors.push(`${where}.state must be one of ${CALL_STATES.join(', ')}`);
  }
  validateVariantTag(d.variant, where, errors);
}

function validateConsumed(entry: unknown, where: string, errors: string[]): void {
  if (typeof entry !== 'object' || entry === null) {
    errors.push(`${where} is not an object`);
    return;
  }
  const c = entry as Record<string, unknown>;
  if (typeof c.property !== 'string' || c.property.length === 0) {
    errors.push(`${where}.property must be a non-empty string`);
  }
  if (typeof c.localToken !== 'string' || c.localToken.length === 0) {
    errors.push(`${where}.localToken must be a non-empty string`);
  }
  if (typeof c.state !== 'string' || !CALL_STATES.includes(c.state as CiaCallState)) {
    errors.push(`${where}.state must be one of ${CALL_STATES.join(', ')}`);
  }
  validateVariantTag(c.variant, where, errors);
  // Null is a real value here: the producer could not resolve the local and
  // says so in its own gaps rather than picking between two definitions.
  if (c.from === null) {
    return;
  }
  if (typeof c.from !== 'object') {
    errors.push(`${where}.from must be an object or null`);
    return;
  }
  const from = c.from as Record<string, unknown>;
  const hasLiteral = typeof from.literal === 'string';
  if (from.fn !== null && typeof from.fn !== 'string') {
    errors.push(`${where}.from.fn must be a string or null`);
  }
  if (from.fn === null && !hasLiteral) {
    errors.push(`${where}.from needs a literal when fn is null`);
  }
  if (!isStringArray(from.args)) {
    errors.push(`${where}.from.args must be an array of strings`);
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
  validateVariantTag(b.variant, where, errors);
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
