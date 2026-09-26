import { BorderSpec, CiaCall, ComponentProp, ComponentSpec, StyleBlock } from '@/shared/componentSpec';

export interface BuildGap {
  /** The style block selector the gap came from, or `contract` for a spec-level gap. */
  where: string;
  reason: string;
}

export interface BuildSkip {
  where: string;
  reason: string;
}

export interface BuildResult {
  component: string;
  collection: string;
  variantNames: string[];
  bindings: number;
  /** Figma component properties added (boolean flags, text overrides), as `name: TYPE`. */
  properties: string[];
  /** Things that should have resolved but did not. Route these upstream. */
  gaps: BuildGap[];
  /** Things v1 deliberately does not build (non-default states, parts, media queries, transitions). */
  skipped: BuildSkip[];
}

/**
 * The subset of the Plugin API the builder touches, injected so it can run
 * against a hand-rolled fake in tests (same pattern as `syncTokens`).
 */
export interface BuildApi {
  getLocalVariableCollectionsAsync(): Promise<VariableCollection[]>;
  getLocalVariablesAsync(): Promise<Variable[]>;
  createComponent(): ComponentNode;
  createText(): TextNode;
  loadFontAsync(font: FontName): Promise<void>;
  setBoundVariableForPaint(paint: SolidPaint, field: 'color', variable: Variable): SolidPaint;
  combineAsVariants(nodes: ComponentNode[], parent: BaseNode & ChildrenMixin): ComponentSetNode;
  readonly currentPage: BaseNode & ChildrenMixin;
}

export interface BuildOptions {
  /** Name of the local Variable collection whose variables the spec's token names resolve against. */
  collectionName: string;
}

/**
 * v1 only knows one font. cia's `font-family(primary)` resolves to a CSS font
 * stack, which is not a loadable Figma family, so the family is fixed here and
 * the call is reported as skipped rather than bound.
 */
export const DEFAULT_FONT_FAMILY = 'Inter';

/** Only used when a block sets a border colour but declares no width at all. */
export const DEFAULT_STROKE_WEIGHT = 1;

/**
 * Above this, a component set stops being usable in Figma and starts being a
 * performance problem. Layout primitives are the ones that blow past it: `Flex`
 * has four independent axes, which multiply out to 600 combinations. Rather
 * than truncate silently or pick "sensible" defaults, the builder declines and
 * says so.
 */
export const MAX_VARIANT_COMBINATIONS = 64;

/** `border-width: 2px` -> 2. Returns undefined for anything not in px. */
function pixelWidth(value: string): number | undefined {
  const match = /^(-?[\d.]+)px$/.exec(value.trim());
  if (!match) {
    return undefined;
  }
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * cia's `$_font-types` presets, which is what `font()`'s first argument is —
 * not a weight token key. Each preset names a weight in `$font-weights` plus
 * an italic flag. Copied from css-is-awesome's `scss/_mixins.scss` so the
 * lookup is faithful rather than guessed from the preset's spelling.
 */
const FONT_TYPE_PRESETS: Record<string, { weight: string; italic: boolean }> = {
  reg: { weight: 'normal', italic: false },
  regular: { weight: 'normal', italic: false },
  italic: { weight: 'normal', italic: true },
  light: { weight: 'light', italic: false },
  'light-it': { weight: 'light', italic: true },
  medium: { weight: 'medium', italic: false },
  'medium-it': { weight: 'medium', italic: true },
  semibold: { weight: 'semibold', italic: false },
  'semibold-it': { weight: 'semibold', italic: true },
  bold: { weight: 'bold', italic: false },
  'bold-it': { weight: 'bold', italic: true },
  black: { weight: 'black', italic: false },
  'black-it': { weight: 'black', italic: true },
};

/** cia weight keys to the matching style name in Figma's Inter family. */
const FIGMA_STYLE_BY_WEIGHT: Record<string, string> = {
  light: 'Light',
  normal: 'Regular',
  medium: 'Medium',
  semibold: 'Semi Bold',
  bold: 'Bold',
  black: 'Black',
};

function figmaFontStyle(weight: string, italic: boolean): string {
  const base = FIGMA_STYLE_BY_WEIGHT[weight] ?? 'Regular';
  if (!italic) {
    return base;
  }
  return base === 'Regular' ? 'Italic' : `${base} Italic`;
}

/** Prop names that carry a component's visible text, best first. */
const TEXT_PROP_NAMES = ['label', 'text', 'children', 'title', 'name'];

const PRIMARY_AXIS_ALIGN: Record<string, 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN'> = {
  start: 'MIN',
  'flex-start': 'MIN',
  center: 'CENTER',
  end: 'MAX',
  'flex-end': 'MAX',
  between: 'SPACE_BETWEEN',
  'space-between': 'SPACE_BETWEEN',
};

