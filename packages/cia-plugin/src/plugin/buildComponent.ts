import { BorderSpec, CiaCall, ComponentProp, ComponentSpec, ConsumedFrom, ConsumedToken, StyleBlock } from '@/shared/componentSpec';

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
  /**
   * Style calls sitting in `part` blocks, which this version does not build.
   * For components like DataTable this is all of their styling, so the
   * component arrives as an empty frame. Counted rather than buried in the
   * skipped list, because "arrived empty" is the single fact a person needs.
   */
  unbuiltPartCalls: number;
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

/** `12px` or `0.25rem` -> a pixel number. Undefined for anything else. */
function remOrPxToPixels(value: string): number | undefined {
  const match = /^(-?[\d.]+)(px|rem)$/.exec(value.trim());
  if (!match) {
    const bare = Number(value.trim());
    return Number.isFinite(bare) ? bare : undefined;
  }
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) {
    return undefined;
  }
  // cia's own export converts rem at 16px, so this matches what the tokens say.
  return match[2] === 'rem' ? amount * 16 : amount;
}

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

/**
 * cia's `$font-sizes`, in pixels at the 16px root. Copied from
 * css-is-awesome's `scss/_system.scss`, aliases included, because
 * `font-size(lg)` and `font-size(4)` are the same size by two names.
 *
 * Only `font-size-base` is exported as a Variable today, so a preset asking
 * for step 7 has an exact stated value and nothing to bind it to. The number
 * is applied, and the absent token is reported.
 */
const FONT_SIZE_SCALE: Record<string, number> = {
  1: 12,
  2: 14,
  3: 16,
  4: 18,
  5: 20,
  6: 24,
  7: 30,
  8: 36,
  9: 48,
  10: 60,
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 30,
  '4xl': 36,
  '5xl': 48,
  '6xl': 60,
};

/**
 * cia's `$line-heights`. These are unitless multipliers, which is why they
 * cannot be bound to a Figma FLOAT variable: Figma stores a line height as a
 * value plus a unit. It does accept PERCENT though, and a multiplier of 1.5 is
 * exactly 150%, so the value itself is representable even when the token is not.
 */
const LINE_HEIGHT_SCALE: Record<string, number> = {
  1: 1,
  2: 1.25,
  3: 1.375,
  4: 1.5,
  5: 1.625,
  6: 2,
  none: 1,
  tight: 1.25,
  snug: 1.375,
  normal: 1.5,
  relaxed: 1.625,
  loose: 2,
};

/** cia's `$letter-spacings`, in em. Figma takes these as a percentage. */
const LETTER_SPACING_SCALE: Record<string, number> = {
  tighter: -0.05,
  tight: -0.025,
  normal: 0,
  wide: 0.025,
  wider: 0.05,
  widest: 0.1,
};

/**
 * cia's `$_type-scale`: the semantic presets `type()` takes, each expanding to
 * a size step, a weight key, a line height key and sometimes letter spacing and
 * a text transform. Copied from `scss/_mixins.scss`.
 *
 * Without this map every `type()` call was a gap, so all six Heading levels
 * built at the same size. The expansion happens in Sass at compile time, so
 * mirroring the map is the only way to see through it.
 */
interface TypePreset {
  size: string;
  weight: string;
  lineHeight: string;
  letterSpacing?: string;
  uppercase?: boolean;
}

const TYPE_SCALE_PRESETS: Record<string, TypePreset> = {
  display: { size: '8', weight: 'bold', lineHeight: '2', letterSpacing: 'tight' },
  'heading-1': { size: '7', weight: 'bold', lineHeight: '2' },
  'heading-2': { size: '6', weight: 'semibold', lineHeight: '2' },
  'heading-3': { size: '5', weight: 'semibold', lineHeight: '3' },
  'heading-4': { size: '4', weight: 'medium', lineHeight: '4' },
  body: { size: '3', weight: 'normal', lineHeight: '4' },
  'body-sm': { size: '2', weight: 'normal', lineHeight: '4' },
  caption: { size: '1', weight: 'normal', lineHeight: '4' },
  overline: { size: '1', weight: 'semibold', lineHeight: '4', letterSpacing: 'wider', uppercase: true },
};

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

/**
 * Which Figma field a consumed CSS property actually lands on.
 *
 * Conflicts have to be judged per field rather than per property name: a
 * `border` carrying a colour and a `border-color` are two different CSS
 * properties writing the same stroke, and treating them as unrelated let
 * Textarea's error red overwrite its real grey. `border` is ambiguous by
 * itself, so its value decides: a colour paints the stroke, a px literal sets
 * the weight.
 */
