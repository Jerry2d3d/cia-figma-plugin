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

/**
 * The descendant selectors a declaration sat inside, outermost first.
 *
 * `.label { font-size: ... }` written inside `.inputWrapper` styles the label,
 * not the wrapper. Before this existed those declarations looked like the parent
 * setting the same property several times, and the builder painted one of them
 * onto the root frame. 501 declarations carry a path, 169 of them on blocks this
 * version builds, so this is the difference between a component styled correctly
 * and one wearing its children's styling.
 *
 * An entry can be a selector list as written, `".helperText, .errorMessage"`,
 * because the declaration genuinely applies to both. Splitting it upstream would
 * state two facts where the source states one. Added upstream 2026-09-28.
 */
export type DeclarationParts = string[];

/** One `cia.<fn>(...)` call found in a component's SCSS, tagged with what it sets. */
export interface CiaCall {
  fn: string;
  args: string[];
  /** The CSS property the call sets (`background-color`, `padding`, ...), or null when it could not be derived. */
  property: string | null;
  state: CiaCallState;
  variant?: DeclarationVariant;
  parts?: DeclarationParts;
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
  parts?: DeclarationParts;
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
  parts?: DeclarationParts;
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
  parts?: DeclarationParts;
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

/**
 * One node of the component's element tree, read from its JSX.
 *
 * `parent` is the nearest ancestor carrying a class of its own, so unstyled
 * wrappers are transparent, and `tag` is the JSX element. A node need NOT have a
 * style block: 105 nodes across the library are rendered but never styled, and
 * that is worth knowing rather than filtering, because it says a child exists and
 * somewhere exists to put text. So the join runs one way: a styled part is looked
 * up in the tree, never the reverse.
 *
 * Added upstream 2026-09-28. 93 of 99 components scan cleanly; the other six get
 * no tree at all rather than a partial one, because a half-built tree looks like
 * structure while missing exactly the parts nobody would think to check.
 */
export interface PartTreeNode {
  selector: string;
  /** Null for the root node. */
  parent: string | null;
  tag: string;
  /**
   * Set when this class is applied conditionally, naming the class it modifies.
   * `.textMuted` is not an element: Text renders one tag carrying `.text` and,
   * when muted, `.textMuted` as well, so the two selectors are one node under two
   * names. Added upstream 2026-09-28, which took nodes wrongly claiming to be
   * roots from 18 to 13.
   *
   * A modifier is a state of its target rather than a child of it, so it has no
   * position of its own and nothing is built for it.
   */
  modifierOf?: string;
  /**
   * The other classes that are mutually exclusive names for this same node,
   * when the whole class comes from a condition: `className={icon ?
   * styles.infoIconOutside : styles.infoIcon}` on one `<button>`. Exactly one
   * applies at a time and the source does not say which, so there is no default.
   *
   * Never present alongside `modifierOf`: there is no element being modified,
   * because the branches ARE the element. Added upstream 2026-09-28, replacing
   * nine nodes that had claimed to modify their own parent.
   *
   * The relation is symmetric but a set of them is not always one element. One
   * class can be used on two different elements, and then it lists the
   * alternatives of both, so the set spans more nodes than exist.
   */
  alternativeTo?: string[];
}

export interface ComponentProp {
  name: string;
  optional: boolean;
  type: string;
  values: string[] | null;
  default?: string;
  /**
   * For a boolean prop: the block selectors it shows or hides, resolved from the
   * JSX rather than guessed from the name. Absent means unknown, never
   * "controls nothing".
   */
  controls?: string[];
}

/**
 * Something the producer could not resolve about the source, reported rather than
 * guessed at. `kind` is a stable slug, `selector` names the block when there is
 * one, and `reason` is written to be read by a person.
 *
 * These were being dropped on the floor. 149 of them existed across the 99
 * specs and nothing in this plugin's report mentioned any: the producer said a
 * local custom property was defined twice, or that a part is rendered under three
 * different parents, and the panel a person actually looks at never said so. The
 * same failure this whole week has kept turning up, which is that a count only
 * covers what it was built to count.
 */
export interface SpecGap {
  kind: string;
  /** Null for a gap about the component as a whole. */
  selector: string | null;
  reason: string;
}

export interface ComponentSpec {
  specVersion: number;
  component: string;
  props: ComponentProp[];
  styleBlocks: StyleBlock[];
  /** Null when the JSX scan could not account for everything; absent on older specs. */
  tree?: PartTreeNode[] | null;
  /** What the producer could not resolve. Absent on older specs. */
  gaps?: SpecGap[];
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

/**
 * A path of descendant selectors, outermost first. An empty array would say "no
 * descendants" in a field whose absence already says that, so it is rejected
 * rather than quietly read as belonging to the block.
 */
function validatePartsPath(value: unknown, where: string, errors: string[]): void {
  if (value === undefined) {
    return;
  }
  if (!isStringArray(value)) {
    errors.push(`${where}.parts must be an array of strings`);
    return;
  }
  if (value.length === 0) {
    errors.push(`${where}.parts must not be empty; omit it when the declaration belongs to its block`);
  }
  if (value.some((entry) => entry.length === 0)) {
    errors.push(`${where}.parts must not contain an empty selector`);
  }
}

/**
 * Shape and structure both, because this one gets walked rather than only read.
 * A duplicate selector, a parent that does not exist or a cycle would each turn
 * into a wrong or non-terminating build, so they are rejected here where the
 * message can name them, rather than discovered halfway through creating frames
 * in somebody's Figma file.
 */
function validateTree(value: unknown, errors: string[]): void {
  if (!Array.isArray(value)) {
    errors.push('"tree" must be an array or null');
    return;
  }
  const selectors = new Set<string>();
  const parentOf = new Map<string, string | null>();

  value.forEach((entry, index) => {
    const where = `tree[${index}]`;
    if (typeof entry !== 'object' || entry === null) {
      errors.push(`${where} is not an object`);
      return;
    }
    const node = entry as Record<string, unknown>;
    if (typeof node.selector !== 'string' || node.selector.length === 0) {
      errors.push(`${where}.selector must be a non-empty string`);
      return;
    }
    if (node.parent !== null && (typeof node.parent !== 'string' || node.parent.length === 0)) {
      errors.push(`${where}.parent must be a non-empty string or null`);
    }
    if (typeof node.tag !== 'string' || node.tag.length === 0) {
      errors.push(`${where}.tag must be a non-empty string`);
    }
    if (node.modifierOf !== undefined && (typeof node.modifierOf !== 'string' || node.modifierOf.length === 0)) {
      errors.push(`${where}.modifierOf must be a non-empty string when present`);
    }
    if (node.modifierOf === node.selector) {
      errors.push(`${where}.modifierOf names itself, so it modifies nothing`);
    }
    if (node.alternativeTo !== undefined) {
      if (!isStringArray(node.alternativeTo) || node.alternativeTo.length === 0) {
        errors.push(`${where}.alternativeTo must be a non-empty array of strings`);
      } else if (node.alternativeTo.includes(node.selector as string)) {
        errors.push(`${where}.alternativeTo names itself, so it is not an alternative to anything`);
      }
      // The branches of a conditional ARE the element, so there is nothing for
      // them to modify. Carrying both would describe two different shapes at once.
      if (node.modifierOf !== undefined) {
        errors.push(`${where} carries both modifierOf and alternativeTo, which describe different shapes`);
      }
    }
    if (selectors.has(node.selector)) {
      errors.push(`${where}.selector "${node.selector}" appears twice in the tree`);
      return;
    }
    selectors.add(node.selector);
    parentOf.set(node.selector, (node.parent as string | null) ?? null);
  });

  // Several roots is not rejected here. 18 of 99 components arrive that way, and
  // it is a real signal rather than malformed input: the scan could not connect a
  // subtree, or a conditional modifier class was read as a second element. Either
  // way the data is well formed and the builder reports the ambiguity, because
  // refusing the whole tree would lose the parts it did place correctly.
  parentOf.forEach((parent, selector) => {
    if (parent !== null && !selectors.has(parent)) {
      errors.push(`tree node "${selector}" names parent "${parent}", which is not in the tree`);
    }
  });

  // Being alternatives is symmetric, so both nodes must say so. A one-sided claim
  // is the two directions of one fact disagreeing, which is the bug that made
  // nine nodes describe themselves as modifiers of their own parent. Asserting it
  // here is cheap and it is exactly the check that caught it upstream.
  const alternativesOf = new Map<string, string[]>();
  value.forEach((entry) => {
    const node = entry as Record<string, unknown>;
    if (typeof node.selector === 'string' && isStringArray(node.alternativeTo)) {
      alternativesOf.set(node.selector, node.alternativeTo);
    }
  });
  alternativesOf.forEach((alternatives, selector) => {
    alternatives.forEach((other) => {
      if (!selectors.has(other)) {
        errors.push(`tree node "${selector}" names alternative "${other}", which is not in the tree`);
        return;
      }
      if (!(alternativesOf.get(other) ?? []).includes(selector)) {
        errors.push(`tree node "${selector}" says it is an alternative to "${other}", but "${other}" does not say so back`);
      }
    });
  });

  // Walk each node to its root; anything that does not arrive is in a cycle.
  parentOf.forEach((_parent, selector) => {
    const seen = new Set<string>([selector]);
    let current = parentOf.get(selector) ?? null;
    while (current !== null && selectors.has(current)) {
      if (seen.has(current)) {
        errors.push(`tree node "${selector}" is in a parent cycle through "${current}"`);
        return;
      }
      seen.add(current);
      current = parentOf.get(current) ?? null;
    }
  });
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
  validatePartsPath(c.parts, where, errors);
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
  validatePartsPath(d.parts, where, errors);
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
  validatePartsPath(c.parts, where, errors);
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
  validatePartsPath(b.parts, where, errors);
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
  if (value.gaps !== undefined) {
    if (!Array.isArray(value.gaps)) {
      errors.push('"gaps" must be an array');
    } else {
      value.gaps.forEach((gap, index) => {
        const where = `gaps[${index}]`;
        if (typeof gap !== 'object' || gap === null) {
          errors.push(`${where} is not an object`);
          return;
        }
        const g = gap as Record<string, unknown>;
        if (typeof g.kind !== 'string' || g.kind.length === 0) {
          errors.push(`${where}.kind must be a non-empty string`);
        }
        if (g.selector !== null && typeof g.selector !== 'string') {
          errors.push(`${where}.selector must be a string or null`);
        }
        if (typeof g.reason !== 'string' || g.reason.length === 0) {
          errors.push(`${where}.reason must be a non-empty string`);
        }
      });
    }
  }
  if (value.tree !== undefined && value.tree !== null) {
    validateTree(value.tree, errors);
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }
  return { valid: true, spec: value as unknown as ComponentSpec };
}