const COUNTER_AXIS_ALIGN: Record<string, 'MIN' | 'CENTER' | 'MAX' | 'BASELINE'> = {
  start: 'MIN',
  'flex-start': 'MIN',
  center: 'CENTER',
  end: 'MAX',
  'flex-end': 'MAX',
  baseline: 'BASELINE',
};

/** CSS properties that mean "the node's fill". cia emits both spellings. */
const FILL_PROPERTIES = ['background-color', 'background'];

type Op =
  | { kind: 'fill'; variable: Variable }
  | { kind: 'textFill'; variable: Variable }
  | { kind: 'stroke'; variable: Variable }
  | { kind: 'radius'; variable: Variable }
  | { kind: 'padding'; vertical?: Variable; horizontal?: Variable }
  | { kind: 'gap'; variable: Variable }
  | {
      kind: 'layout';
      direction: 'HORIZONTAL' | 'VERTICAL';
      justify: 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN';
      align: 'MIN' | 'CENTER' | 'MAX' | 'BASELINE';
      gap?: Variable;
    }
  | { kind: 'fontStyle'; style: string }
  | { kind: 'fontSize'; variable: Variable }
  | { kind: 'fontWeight'; variable: Variable }
  | { kind: 'strokeWeight'; weight: number };

/**
 * Turns a style block's default-state cia calls into Figma operations,
 * resolving token names against the collection and recording every miss.
 * Blocks are resolved once, not once per variant, so a missing token shows up
 * as one gap under its selector instead of once per variant combination.
 */
class Resolver {
  gaps: BuildGap[] = [];

  skipped: BuildSkip[] = [];

  usesStroke = false;

  constructor(private readonly variablesByName: Map<string, Variable>) {}

  private lookup(
    name: string,
    expectedType: VariableResolvedDataType,
    where: string,
    purpose: string,
  ): Variable | undefined {
    const variable = this.variablesByName.get(name);
    if (!variable) {
      this.gaps.push({ where, reason: `no variable named "${name}" in the collection (needed for ${purpose})` });
      return undefined;
    }
    if (variable.resolvedType !== expectedType) {
      this.gaps.push({
        where,
        reason: `variable "${name}" is ${variable.resolvedType}, ${purpose} needs ${expectedType}`,
      });
      return undefined;
    }
    return variable;
  }

  resolveBlock(block: StyleBlock): Op[] {
    const ops: Op[] = this.resolveBorders(block);
    const skippedStates = new Map<string, number>();
    // `padding: a b` arrives as several same-property calls in source order;
    // they are collapsed per CSS shorthand rules after the loop.
    const paddingArgs: string[] = [];

    block.ciaCalls.forEach((call) => {
      if (call.state !== 'default') {
        skippedStates.set(call.state, (skippedStates.get(call.state) ?? 0) + 1);
        return;
      }
      if (isSpacingCall(call) && call.property === 'padding') {
        paddingArgs.push(call.args[0]);
        return;
      }
      ops.push(...this.resolveCall(call, block.selector));
    });

    if (paddingArgs.length > 0) {
      ops.push(this.resolvePadding(paddingArgs, block.selector, `padding: ${paddingArgs.join(' ')}`));
    }

    skippedStates.forEach((count, state) => {
      this.skipped.push({
        where: block.selector,
        reason: `${count} ${state} call(s) skipped: v1 builds the default state only`,
      });
    });

    return ops;
  }