function figmaField(property: string, from: ConsumedFrom | null): string | null {
  switch (property) {
    case 'background':
    case 'background-color':
      return 'fill';
    case 'color':
      return 'textFill';
    case 'border-color':
      return 'stroke';
    case 'border-width':
      return 'strokeWeight';
    case 'border':
      if (!from) {
        return null;
      }
      return from.fn ? 'stroke' : 'strokeWeight';
    case 'border-radius':
      return 'radius';
    case 'font-size':
      return 'fontSize';
    case 'font-weight':
      return 'fontWeight';
    case 'gap':
      return 'gap';
    // `padding` is deliberately absent: repetition there is CSS shorthand,
    // a vertical and a horizontal value, and both are wanted.
    default:
      return null;
  }
}

/** CSS properties that mean "the node's fill". cia emits both spellings. */
const FILL_PROPERTIES = ['background-color', 'background'];

type Op =
  | { kind: 'fill'; variable: Variable }
  | { kind: 'textFill'; variable: Variable }
  | { kind: 'stroke'; variable: Variable }
  | { kind: 'radius'; value: Variable | number }
  | { kind: 'padding'; vertical?: Variable | number; horizontal?: Variable | number }
  | { kind: 'gap'; value: Variable | number }
  | {
      kind: 'layout';
      direction: 'HORIZONTAL' | 'VERTICAL';
      justify: 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN';
      align: 'MIN' | 'CENTER' | 'MAX' | 'BASELINE';
      gap?: Variable;
    }
  | { kind: 'fontStyle'; style: string }
  | { kind: 'fontSize'; value: Variable | number }
  | { kind: 'fontWeight'; variable: Variable }
  /** A unitless cia multiplier, applied to Figma as a percentage. */
  | { kind: 'lineHeight'; multiplier: number }
  /** A cia em value, applied to Figma as a percentage. */
  | { kind: 'letterSpacing'; em: number }
  | { kind: 'textCase'; value: 'UPPER' }
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
    // `padding: a b` arrives as several same-property entries in source order,
    // whether written as direct calls or reached through local properties.
    // Both feed this, and it collapses per CSS shorthand rules afterwards.
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

    this.pickConsumed(block).forEach((consumed) => {
      const from = consumed.from;
      if (consumed.property === 'padding' && from?.fn && isSpacingFn(from.fn)) {
        paddingArgs.push(from.args[0]);
        return;
      }
      ops.push(...this.resolveConsumed(consumed, block.selector));
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
   * Chooses one value per single-valued property among a block's consumptions.
   *
   * A selector like `.textarea:read-only` or `.textarea[data-error]` is not one
   * of the five states the contract knows, so it folds into the base block
   * marked `default`. Textarea ends up setting `background-color` three times:
   * its real one, its read-only one, and `border-color` from its error rule.
   * Taking the last would render every text area as a disabled one with an
   * error border, which looks like a broken component rather than a missing
   * feature.
   *
   * The first is taken, because the plain selector precedes its own modifiers
   * in a stylesheet, and the losers are reported so the flattening is visible
   * rather than silently resolved. Shorthand properties are left alone: two
   * `padding` entries are a vertical and a horizontal value, not a conflict.
   */
  private pickConsumed(block: StyleBlock): ConsumedToken[] {
    const consumes = (block.consumes ?? []).filter((entry) => entry.state === 'default');
    const chosen: ConsumedToken[] = [];
    const takenBy = new Map<string, ConsumedToken>();

    consumes.forEach((entry) => {
      const field = figmaField(entry.property, entry.from);
      if (!field) {
        chosen.push(entry);
        return;
      }
      const winner = takenBy.get(field);
      if (!winner) {
        takenBy.set(field, entry);
        chosen.push(entry);
        return;
      }
      if (winner.localToken === entry.localToken) {
        // The same declaration seen twice, e.g. `border-radius: X X`. Not a
        // conflict and not worth a line in the report.
        return;
      }
      this.skipped.push({
        where: block.selector,
        reason:
          `${entry.property} is set by both ${winner.localToken} and ${entry.localToken}; ` +
          `used ${winner.localToken}, because a state or modifier rule folded into this block`,
      });
    });

    return chosen;
  }

  /**
   * Styling reached through a local custom property rather than a direct call.
   *
   * Three shapes arrive. A cia call resolves through exactly the same path as a
   * direct one, so a missing token is the same gap with the same wording. A
   * literal is a real stated value, and a border width stated as `1px` is worth
   * keeping rather than discarding for not being a token. A null `from` is the
   * producer refusing to choose between two conflicting definitions, which it
   * already reports in its own gaps, so it is skipped rather than reported
   * twice.
   */
  private resolveConsumed(consumed: ConsumedToken, where: string): Op[] {
    if (consumed.state !== 'default') {
      // Counted with the block's other non-default calls by the caller.
      return [];
    }

    const { from } = consumed;
    if (!from) {
      this.skipped.push({
        where,
        reason: `${consumed.property} comes from ${consumed.localToken}, which the spec could not resolve to one value`,
      });
      return [];
    }

    if (from.fn) {
      return this.resolveCall(
        { fn: from.fn, args: from.args, property: consumed.property, state: 'default' },
        where,
      );
    }

    return this.resolveConsumedLiteral(consumed, from.literal ?? null, where);
  }

  /**
   * A local defined from a plain literal. Only a border width maps onto
   * anything Figma holds as a number on the node; a transition or an outline
   * has no equivalent, and a colour literal is deliberately not accepted
   * because a hard-coded colour in a themed component is a fact worth seeing
   * rather than quietly baking in.
   */
  private resolveConsumedLiteral(consumed: ConsumedToken, literal: string | null, where: string): Op[] {
    if (!literal) {
      return [];
    }
    if (consumed.property === 'border' || consumed.property === 'border-width') {
      const weight = pixelWidth(literal);
      if (weight !== undefined) {
        return [{ kind: 'strokeWeight', weight }];
      }
    }
    const pixels = remOrPxToPixels(literal);
    if (pixels !== undefined) {
      return this.spacingOps(pixels, consumed.property, where, `${consumed.localToken} (${literal})`);
    }
    this.skipped.push({
      where,
      reason: `${consumed.property} is the literal "${literal}" from ${consumed.localToken}, which is not a token and has no Figma equivalent`,
    });
    return [];
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
        return variable ? [{ kind: 'radius', value: variable }] : [];
      }
      // `grid($n, $base: 0.25rem)` is arithmetic rather than a token: it
      // returns n x 4px. There is nothing to bind, but the number is exact and
      // stated, so it is applied as a literal rather than reported as
      // unsupported.
      case 'grid': {
        const steps = Number(call.args[0]);
        const base = call.args[1] ? remOrPxToPixels(call.args[1]) : 4;
        if (!Number.isFinite(steps) || base === undefined) {
          this.gaps.push({ where, reason: `${signature} is not a number this can compute` });
          return [];
        }
        return this.spacingOps(steps * base, call.property, where, signature);
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
          return [{ kind: 'gap', value: variable }];
        }
        this.skipped.push({ where, reason: `${signature} sets ${call.property}, which has no Figma equivalent` });
        return [];
      }
      case 'flex':
        return [this.resolveFlex(call, where, signature)];
      case 'font':
        return this.resolveFont(call, where, signature);
      case 'font-size':
        return this.resolveFontSize(call.args[0], where, signature);
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
        return this.resolveLineHeight(call.args[0], where, signature);
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
        return this.resolveType(call.args[0], where, signature);
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
    // `border: 1px solid color(x)` reaches here as property `border`, which
    // paints the same stroke as `border-color`.
    if (call.property === 'border-color' || call.property === 'border') {
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

  /** Applies a plain pixel number to whichever spacing field the CSS names. */
  private spacingOps(pixels: number, property: string | null, where: string, signature: string): Op[] {
    if (property === 'gap') {
      return [{ kind: 'gap', value: pixels }];
    }
    if (property === 'padding') {
      return [{ kind: 'padding', vertical: pixels, horizontal: pixels }];
    }
    if (property === 'border-radius') {
      return [{ kind: 'radius', value: pixels }];
    }
    this.skipped.push({
      where,
      reason: `${signature} is ${pixels}px on ${property}, which has no Figma equivalent`,
    });
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
      ops.push(...this.resolveFontSize(size, where, signature));
    }
    if (lineHeight) {
      ops.push(...this.resolveLineHeight(lineHeight, where, signature));
    }
    return ops;
  }

  /**
   * `type(heading-1)` expands in Sass before any CSS exists, so the spec records
   * only the preset name. Mirroring cia's map is what lets a heading come out at
   * its real size: without it every level built identically.
   */
  private resolveType(name: string, where: string, signature: string): Op[] {
    const preset = TYPE_SCALE_PRESETS[name];
    if (!preset) {
      this.gaps.push({
        where,
        reason: `${signature} uses unknown cia type preset "${name}" (known: ${Object.keys(TYPE_SCALE_PRESETS).join(', ')})`,
      });
      return [];
    }
    const ops = this.resolveWeight(preset.weight, false, where, signature);
    ops.push(...this.resolveFontSize(preset.size, where, signature));
    ops.push(...this.resolveLineHeight(preset.lineHeight, where, signature));
    if (preset.letterSpacing) {
      const em = LETTER_SPACING_SCALE[preset.letterSpacing];
      // cia itself drops a zero letter spacing rather than emitting it.
      if (em !== undefined && em !== 0) {
        ops.push({ kind: 'letterSpacing', em });
      }
    }
    if (preset.uppercase) {
      ops.push({ kind: 'textCase', value: 'UPPER' });
    }
    return ops;
  }

  /**
   * A size is bound when a token exists, so it follows the theme, and written as
   * a plain number when one does not. cia exports only `font-size-base` today,
   * so most of the scale has an exact value and nothing to bind to. Applying it
   * is better than reporting a gap and leaving the text at Figma's default,
   * which is what made all six Heading levels look the same.
   */
  private resolveFontSize(size: string, where: string, signature: string): Op[] {
    const variable = this.variablesByName.get(`font-size-${size}`);
    if (variable) {
      if (variable.resolvedType === 'FLOAT') {
        return [{ kind: 'fontSize', value: variable }];
      }
      this.gaps.push({
        where,
        reason: `variable "font-size-${size}" is ${variable.resolvedType}, ${signature} needs FLOAT`,
      });
      return [];
    }
    const pixels = FONT_SIZE_SCALE[size];
    if (pixels === undefined) {
      this.gaps.push({
        where,
        reason: `${signature}: "${size}" is neither a variable named "font-size-${size}" nor a step in cia's size scale`,
      });
      return [];
    }
    this.skipped.push({
      where,
      reason: `${signature} applied as ${pixels}px: cia exports no "font-size-${size}" variable, so this size cannot follow a theme`,
    });
    return [{ kind: 'fontSize', value: pixels }];
  }

  /**
   * cia line heights are unitless multipliers, which no Figma FLOAT variable can
   * hold, because Figma stores a line height as a value plus a unit. The value
   * is still exact: Figma accepts PERCENT, and 1.5 is 150%.
   */
  private resolveLineHeight(key: string, where: string, signature: string): Op[] {
    const multiplier = LINE_HEIGHT_SCALE[key];
    if (multiplier === undefined) {
      this.gaps.push({ where, reason: `${signature}: "${key}" is not a step in cia's line height scale` });
      return [];
    }
    this.skipped.push({
      where,
      reason: `${signature} applied as ${Math.round(multiplier * 100)}%: a unitless multiplier has no Figma Variable type, so this line height cannot follow a theme`,
    });
    return [{ kind: 'lineHeight', multiplier }];
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

function isSpacingFn(fn: string): boolean {
  return fn === 'space' || fn === 'space-raw';
}

function isSpacingCall(call: CiaCall): boolean {
  return isSpacingFn(call.fn);
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
    const values = prop.values ?? Array.from(blockByValue.keys());
    axes.push({ prop: prop.name, values: defaultFirst(values, prop.default), blockByValue });
  });

  return axes;
}

/**
 * Figma hands out the *first* variant in a set when someone drags the component
 * from the Assets panel, so that variant is effectively the component's
 * default. The spec says what the code defaults to, so put it first on every
 * axis: `size` defaults to `medium`, and a designer placing a Button should get
 * a medium one rather than whichever value happened to be declared first.
 */
function defaultFirst(values: string[], declaredDefault?: string): string[] {
  if (!declaredDefault || !values.includes(declaredDefault)) {
    return values;
  }
  return [declaredDefault, ...values.filter((value) => value !== declaredDefault)];
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

  // Figma gives a new component an opaque white fill. Nothing in the spec asked
  // for it, and most components are genuinely transparent: they set text,
  // border or layout only. Leaving it would paint white behind two thirds of
  // the library and look like a decision somebody made. Cleared first, then a
  // `fill` op puts a real background back if the spec declares one.
  component.fills = [];

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

  /**
   * A spacing value is either a token, which is bound so it follows the theme,
   * or a plain number, which is written directly. cia computes some spacing
   * arithmetically (`grid(2)` is 8px) and some components state a literal, and
   * both are real values with no token behind them. Only a binding counts
   * towards the binding total, since a literal is not bound to anything.
   */
  const setSpacing = (field: VariableBindableNodeField, value: Variable | number) => {
    if (typeof value === 'number') {
      (component as unknown as Record<string, number>)[field] = value;
      return;
    }
    bindNode(field, value);
  };

  // Size first, then line height, so a percentage line height resolves against
  // the size this component actually asked for rather than Figma's default.
  const fontSize = lastOp(ops, 'fontSize')?.value;
  if (typeof fontSize === 'number') {
    text.fontSize = fontSize;
  } else if (fontSize) {
    bindText('fontSize', fontSize);
  }
  bindText('fontWeight', lastOp(ops, 'fontWeight')?.variable);

  const lineHeight = lastOp(ops, 'lineHeight')?.multiplier;
  if (lineHeight !== undefined) {
    text.lineHeight = { value: lineHeight * 100, unit: 'PERCENT' };
  }
  const letterSpacing = lastOp(ops, 'letterSpacing')?.em;
  if (letterSpacing !== undefined) {
    text.letterSpacing = { value: letterSpacing * 100, unit: 'PERCENT' };
  }
  if (lastOp(ops, 'textCase')) {
    text.textCase = 'UPPER';
  }

  // A variant's own border width wins over the base block's, so this is settled
  // once from the whole op list rather than inside the loop. A declared width
  // is applied even with no stroke colour: it paints nothing on its own, but it
  // is a stated fact, and dropping it would lose the width a later colour needs.
  const declaredWeight = lastOp(ops, 'strokeWeight')?.weight;
  const strokeWeight = declaredWeight ?? DEFAULT_STROKE_WEIGHT;
  if (declaredWeight !== undefined) {
    component.strokeWeight = declaredWeight;
  }

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
        setSpacing('topLeftRadius', op.value);
        setSpacing('topRightRadius', op.value);
        setSpacing('bottomLeftRadius', op.value);
        setSpacing('bottomRightRadius', op.value);
        break;
      case 'padding':
        if (op.vertical !== undefined) {
          setSpacing('paddingTop', op.vertical);
          setSpacing('paddingBottom', op.vertical);
        }
        if (op.horizontal !== undefined) {
          setSpacing('paddingLeft', op.horizontal);
          setSpacing('paddingRight', op.horizontal);
        }
        break;
      case 'gap':
        setSpacing('itemSpacing', op.value);
        break;
      case 'layout':
        component.layoutMode = op.direction;
        component.primaryAxisSizingMode = 'AUTO';
        component.counterAxisSizingMode = 'AUTO';
        component.primaryAxisAlignItems = op.justify;
        component.counterAxisAlignItems = op.align;
        if (op.gap) {
          setSpacing('itemSpacing', op.gap);
        }
        break;
      default:
        break;
    }
  });

  // A component whose spec has no `flex()` call keeps Figma's default 100x100
  // frame, which clips its own label the moment the type is larger than body
  // text: a 30px heading came out looking truncated. The label is the only
  // child, so hugging it is the size the spec implies, and it is also what makes
  // any declared padding visible, since Figma ignores padding without a layout.
  if (component.layoutMode === 'NONE') {
    component.layoutMode = 'HORIZONTAL';
    component.primaryAxisSizingMode = 'AUTO';
    component.counterAxisSizingMode = 'AUTO';
  }

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
    // The prop's own default is better placeholder content than the component
    // name: CodeBlock's label really is "Code". Falling back to the component
    // name keeps every instance readable rather than blank.
    const id = owner.addComponentProperty(label.name, 'TEXT', label.default ?? spec.component);
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
  let unbuiltPartCalls = 0;
  spec.styleBlocks.forEach((block) => {
    if (block.kind === 'part') {
      unbuiltPartCalls += block.ciaCalls.filter((call) => call.state === 'default').length;
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
  // Same placeholder the TEXT property defaults to, so the canvas and the
  // property panel agree before anyone types anything.
  const placeholder = textProp(spec)?.default ?? spec.component;
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
    bindings += await applyOps(api, component, text, placeholder, ops);
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
      unbuiltPartCalls,
      gaps: resolver.gaps,
      skipped: resolver.skipped,
    },
  };
}