  /**
   * Border widths come from the spec's `borders` array, not from a guess.
   * Only `border-width` in the default state maps to a Figma stroke: `outline`
   * is a focus ring Figma has no equivalent for, and non-default states are out
   * of v1 scope like every other non-default style.
   */
  private resolveBorders(block: StyleBlock): Op[] {
    const borders = block.borders ?? [];
    const ops: Op[] = [];

    borders.forEach((border: BorderSpec) => {
      if (border.property !== 'border-width') {
        this.skipped.push({
          where: block.selector,
          reason: `${border.property} ${border.width} skipped: Figma has no equivalent`,
        });
        return;
      }
      if (border.state !== 'default') {
        this.skipped.push({
          where: block.selector,
          reason: `border-width ${border.width} in the ${border.state} state skipped: v1 builds the default state only`,
        });
        return;
      }
      const weight = pixelWidth(border.width);
      if (weight === undefined) {
        this.gaps.push({
          where: block.selector,
          reason: `border-width "${border.width}" is not a px value, so it cannot become a Figma stroke weight`,
        });
        return;
      }
      ops.push({ kind: 'strokeWeight', weight });
    });

    return ops;
  }

  /** CSS shorthand: 1 value = all sides, 2 = vertical/horizontal, 3+ = top/horizontal/bottom. */
  private resolvePadding(args: string[], where: string, signature: string): Op {
    const verticalKey = args[0];
    const horizontalKey = args.length > 1 ? args[1] : args[0];
    return {
      kind: 'padding',
      vertical: this.lookup(`space-${verticalKey}`, 'FLOAT', where, `${signature} as vertical padding`),
      horizontal: this.lookup(`space-${horizontalKey}`, 'FLOAT', where, `${signature} as horizontal padding`),
    };
  }

  private resolveCall(call: CiaCall, where: string): Op[] {
    const signature = `${call.fn}(${call.args.join(', ')})`;

    // A CSS custom property is a value the component reads back through its own
    // stylesheet, not something Figma can hold. Not a gap: nothing is missing.
    if (call.property && call.property.startsWith('--')) {
      this.skipped.push({
        where,
        reason: `${signature} sets the custom property ${call.property}, which Figma has no equivalent for`,
      });
      return [];
    }

    switch (call.fn) {
      case 'color':
        return this.resolvePaint(call.args[0], call, where, signature);
      // cia's `brand(x)` resolves to `var(--brand-x)`, a colour like any other.
      case 'brand':
        return this.resolvePaint(`brand-${call.args[0]}`, call, where, signature);
      case 'radius': {
        const variable = this.lookup(`radius-${call.args[0]}`, 'FLOAT', where, `${signature} as border-radius`);
        return variable ? [{ kind: 'radius', variable }] : [];
      }
      case 'pad-asym': {
        // cia: `pad-asym($y: 2, $x: 4)` is vertical first, then horizontal.
        const [y = '2', x = '4'] = call.args;
        return [this.resolvePadding([y, x], where, signature)];
      }
      case 'space':
      case 'space-raw': {
        const variable = this.lookup(`space-${call.args[0]}`, 'FLOAT', where, `${signature} as ${call.property}`);
        if (!variable) {
          return [];
        }
        if (call.property === 'gap') {
          return [{ kind: 'gap', variable }];
        }
        this.skipped.push({ where, reason: `${signature} sets ${call.property}, which has no Figma equivalent` });
        return [];
      }
      case 'flex':
        return [this.resolveFlex(call, where, signature)];
      case 'font':
        return this.resolveFont(call, where, signature);
      case 'font-size': {
        const variable = this.lookup(`font-size-${call.args[0]}`, 'FLOAT', where, `${signature} as font size`);
        return variable ? [{ kind: 'fontSize', variable }] : [];
      }
      // `font-weight(x)` takes a weight key straight from cia's `$font-weights`.
      case 'font-weight':
        return this.resolveWeight(call.args[0], false, where, signature);
      case 'shadow':
        this.skipped.push({
          where,
          reason: `${signature} skipped: a composite shadow has no Figma Variable type (the token export reports shadows as gaps too)`,
        });
        return [];
      case 'line-height':
        this.skipped.push({
          where,
          reason: `${signature} skipped: cia line height is a unitless multiplier, Figma binds px`,
        });
        return [];
      case 'font-family':
        this.skipped.push({
          where,
          reason: `${signature} skipped: token value is a CSS font stack, not a Figma family; using ${DEFAULT_FONT_FAMILY}`,
        });
        return [];
      case 'transition':
      case 'animate':
      case 'z':
        this.skipped.push({ where, reason: `${signature} skipped: ${call.property} has no Figma equivalent` });
        return [];
      // Compound mixins that emit several declarations at once. The parts this
      // builder can use arrive separately: `border` widths come through the
      // block's `borders` array, and `elevation` is a shadow, which has no
      // Figma Variable type.
      case 'border':
      case 'elevation':
      case 'stack':
      case 'contain':
      case 'container':
        this.skipped.push({
          where,
          reason: `${signature} skipped: a compound mixin with no single Figma equivalent`,
        });
        return [];
      case 'type':
        // A Sass type preset expanding to size + weight + line height at
        // compile time. There is no single token to bind, and guessing which
        // variables it resolves to would be exactly the kind of guess the
        // contract exists to prevent.
        this.gaps.push({
          where,
          reason: `${signature} is a Sass type preset with no token to bind; needs upstream expansion into font-size/font-weight`,
        });
        return [];
      default:
        this.gaps.push({ where, reason: `unsupported call ${signature} for property ${call.property}` });
        return [];
    }
  }

  private resolvePaint(name: string, call: CiaCall, where: string, signature: string): Op[] {
    if (call.property && FILL_PROPERTIES.includes(call.property)) {
      const variable = this.lookup(name, 'COLOR', where, `${signature} as fill`);
      return variable ? [{ kind: 'fill', variable }] : [];
    }
    if (call.property === 'color') {
      const variable = this.lookup(name, 'COLOR', where, `${signature} as text fill`);
      return variable ? [{ kind: 'textFill', variable }] : [];
    }
    if (call.property === 'border-color') {
      const variable = this.lookup(name, 'COLOR', where, `${signature} as stroke`);
      if (!variable) {
        return [];
      }
      this.usesStroke = true;
      return [{ kind: 'stroke', variable }];
    }
    this.skipped.push({ where, reason: `${signature} sets ${call.property}, which has no Figma equivalent` });
    return [];
  }

  private resolveFlex(call: CiaCall, where: string, signature: string): Op {
    // Mirrors cia's `flex($direction: row, $gap: null, $align: center, $justify: start, ...)`.
    const positional = ['direction', 'gap', 'align', 'justify'];
    const named: Record<string, string> = {};
    call.args.forEach((arg, index) => {
      const match = /^\$([\w-]+)\s*:\s*(.+)$/.exec(arg.trim());
      if (match) {
        named[match[1]] = match[2].trim();
      } else if (positional[index]) {
        named[positional[index]] = arg.trim();
      }
    });

    const direction = named.direction === 'column' ? 'VERTICAL' : 'HORIZONTAL';
    const justify = PRIMARY_AXIS_ALIGN[named.justify ?? 'start'] ?? 'MIN';
    const align = COUNTER_AXIS_ALIGN[named.align ?? 'center'] ?? 'CENTER';
    const gap =
      named.gap && named.gap !== 'null'
        ? this.lookup(`space-${named.gap}`, 'FLOAT', where, `${signature} as item spacing`)
        : undefined;

    return { kind: 'layout', direction, justify, align, gap };
  }

  private resolveFont(call: CiaCall, where: string, signature: string): Op[] {
    const [type = 'reg', size, lineHeight] = call.args;
    const preset = FONT_TYPE_PRESETS[type];
    if (!preset) {
      this.gaps.push({ where, reason: `${signature} uses unknown cia font type preset "${type}"` });
      return [];
    }
    const ops = this.resolveWeight(preset.weight, preset.italic, where, signature);
    if (size) {
      const variable = this.lookup(`font-size-${size}`, 'FLOAT', where, `${signature} as font size`);
      if (variable) {
        ops.push({ kind: 'fontSize', variable });
      }
    }
    if (lineHeight) {
      this.skipped.push({
        where,
        reason: `${signature}: line height "${lineHeight}" not bound (cia token is a unitless multiplier, Figma binds px)`,
      });
    }
    return ops;
  }

  private resolveWeight(weight: string, italic: boolean, where: string, signature: string): Op[] {
    const ops: Op[] = [{ kind: 'fontStyle', style: figmaFontStyle(weight, italic) }];
    const variable = this.lookup(`font-weight-${weight}`, 'FLOAT', where, `${signature} as font weight`);
    if (variable) {
      ops.push({ kind: 'fontWeight', variable });
    }
    return ops;
  }
}

function isSpacingCall(call: CiaCall): boolean {
  return call.fn === 'space' || call.fn === 'space-raw';
}

interface VariantAxis {
  prop: string;
  values: string[];
  blockByValue: Map<string, StyleBlock>;
}

/**
 * The props that become Figma variant axes: declared props (in declaration
 * order) that at least one `variant` style block targets. Values come from the
 * prop's enum when declared, otherwise from the blocks themselves.
 */
function variantAxes(spec: ComponentSpec): VariantAxis[] {
  const variantBlocks = spec.styleBlocks.filter((block) => block.kind === 'variant');
  const axes: VariantAxis[] = [];

  spec.props.forEach((prop) => {
    const blocks = variantBlocks.filter((block) => block.prop === prop.name);
    if (blocks.length === 0) {
      return;
    }
    const blockByValue = new Map<string, StyleBlock>();
    blocks.forEach((block) => blockByValue.set(block.value as string, block));
    axes.push({ prop: prop.name, values: prop.values ?? Array.from(blockByValue.keys()), blockByValue });
  });

  return axes;
}

interface VariantPlan {
  name: string;
  blocks: StyleBlock[];
}

function cartesian(axes: VariantAxis[]): { prop: string; value: string }[][] {
  return axes.reduce<{ prop: string; value: string }[][]>(
    (combinations, axis) =>
      combinations.flatMap((combination) => axis.values.map((value) => [...combination, { prop: axis.prop, value }])),
    [[]],
  );
}

function planVariants(spec: ComponentSpec, gaps: BuildGap[]): VariantPlan[] {
  const baseBlocks = spec.styleBlocks.filter((block) => block.kind === 'base');
  const axes = variantAxes(spec);
  if (axes.length === 0) {
    return [{ name: spec.component, blocks: baseBlocks }];
  }

  const total = axes.reduce((count, axis) => count * axis.values.length, 1);
  if (total > MAX_VARIANT_COMBINATIONS) {
    gaps.push({
      where: 'contract',
      reason:
        `${axes.map((axis) => `${axis.prop} (${axis.values.length})`).join(' x ')} = ${total} variant ` +
        `combinations, over the ${MAX_VARIANT_COMBINATIONS} a usable Figma component set can hold; ` +
        'built the base only. Split the axes into separate components, or narrow them upstream.',
    });
    return [{ name: spec.component, blocks: baseBlocks }];
  }

  return cartesian(axes).map((combination) => ({
    name: combination.map(({ prop, value }) => `${prop}=${value}`).join(', '),
    blocks: [
      ...baseBlocks,
      ...combination.flatMap(({ prop, value }) => {
        const block = axes.find((axis) => axis.prop === prop)?.blockByValue.get(value);
        return block ? [block] : [];
      }),
    ],
  }));
}

function solidPaint(): SolidPaint {
  return { type: 'SOLID', color: { r: 0, g: 0, b: 0 } };
}

function lastOp<K extends Op['kind']>(ops: Op[], kind: K): Extract<Op, { kind: K }> | undefined {
  return ops.filter((op): op is Extract<Op, { kind: K }> => op.kind === kind).pop();
}

async function applyOps(
  api: BuildApi,
  component: ComponentNode,
  text: TextNode,
  label: string,
  ops: Op[],
): Promise<number> {
  let bindings = 0;

  // The font has to be loaded before `characters` or any text binding can be
  // set, so the (last-wins) font style is settled before anything else.
  const fontName: FontName = { family: DEFAULT_FONT_FAMILY, style: lastOp(ops, 'fontStyle')?.style ?? 'Regular' };
  await api.loadFontAsync(fontName);
  text.fontName = fontName;
  text.characters = label;

  const bindText = (field: VariableBindableTextField, variable: Variable | undefined) => {
    if (variable) {
      text.setBoundVariable(field, variable);
      bindings += 1;
    }
  };
  const bindNode = (field: VariableBindableNodeField, variable: Variable) => {
    component.setBoundVariable(field, variable);
    bindings += 1;
  };

  bindText('fontSize', lastOp(ops, 'fontSize')?.variable);
  bindText('fontWeight', lastOp(ops, 'fontWeight')?.variable);

  // A variant's own border width wins over the base block's, so this is settled
  // once from the whole op list rather than inside the loop.
  const strokeWeight = lastOp(ops, 'strokeWeight')?.weight ?? DEFAULT_STROKE_WEIGHT;

  ops.forEach((op) => {
    switch (op.kind) {
      case 'fill':
        component.fills = [api.setBoundVariableForPaint(solidPaint(), 'color', op.variable)];
        bindings += 1;
        break;
      case 'textFill':
        text.fills = [api.setBoundVariableForPaint(solidPaint(), 'color', op.variable)];
        bindings += 1;
        break;
      case 'stroke':
        component.strokes = [api.setBoundVariableForPaint(solidPaint(), 'color', op.variable)];
        component.strokeWeight = strokeWeight;
        component.strokeAlign = 'INSIDE';
        bindings += 1;
        break;
      case 'radius':
        bindNode('topLeftRadius', op.variable);
        bindNode('topRightRadius', op.variable);
        bindNode('bottomLeftRadius', op.variable);
        bindNode('bottomRightRadius', op.variable);
        break;
      case 'padding':
        if (op.vertical) {
          bindNode('paddingTop', op.vertical);
          bindNode('paddingBottom', op.vertical);
        }
        if (op.horizontal) {
          bindNode('paddingLeft', op.horizontal);
          bindNode('paddingRight', op.horizontal);
        }
        break;
      case 'gap':
        bindNode('itemSpacing', op.variable);
        break;
      case 'layout':
        component.layoutMode = op.direction;
        component.primaryAxisSizingMode = 'AUTO';
        component.counterAxisSizingMode = 'AUTO';
        component.primaryAxisAlignItems = op.justify;
        component.counterAxisAlignItems = op.align;
        if (op.gap) {
          bindNode('itemSpacing', op.gap);
        }
        break;
      default:
        break;
    }
  });

  return bindings;
}

/** The prop whose value is the component's visible text, if it declares one. */
function textProp(spec: ComponentSpec): ComponentProp | undefined {
  for (const name of TEXT_PROP_NAMES) {
    const prop = spec.props.find((candidate) => candidate.name === name);
    if (prop) {
      return prop;
    }
  }
  return undefined;
}

/**
 * Adds Figma component properties so a PM can set flags and text on an
 * instance, and the screen read-back can report them. Boolean props have no
 * visual effect yet (their `:disabled`-style blocks are not built in v1) — they
 * carry intent, which is reported as a skipped item rather than left implicit.
 */
function addComponentProperties(
  spec: ComponentSpec,
  owner: ComponentNode | ComponentSetNode,
  texts: TextNode[],
  skipped: BuildSkip[],
): string[] {
  const added: string[] = [];

  const label = textProp(spec);
  if (label) {
    const id = owner.addComponentProperty(label.name, 'TEXT', spec.component);
    texts.forEach((text) => {
      text.componentPropertyReferences = { ...(text.componentPropertyReferences ?? {}), characters: id };
    });
    added.push(`${label.name}: TEXT`);
  }

  spec.props
    .filter((prop) => prop.type === 'boolean')
    .forEach((prop) => {
      const defaultValue = prop.default === 'true';
      owner.addComponentProperty(prop.name, 'BOOLEAN', defaultValue);
      added.push(`${prop.name}: BOOLEAN`);
      skipped.push({
        where: 'props',
        reason: `boolean property "${prop.name}" added for read-back but drives nothing visually in v1`,
      });
    });

  return added;
}

/**
 * Builds one Figma component (a component set when the spec has variant
 * props) from a specVersion 2 component spec, binding fills, strokes, radius,
 * padding, gap and typography to the named Variable collection. Everything
 * that cannot be bound is reported, never silently approximated.
 */
export async function buildComponent(
  spec: ComponentSpec,
  options: BuildOptions,
  api: BuildApi,
): Promise<{ result: BuildResult; node: ComponentNode | ComponentSetNode }> {
  const collections = await api.getLocalVariableCollectionsAsync();
  const collection = collections.find((candidate) => candidate.name === options.collectionName);
  if (!collection) {
    throw new Error(`no local Variable collection named "${options.collectionName}"`);
  }

  const variablesByName = new Map<string, Variable>();
  (await api.getLocalVariablesAsync()).forEach((variable) => {
    if (variable.variableCollectionId === collection.id) {
      variablesByName.set(variable.name, variable);
    }
  });

  const resolver = new Resolver(variablesByName);
  const opsByBlock = new Map<StyleBlock, Op[]>();
  spec.styleBlocks.forEach((block) => {
    if (block.kind === 'part') {
      resolver.skipped.push({ where: block.selector, reason: 'part skipped: v1 builds the root frame and its label only' });
      return;
    }
    if (block.kind === 'other') {
      resolver.skipped.push({ where: block.selector, reason: 'skipped: media queries and other non-variant blocks are not built' });
      return;
    }
    opsByBlock.set(block, resolver.resolveBlock(block));
  });

  // Specs produced before 2026-09-24 carry border colours with no widths at
  // all. Newer ones always declare a width, so this only fires on a stale spec.
  if (resolver.usesStroke && !spec.styleBlocks.some((block) => block.borders?.length)) {
    resolver.gaps.push({
      where: 'contract',
      reason: `spec carries border-color but no border widths; stroke weight defaulted to ${DEFAULT_STROKE_WEIGHT}px`,
    });
  }

  if (!spec.styleBlocks.some((block) => block.kind === 'base')) {
    resolver.gaps.push({
      where: 'contract',
      reason: 'spec has no base style block, so the component is built unstyled',
    });
  }

  // A spec with enum props but no `variant` blocks means the producer could not
  // tie its style blocks to those props — the component builds flat, losing
  // every variant. Naming that plainly is the point; inventing a selector
  // naming convention here would be the guess the contract exists to prevent.
  const enumProps = spec.props.filter((prop) => prop.values && prop.values.length > 0);
  const partCount = spec.styleBlocks.filter((block) => block.kind === 'part').length;
  if (enumProps.length > 0 && variantAxes(spec).length === 0 && partCount > 0) {
    resolver.gaps.push({
      where: 'contract',
      reason:
        `spec declares enum prop(s) ${enumProps.map((prop) => prop.name).join(', ')} but no variant style blocks; ` +
        `${partCount} part block(s) look like unclassified variants, so the component was built without variants`,
    });
  }

  const plans = planVariants(spec, resolver.gaps);
  const components: ComponentNode[] = [];
  const texts: TextNode[] = [];
  let bindings = 0;

  for (const plan of plans) {
    const component = api.createComponent();
    component.name = plan.name;
    const text = api.createText();
    text.name = 'label';
    component.appendChild(text);

    const ops = plan.blocks.flatMap((block) => opsByBlock.get(block) ?? []);
    // eslint-disable-next-line no-await-in-loop
    bindings += await applyOps(api, component, text, spec.component, ops);
    components.push(component);
    texts.push(text);
  }

  let node: ComponentNode | ComponentSetNode = components[0];
  if (components.length > 1) {
    node = api.combineAsVariants(components, api.currentPage);
    node.name = spec.component;
  }

  const properties = addComponentProperties(spec, node, texts, resolver.skipped);

  return {
    node,
    result: {
      component: spec.component,
      collection: collection.name,
      variantNames: plans.map((plan) => plan.name),
      bindings,
      properties,
      gaps: resolver.gaps,
      skipped: resolver.skipped,
    },
  };
}
