import {
  BorderSpec,
  CiaCall,
  ComponentProp,
  ComponentSpec,
  ConsumedFrom,
  ConsumedToken,
  DeclarationParts,
  DeclarationVariant,
  DimensionSpec,
  PartTreeNode,
  StyleBlock,
  StyleBlockKind,
} from '@/shared/componentSpec';

export interface BuildGap {
  /** The style block selector the gap came from, or `contract` for a spec-level gap. */
  where: string;
  reason: string;
  /**
   * Who found it. `spec` gaps come from the producer reading the source and are
   * passed through untouched; `builder` gaps are this plugin failing to represent
   * something in Figma. They are acted on by different people in different repos,
   * so the panel shows them apart rather than in one list of 309.
   */
  origin?: 'builder' | 'spec';
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
  /**
   * The element the component was built from, when it has an element tree.
   *
   * Reported because it is the one choice here that can be wrong without anything
   * looking wrong: Textarea was built from its toolbar, a sibling, and the output
   * was a plausible component of the wrong thing. Naming it makes that checkable
   * from outside rather than only visible to someone reading the tree.
   */
  builtFrom?: string;
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
  /** Used for the element tree: each styled child of a component is a frame. */
  createFrame(): FrameNode;
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
 * cia's `$font-sizes-aliases`, both ways round. `$font-sizes` merges the
 * numbered scale with these, so `font-size-3` and `font-size-base` are not two
 * tokens that happen to match: they are one entry under two names.
 *
 * It matters because the type scale is written in numbers and the export names
 * only `font-size-base`. Without this, `type(body)` asked for step 3, missed,
 * and applied 16px as a literal, throwing away a binding that was right there.
 */
const FONT_SIZE_ALIASES: Record<string, string> = {
  1: 'xs',
  2: 'sm',
  3: 'base',
  4: 'lg',
  5: 'xl',
  6: '2xl',
  7: '3xl',
  8: '4xl',
  9: '5xl',
  10: '6xl',
  xs: '1',
  sm: '2',
  base: '3',
  lg: '4',
  xl: '5',
  '2xl': '6',
  '3xl': '7',
  '4xl': '8',
  '5xl': '9',
  '6xl': '10',
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

/**
 * The four CSS bounds Figma holds directly. Figma applies these only to
 * auto-layout frames and their direct children, which every component built here
 * now is, so they take effect rather than being silently dropped.
 */
const SIZE_LIMIT_FIELDS: Record<string, 'minWidth' | 'maxWidth' | 'minHeight' | 'maxHeight'> = {
  'min-width': 'minWidth',
  'max-width': 'maxWidth',
  'min-height': 'minHeight',
  'max-height': 'maxHeight',
};

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
  /** A fixed width or height in pixels, which also pins that axis. */
  | { kind: 'size'; axis: 'width' | 'height'; pixels: number }
  /** A min or max bound. Null removes the bound, which is what `none` means. */
  | { kind: 'sizeLimit'; field: 'minWidth' | 'maxWidth' | 'minHeight' | 'maxHeight'; pixels: number | null }
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
      // A `$` in the token name means the argument was a Sass variable the
      // exporter could not resolve, usually a mixin parameter. Reporting that as
      // a missing token sends someone looking for a `space-$gap` token that was
      // never meant to exist, so the two are worded differently.
      if (name.includes('$')) {
        this.gaps.push({
          where,
          reason: `${purpose} passes the unresolved Sass variable "${name.slice(name.indexOf('$'))}", so there is no token name to look up`,
        });
        return undefined;
      }
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
    const ops: Op[] = [...this.resolveBorders(block), ...this.resolveDimensions(block)];
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

    return this.pickOneFontSize(ops, block.selector);
  }

  /**
   * Resolves a block that sets `font-size` more than once.
   *
   * Once variant-tagged declarations are split out, what is left is a block that
   * really does state several sizes for one element, and in every remaining case
   * in the library the cause is a nested *descendant* selector folded into its
   * parent: `h3` and `p` inside `.startCard`, or `.label` and `.helperText`
   * inside `.inputWrapper[data-size="large"]`. Those sizes belong to child
   * elements, so arguably none of them belongs to the root frame at all.
   *
   * The builder cannot tell the two causes apart, so the report names both rather
   * than asserting the one that used to be true. Among the candidates the one cia
   * exports as a token is preferred: of the available answers it is the only one
   * that stays correct when somebody switches theme. Every candidate is named, so
   * the choice is visible rather than silent.
   *
   * Before the type scale was mirrored this happened by accident: an unbindable
   * size produced no operation at all, so whichever value had a token was the
   * only one left. Making every size resolvable turned that luck into a real
   * decision, which is why it is now written down.
   */
  private pickOneFontSize(ops: Op[], selector: string): Op[] {
    const sizes = ops.filter((op): op is Extract<Op, { kind: 'fontSize' }> => op.kind === 'fontSize');
    if (sizes.length < 2) {
      return ops;
    }
    const describe = (op: Extract<Op, { kind: 'fontSize' }>) =>
      typeof op.value === 'number' ? `${op.value}px` : op.value.name;
    const distinct = new Set(sizes.map(describe));
    if (distinct.size < 2) {
      // The same size stated twice is not a conflict and not worth a line.
      const first = sizes[0];
      return ops.filter((op) => op.kind !== 'fontSize' || op === first);
    }
    const winner = sizes.find((op) => typeof op.value !== 'number') ?? sizes[0];
    this.gaps.push({
      where: selector,
      reason:
        `font-size is set ${sizes.length} times in one block (${[...distinct].join(', ')}); ` +
        `used ${describe(winner)}. Either a nested descendant selector was folded into this ` +
        'block, in which case these sizes belong to child elements, or a variant axis is ' +
        'missing. The values are right and their owner is not recorded',
    });
    return ops.filter((op) => op.kind !== 'fontSize' || op === winner);
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
    // A width reached through a local is still a width. Checkbox sizes its
    // checkmark this way, and it had been falling through to the spacing path,
    // which reported "no Figma equivalent" — true of that path and false of the
    // property it was setting.
    if (consumed.property in SIZE_LIMIT_FIELDS || consumed.property === 'width' || consumed.property === 'height') {
      return this.sizeOps(consumed.property, literal, where, `${consumed.property}: ${literal} from ${consumed.localToken}`);
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

  /**
   * Widths and heights stated as plain values, which is how Container declares
   * its five maxWidth variants (640px through 1280px). No token is involved, so
   * nothing here binds: these are literals, reported as applied rather than
   * counted as bindings.
   *
   * A relative value is deliberately not converted. `width: 100%` means fill the
   * parent, and a component set on the canvas has no parent to fill, so a number
   * invented for it would be a made-up size that looks deliberate. `em` is
   * relative to a font size that may be declared in another block. Both are
   * reported instead.
   */
  private resolveDimensions(block: StyleBlock): Op[] {
    const ops: Op[] = [];

    (block.dimensions ?? []).forEach((dimension) => {
      const where = block.selector;
      const stated = `${dimension.property}: ${dimension.value}`;
      if (dimension.state !== 'default') {
        this.skipped.push({
          where,
          reason: `${stated} in the ${dimension.state} state skipped: v1 builds the default state only`,
        });
        return;
      }

      ops.push(...this.sizeOps(dimension.property, dimension.value, where, stated));
    });

    return ops;
  }

  /**
   * One width or height value, whether it was declared directly or reached
   * through a local custom property. Checkbox sizes its checkmark by defining
   * `--checkbox-size` per variant, so the same value arrives as a consumption
   * rather than a dimension and had been falling through to "no Figma
   * equivalent", which was true of the spacing path it took and false of the
   * property it was setting.
   */
  private sizeOps(property: string, raw: string, where: string, stated: string): Op[] {
    const ops: Op[] = [];
    const limit = SIZE_LIMIT_FIELDS[property];
    const value = raw.trim();

    // `max-width: none` removes a bound. On a min or max that is a real
    // instruction; on a width it just means "size yourself", like `auto`.
    if (value === 'none' || value === 'auto' || value === 'fit-content' || value === 'max-content') {
      if (limit && value === 'none') {
        return [{ kind: 'sizeLimit', field: limit, pixels: null }];
      }
      this.skipped.push({
        where,
        reason: `${stated} needs no action: the component already hugs its content, which is what "${value}" asks for`,
      });
      return ops;
    }

    const pixels = /^-?[\d.]+(px|rem)?$/.test(value) ? remOrPxToPixels(value) : undefined;
    if (pixels === undefined) {
      this.skipped.push({
        where,
        reason:
          `${stated} not applied: "${value}" is relative to something Figma has no equivalent for here ` +
          '(a percentage fills a parent, and a component set on the canvas has no parent)',
      });
      return ops;
    }

    if (limit) {
      // Figma requires a positive bound, and rejects the rest.
      if (pixels <= 0) {
        this.skipped.push({ where, reason: `${stated} not applied: Figma requires a positive ${limit}` });
        return ops;
      }
      return [{ kind: 'sizeLimit', field: limit, pixels }];
    }

    if (property === 'width' || property === 'height') {
      return [{ kind: 'size', axis: property, pixels }];
    }

    this.skipped.push({ where, reason: `${stated} skipped: no Figma equivalent for ${property}` });
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
      // `radius-raw(x)` returns the theme's value directly instead of a var(), so
      // in CSS it is baked at compile time and cannot follow a theme. It is bound
      // here anyway, for the same reason `space-raw` is: the size it names is the
      // same token, and binding makes the Figma component follow the theme, where
      // a baked number would silently be one theme's value in all ten.
      case 'radius':
      case 'radius-raw': {
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
    // The step and its alias name the same entry in cia's map, so either
    // variable is the right one to bind. The spelling asked for is tried first.
    const names = [size, FONT_SIZE_ALIASES[size]].filter(Boolean);
    for (const name of names) {
      const variable = this.variablesByName.get(`font-size-${name}`);
      if (variable?.resolvedType === 'FLOAT') {
        return [{ kind: 'fontSize', value: variable }];
      }
      if (variable) {
        this.gaps.push({
          where,
          reason: `variable "font-size-${name}" is ${variable.resolvedType}, ${signature} needs FLOAT`,
        });
        return [];
      }
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

  /**
   * A weight reaches Figma through the font style, not through a number: Figma
   * derives `fontWeight` from `fontName.style` and will not let you set it
   * directly. So a missing `font-weight-*` variable costs the binding, never the
   * weight itself: the text is already Semi Bold whether the token exists or
   * not. Reporting it as a gap claimed the weight had been lost, which was the
   * same mistake as reporting an unbindable font size.
   */
  private resolveWeight(weight: string, italic: boolean, where: string, signature: string): Op[] {
    const style = figmaFontStyle(weight, italic);
    const ops: Op[] = [{ kind: 'fontStyle', style }];
    const variable = this.variablesByName.get(`font-weight-${weight}`);
    if (variable?.resolvedType === 'FLOAT') {
      ops.push({ kind: 'fontWeight', variable });
      return ops;
    }
    if (variable) {
      this.gaps.push({
        where,
        reason: `variable "font-weight-${weight}" is ${variable.resolvedType}, ${signature} needs FLOAT`,
      });
      return ops;
    }
    if (!FIGMA_STYLE_BY_WEIGHT[weight]) {
      this.gaps.push({
        where,
        reason: `${signature}: "${weight}" is neither a variable named "font-weight-${weight}" nor a weight cia defines`,
      });
      return ops;
    }
    this.skipped.push({
      where,
      reason: `${signature} applied as ${style}: cia exports no "font-weight-${weight}" variable, so this weight cannot follow a theme`,
    });
    return ops;
  }
}

function isSpacingFn(fn: string): boolean {
  return fn === 'space' || fn === 'space-raw';
}

function isSpacingCall(call: CiaCall): boolean {
  return isSpacingFn(call.fn);
}

/**
 * Splits declarations that name a prop value out of their block and into real
 * variant blocks.
 *
 * `&[data-size="sm"]` nested inside the root rule belongs to a variant, not to
 * the base. The exporter now says so per declaration, so Checkbox's three font
 * sizes stop being "this block sets font-size three times, pick one" and become
 * three variants of a `size` axis. 8 components gain an axis this way.
 *
 * Done as a spec rewrite rather than threaded through the resolver, so every
 * downstream step (axis discovery, the cartesian product, per-block op caching)
 * works on the result unchanged.
 */
/**
 * Turns a local that takes several values into one consumption per value.
 *
 * Checkbox sizes its checkmark by defining `--checkbox-size` once per
 * `[data-size]`, so the consumption carries four values rather than one. Where a
 * declared prop names the qualifier, the value becomes an ordinary
 * variant-tagged consumption and everything downstream handles it unchanged.
 *
 * A qualifier no prop names is reported instead. A theme override is a real
 * value, but a theme in Figma is a MODE on a variable, so a per-theme literal
 * cannot be expressed as one value on one node. An internal data attribute is a
 * state nothing outside the component can set.
 */
function expandQualified(block: StyleBlock, reports: BuildSkip[]): ConsumedToken[] {
  return (block.consumes ?? []).flatMap((consumed) => {
    const values = consumed.fromByVariant;
    if (!values || values.length === 0) {
      return [consumed];
    }
    return values.flatMap((entry): ConsumedToken[] => {
      if (entry.qualifier === 'default') {
        return [{ ...consumed, from: entry.from, fromByVariant: undefined }];
      }
      if (entry.variant && !consumed.variant) {
        return [{ ...consumed, from: entry.from, variant: entry.variant, fromByVariant: undefined }];
      }
      reports.push({
        where: block.selector,
        reason: entry.variant
          ? `${consumed.localToken} at ${entry.qualifier} not built: it is already scoped to ` +
            `${consumed.variant?.prop}=${consumed.variant?.value}, so it belongs to two axes at once`
          : `${consumed.localToken} at ${entry.qualifier} not built: no declared prop names that qualifier, ` +
            'so there is no variant to put it on',
      });
      return [];
    });
  });
}

function splitVariantDeclarations(spec: ComponentSpec, gaps: BuildGap[], reports: BuildSkip[]): ComponentSpec {
  const rewritten: StyleBlock[] = [];

  spec.styleBlocks.forEach((block) => {
    // Only blocks that describe the root frame are split. A tagged declaration
    // inside a `part` block styles a child element, so turning it into a variant
    // of the root would move styling onto the wrong node. Parts keep their
    // declarations and stay reported as not built, which is still true of them.
    // A part block is split too, but into more PART blocks rather than variants.
    // Divider's `.line` carries spacing tagged align=start and align=end, and
    // without this both applied to every variant, so a centred divider got the
    // styling of both edges. 53 declarations across 11 components are like that.
    const variantKind: StyleBlockKind = block.kind === 'part' ? 'part' : 'variant';
    if (block.kind !== 'base' && block.kind !== 'variant' && block.kind !== 'part') {
      rewritten.push(block);
      return;
    }
    const keep: StyleBlock = { ...block, ciaCalls: [], borders: [], dimensions: [], consumes: [] };
    // Keyed `prop=value`, in first-seen order, so the synthetic blocks come out
    // in the order the stylesheet declared them.
    const split = new Map<string, StyleBlock>();

    const bucket = (tag: DeclarationVariant): StyleBlock => {
      const key = `${tag.prop}=${tag.value}`;
      let target = split.get(key);
      if (!target) {
        target = {
          // A part keeps its own selector, so the element tree can still place it;
          // the prop and value say which variant the styling belongs to.
          selector: variantKind === 'part' ? block.selector : `${block.selector} [${key}]`,
          kind: variantKind,
          prop: tag.prop,
          value: tag.value,
          ciaCalls: [],
          borders: [],
          dimensions: [],
          consumes: [],
        };
        split.set(key, target);
      }
      return target;
    };

    /**
     * A declaration that came from a descendant selector becomes a `part` block,
     * so it stops reaching the root frame and flows into the existing "not built
     * in v1" reporting. Keyed by the whole path, and the variant tag is kept in
     * the selector so nothing is lost: a label inside the large size is still
     * recognisably that, even though neither is built yet.
     */
    const partBucket = (parts: DeclarationParts, tag?: DeclarationVariant): StyleBlock => {
      // The innermost selector is the element being styled, and it is the name the
      // element tree knows that node by, so it is what the block is keyed on: a
      // child styled from two different ancestors is still one child. A selector
      // list is kept whole, because it names several elements and matches no
      // single node, which is exactly what should be reported rather than built.
      const innermost = parts[parts.length - 1];
      const key = tag ? `${innermost} [${tag.prop}=${tag.value}]` : innermost;
      let target = split.get(key);
      if (!target) {
        target = {
          selector: key,
          kind: 'part',
          ciaCalls: [],
          borders: [],
          dimensions: [],
          consumes: [],
        };
        split.set(key, target);
      }
      return target;
    };

    // A declaration nested inside a block that is already a variant belongs to
    // two axes at once, which one synthetic block cannot express. There are no
    // such cases in the library today, so this reports rather than mis-builds.
    const crossAxis = (tag: DeclarationVariant) =>
      block.kind === 'variant' && block.prop !== undefined && block.prop !== tag.prop;

    const route = <T extends { variant?: DeclarationVariant; parts?: DeclarationParts }>(
      items: T[] | undefined,
      pick: (target: StyleBlock) => T[],
    ) => {
      (items ?? []).forEach((item) => {
        // Checked before the variant tag, because a declaration inside a
        // descendant does not style this element at all, whichever variant of it
        // is being built. There is nothing to put on the root either way.
        if (item.parts && item.parts.length > 0) {
          pick(partBucket(item.parts, item.variant)).push(item);
          return;
        }
        if (!item.variant) {
          pick(keep).push(item);
          return;
        }
        if (crossAxis(item.variant)) {
          gaps.push({
            where: block.selector,
            reason:
              `a declaration for ${item.variant.prop}=${item.variant.value} is nested inside the ` +
              `${block.prop}=${block.value} block, so it belongs to two variant axes at once; ` +
              'built into that block rather than split out',
          });
          pick(keep).push(item);
          return;
        }
        pick(bucket(item.variant)).push(item);
      });
    };

    route(block.ciaCalls, (target) => target.ciaCalls);
    route(block.borders, (target) => target.borders as BorderSpec[]);
    route(block.dimensions, (target) => target.dimensions as DimensionSpec[]);
    route(expandQualified(block, reports), (target) => target.consumes as ConsumedToken[]);

    rewritten.push(keep, ...split.values());
  });

  return { ...spec, styleBlocks: rewritten };
}

interface VariantAxis {
  prop: string;
  values: string[];
  /**
   * A list rather than one block: a value can be described by its own `variant`
   * selector and by declarations split out of the base block, and both apply.
   */
  blocksByValue: Map<string, StyleBlock[]>;
}

/**
 * The props that become Figma variant axes: declared props (in declaration
 * order) that at least one `variant` style block targets. Values come from the
 * prop's enum when declared, otherwise from the blocks themselves.
 */
function variantAxes(spec: ComponentSpec): VariantAxis[] {
  const variantBlocks = spec.styleBlocks.filter((block) => block.kind === 'variant');
  // A part can be the ONLY evidence that an axis exists. Seven components vary a
  // child element by a prop without the root changing at all: Divider spaces its
  // line differently at each alignment, Radio sizes its dot. The prop is declared
  // with its values and the styling names them, so the axis is stated rather than
  // inferred; it just is not visible on the root. Used for discovery only, since
  // a part block styles a child and must not become root operations.
  const partVariantBlocks = spec.styleBlocks.filter((block) => block.kind === 'part' && block.prop);
  const axes: VariantAxis[] = [];

  spec.props.forEach((prop) => {
    const blocks = variantBlocks.filter((block) => block.prop === prop.name);
    if (blocks.length === 0 && !partVariantBlocks.some((block) => block.prop === prop.name)) {
      return;
    }
    const blocksByValue = new Map<string, StyleBlock[]>();
    blocks.forEach((block) => {
      const value = block.value as string;
      blocksByValue.set(value, [...(blocksByValue.get(value) ?? []), block]);
    });
    const values = prop.values ?? Array.from(blocksByValue.keys());
    axes.push({ prop: prop.name, values: defaultFirst(values, prop.default), blocksByValue });
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
  /** Which value each axis takes, so variant-scoped part styling can be matched. */
  assignment: { prop: string; value: string }[];
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
    return [{ name: spec.component, blocks: baseBlocks, assignment: [] }];
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
    return [{ name: spec.component, blocks: baseBlocks, assignment: [] }];
  }

  return cartesian(axes).map((combination) => ({
    name: combination.map(({ prop, value }) => `${prop}=${value}`).join(', '),
    assignment: combination,
    blocks: [
      ...baseBlocks,
      ...combination.flatMap(
        ({ prop, value }) => axes.find((axis) => axis.prop === prop)?.blocksByValue.get(value) ?? [],
      ),
    ],
  }));
}

function solidPaint(): SolidPaint {
  return { type: 'SOLID', color: { r: 0, g: 0, b: 0 } };
}

/**
 * The last operation of a kind, which is how a variant block overrides its base:
 * blocks are concatenated in source order, so later wins. The optional predicate
 * narrows within a kind, since width and height are the same kind on two axes.
 */
function lastOp<K extends Op['kind']>(
  ops: Op[],
  kind: K,
  where?: (op: Extract<Op, { kind: K }>) => boolean,
): Extract<Op, { kind: K }> | undefined {
  return ops
    .filter((op): op is Extract<Op, { kind: K }> => op.kind === kind)
    .filter((op) => (where ? where(op) : true))
    .pop();
}

/** A readable name for a canvas layer, from a selector: `.helperText` -> helperText. */
function layerName(selector: string): string {
  return selector.replace(/^[.#]/, '') || selector;
}

/**
 * Which tree node is the component's own root element, and what could not be
 * connected to it.
 *
 * 18 of 99 components arrive with several nodes claiming no parent, and that is
 * never a real forest. Checkbox's `.label` and `.checkboxContainer` genuinely are
 * descendants of `.checkboxRow`; the scan just could not join them. Switch's
 * `.disabled` and Text's `.textMuted` are conditional classes on an element that
 * already has one, so they are not separate elements at all.
 *
 * The base style block names the root element independently of the tree, so it
 * settles which root is real. Attaching the others beneath it would invent
 * containment for Checkbox and invent an element for Text, so they are reported
 * and their subtrees left unbuilt, exactly as parts were before any tree existed.
 */
function chooseRoot(
  tree: PartTreeNode[],
  baseSelectors: string[],
  componentName: string,
): { rootSelector: string | null; orphanRoots: string[]; chosenBy: string } {
  // A modifier with no parent is not a root: it is a second name for an element
  // that is already in the tree. Counting it as one is what made 5 of the 18
  // multi-root components look ambiguous when they were not.
  const bySelector = new Map(tree.map((node) => [node.selector, node]));
  /**
   * A node stands at the top of the markup it was declared in.
   *
   * Having a root position is not enough on its own. Skeleton's `.skeleton` sits
   * inside `.lines` and also stands alone, so it is a reused child rather than a
   * second root. But Menu's `.menuPopup` also has a root position and its other
   * position is `.contextTarget`, which belongs to a DIFFERENT declaration in the
   * same file, so nothing in Menu's own markup contains it: there it really is the
   * top. The difference is whether a containing position shares its declaration.
   */
  const isRoot = (node: PartTreeNode) =>
    !node.modifierOf &&
    positionsOf(node).includes(null) &&
    !positionsOf(node).some(
      (position) => position !== null && bySelector.get(position)?.declaredIn === node.declaredIn,
    );
  const roots = tree.filter(isRoot).map((node) => node.selector);
  if (roots.length === 0) {
    return { rootSelector: null, orphanRoots: [], chosenBy: 'nothing' };
  }
  if (roots.length === 1) {
    return { rootSelector: roots[0], orphanRoots: [], chosenBy: 'the only top in the tree' };
  }

  /**
   * Three pieces of evidence, strongest first, and the report says which decided.
   *
   * The base block names the component's own element, which is usually the top but
   * need not be: Menu styles `.menu`, rendered inside `.menuPopup`, which is the
   * top. Eight components are shaped that way.
   *
   * The declaration name is weaker, because a file name does not always match a
   * declaration, but it is real evidence when it does and it is independent of
   * both the stylesheet and the containment scan. Measured across the library it
   * agrees with the base block in all 22 cases where both exist and disagrees in
   * none, and it settles Popup, which declares two public components and has no
   * base block at all, so nothing else could.
   *
   * First in file order is not evidence. It is a last resort and is named as one.
   */
  const byBaseDirect = roots.find((selector) => baseSelectors.includes(selector));
  if (byBaseDirect) {
    return { rootSelector: byBaseDirect, orphanRoots: roots.filter((s) => s !== byBaseDirect), chosenBy: 'the base style block' };
  }
  const byBaseAbove = rootAbove(tree, baseSelectors, roots);
  if (byBaseAbove) {
    return { rootSelector: byBaseAbove, orphanRoots: roots.filter((s) => s !== byBaseAbove), chosenBy: 'the element the base style block styles' };
  }
  // Only when it picks out exactly one. A declaration can contain two tops, and a
  // signal that matches both has not chosen: taking the first would be file order
  // wearing the name's authority, which is the failure this whole ranking exists
  // to avoid. No component in the library is shaped that way today, because a top
  // contained by something in its own declaration is not a top, but the guard
  // costs nothing and the alternative is silent.
  const byName = roots.filter((selector) => bySelector.get(selector)?.declaredIn === componentName);
  if (byName.length === 1) {
    return {
      rootSelector: byName[0],
      orphanRoots: roots.filter((selector) => selector !== byName[0]),
      chosenBy: `the declaration named ${componentName}`,
    };
  }
  if (byName.length > 1) {
    return {
      rootSelector: byName[0],
      orphanRoots: roots.filter((selector) => selector !== byName[0]),
      chosenBy: `first in the file: ${byName.length} tops are declared in ${componentName}, so the name does not choose between them`,
    };
  }
  return { rootSelector: roots[0], orphanRoots: roots.slice(1), chosenBy: 'first in the file, with nothing to choose on' };
}

/** Walks up from a styled element to whichever top contains it, if any. */
function rootAbove(tree: PartTreeNode[], baseSelectors: string[], roots: string[]): string | undefined {
  const bySelector = new Map(tree.map((node) => [node.selector, node]));
  const seen = new Set<string>();
  const queue = baseSelectors.filter((selector) => bySelector.has(selector));

  while (queue.length > 0) {
    const current = queue.shift() as string;
    if (seen.has(current)) {
      continue;
    }
    seen.add(current);
    if (roots.includes(current)) {
      return current;
    }
    positionsOf(bySelector.get(current) as PartTreeNode).forEach((position) => {
      if (position !== null && bySelector.has(position)) {
        queue.push(position);
      }
    });
  }
  return undefined;
}

/**
 * Every node in the subtree under one root, including the root itself, excluding
 * anything that is a modifier rather than an element.
 */
function subtreeOf(tree: PartTreeNode[], rootSelector: string): Set<string> {
  const inside = new Set<string>([rootSelector]);
  let grew = true;
  while (grew) {
    grew = false;
    tree.forEach((node) => {
      if (node.modifierOf || inside.has(node.selector)) {
        return;
      }
      // Reachable through any of its positions. A node rendered both inside this
      // subtree and as its own render-branch root belongs here for the first.
      if (positionsOf(node).some((position) => position !== null && inside.has(position))) {
        inside.add(node.selector);
        grew = true;
      }
    });
  }
  return inside;
}

/**
 * Says what each conditional class is, which is two different things.
 *
 * Most name a state of another element: `.itemOpen` is `.item` while open, and
 * v1 builds the default state only, so there is nothing to build and the styling
 * is reported the way every other non-default state is.
 *
 * Nine name their own element instead. When `modifierOf` equals `parent` the
 * class was the element's ONLY class, chosen by a ternary, so the scanner had no
 * unconditional class to attach it to and fell back to the container. Input's
 * info button is `className={icon ? styles.infoIconOutside : styles.infoIcon}`
 * on a real `<button>`, and MultiStepForm's slide direction is the same shape on
 * a real `<div>`. Those are elements, but nothing says which of the alternatives
 * is the default one, so a node is not invented for either. Both are reported.
 */
function reportModifiers(tree: PartTreeNode[], skipped: BuildSkip[]): void {
  tree.forEach((node) => {
    if (!node.modifierOf) {
      return;
    }
    skipped.push({
      where: node.selector,
      reason: `not built: a conditional class on ${node.modifierOf}, which is a state of that element rather than a child of it`,
    });
  });
}

/**
 * Groups nodes that are mutually exclusive names for one element.
 *
 * `className={icon ? styles.infoIconOutside : styles.infoIcon}` puts one
 * `<button>` in the tree twice, once per branch, and the two nodes name each
 * other. One frame should be built for the pair, not two: building both invents a
 * sibling that never exists, and building neither loses an element that always
 * does.
 *
 * A set is one element only when every member names every other. DesignSandbox
 * shows why that test is needed: `.runnerArmUp` is used on two different lines,
 * paired with `.runnerArmLeft` on one and `.runnerArmRight` on the other, so
 * following the relation collects three classes that are two elements. Left and
 * Right do not name each other, which is proof they are not the same node, so the
 * group is refused rather than collapsed into one frame.
 *
 * The first member in tree order stands for the group. That is not a claim about
 * which class applies: no styling is taken from any of them, because exactly one
 * applies and nothing says which.
 */
function groupAlternatives(tree: PartTreeNode[]): {
  representative: Map<string, string>;
  shared: PartTreeNode[];
} {
  const bySelector = new Map(tree.map((node) => [node.selector, node]));
  const representative = new Map<string, string>();
  const shared: PartTreeNode[] = [];
  const seen = new Set<string>();

  tree.forEach((node) => {
    const alternatives = node.alternativeTo;
    if (!alternatives || seen.has(node.selector)) {
      return;
    }
    // Follow the relation to its closure first. Checking only this node's own
    // list would accept `.runnerArmLeft` and `.runnerArmUp` as a pair while
    // `.runnerArmUp` also names `.runnerArmRight`, which is the whole problem.
    const members: string[] = [];
    const queue = [node.selector, ...alternatives];
    while (queue.length > 0) {
      const next = queue.shift() as string;
      if (members.includes(next)) {
        continue;
      }
      members.push(next);
      queue.push(...(bySelector.get(next)?.alternativeTo ?? []));
    }
    // One element only if the closure is complete: every member names every
    // other. A member with an alternative outside the set proves the set spans
    // more than one element.
    const isOneElement = members.every((member) => {
      const named = new Set([member, ...(bySelector.get(member)?.alternativeTo ?? [])]);
      return members.every((candidate) => named.has(candidate));
    });
    if (!isOneElement) {
      members.forEach((member) => {
        const found = bySelector.get(member);
        if (found && !seen.has(member)) {
          seen.add(member);
          shared.push(found);
        }
      });
      return;
    }
    members.forEach((member) => {
      seen.add(member);
      representative.set(member, node.selector);
    });
  });

  return { representative, shared };
}

/**
 * Builds the component's element tree as nested frames, and applies each part
 * block's styling to the frame it belongs to.
 *
 * Until this existed, a part's styling was reported and discarded, so 25
 * components arrived as empty frames and the rest wore only what their root
 * block declared. The tree says which element each part is, so the styling can
 * land on the right node instead of nowhere.
 *
 * Every node in the tree is built, including the 105 that have no styling of
 * their own, because the point of a library component is that a designer can see
 * and switch off its parts. An unstyled node is still a real element, and it is
 * where text goes.
 *
 * Each frame carries a text child. That is not decoration: an auto-layout frame
 * with no children collapses to nothing in Figma, so a part with only a
 * background colour would be invisible. Naming it after its selector also makes
 * the structure readable on the canvas.
 */
/** Every position a node is rendered in. One entry unless the class is reused. */
function positionsOf(node: PartTreeNode): (string | null)[] {
  return node.parents ?? [node.parent];
}

async function buildTree(
  api: BuildApi,
  root: ComponentNode,
  tree: PartTreeNode[],
  rootSelector: string | null,
  opsBySelector: Map<string, Op[]>,
  placeholder: string,
  textHome: string | null,
  assignment: { prop: string; value: string }[],
): Promise<{ bindings: number; labelText?: TextNode; built: number }> {
  let bindings = 0;
  let built = 0;
  let labelText: TextNode | undefined;
  if (!rootSelector) {
    return { bindings, labelText, built };
  }

  /**
   * Places every child of one element, then recurses. A node is built once per
   * position it is rendered in, because `.helperText` inside `.section` and
   * `.helperText` inside `.footer` are two real elements, and building one was
   * leaving the structure knowably incomplete.
   *
   * `chain` is the ancestors already open, and a selector is never re-entered
   * while it is in that chain. A class can name ITSELF as a position, which is
   * real recursive markup rather than bad data: DesignSandbox puts a `.demoRow`
   * label inside a `.demoRow` div. So one level of nesting is built and the walk
   * stops, instead of descending forever.
   */
  const place = async (parentSelector: string, parentFrame: StyledFrame, chain: string[]) => {
    for (const node of tree) {
      const positions = positionsOf(node);
      if (!positions.includes(parentSelector)) {
        continue;
      }
      // A stated position is realised once along any one path. A class that names
      // itself may therefore appear twice in a chain, as the container and as the
      // copy inside it, which is what the source says and no more. Refusing it
      // outright would drop a position the spec states; allowing it freely would
      // descend forever.
      const allowed = positions.includes(node.selector) ? 2 : 1;
      if (chain.filter((ancestor) => ancestor === node.selector).length >= allowed) {
        continue;
      }
      const frame = api.createFrame();
      frame.name = layerName(node.selector);
      parentFrame.appendChild(frame);
      built += 1;

      const text = api.createText();
      const isTextHome = node.selector === textHome;
      text.name = isTextHome ? 'label' : layerName(node.selector);
      frame.appendChild(text);
      // The first copy carries the component text. A class rendered in two places
      // must not claim the label twice, or the property would point at one of them
      // arbitrarily.
      if (isTextHome && !labelText) {
        labelText = text;
      }

      // The element's own styling, then whatever this variant adds to it, so a
      // variant-scoped value wins over the shared one the way a later rule does.
      const ops = [
        ...(opsBySelector.get(node.selector) ?? []),
        ...assignment.flatMap(({ prop, value }) => opsBySelector.get(`${node.selector}|${prop}=${value}`) ?? []),
      ];
      // eslint-disable-next-line no-await-in-loop
      bindings += await applyOps(api, frame, text, isTextHome ? placeholder : layerName(node.selector), ops);
      // eslint-disable-next-line no-await-in-loop
      await place(node.selector, frame, [...chain, node.selector]);
    }
  };

  await place(rootSelector, root, [rootSelector]);

  return { bindings, labelText, built };
}

/**
 * Where the component's text prop should live once the tree is built.
 *
 * A component that renders a `.label` span should put its text in that span, not
 * loose on the root frame beside it. Matched on the selector's own name against
 * the same prop names the text prop is found by, so this follows the existing
 * rule rather than introducing a second one. Null when the tree offers no such
 * node, and then the root keeps its own text exactly as before.
 */
function textHomeSelector(tree: PartTreeNode[]): string | null {
  const child = tree.find(
    (node) => node.parent !== null && TEXT_PROP_NAMES.includes(layerName(node.selector).toLowerCase()),
  );
  return child?.selector ?? null;
}

/**
 * A component root and a tree child take exactly the same operations: both are
 * auto-layout frames with fills, strokes, padding and a label. Widening this to
 * both is what let the element tree reuse the whole resolver rather than growing
 * a second, thinner copy of it that would drift.
 */
type StyledFrame = ComponentNode | FrameNode;

async function applyOps(
  api: BuildApi,
  component: StyledFrame,
  /**
   * Absent when the element tree carries the text on a child instead, so the root
   * has no text of its own. Every text operation below is then a no-op rather
   * than a crash: the styling belongs to whichever node actually holds the type.
   */
  text: TextNode | undefined,
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
  if (text) {
    await api.loadFontAsync(fontName);
    text.fontName = fontName;
    text.characters = label;
  }

  const bindText = (field: VariableBindableTextField, variable: Variable | undefined) => {
    if (variable && text) {
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
  if (text) {
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
        if (text) {
          text.fills = [api.setBoundVariableForPaint(solidPaint(), 'color', op.variable)];
          bindings += 1;
        }
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

  // Sizes go last, because they depend on the layout being settled: which axis
  // is primary decides which sizing mode has to stop hugging, and Figma applies
  // a min or max bound only to an auto-layout frame, which is now guaranteed.
  const width = lastOp(ops, 'size', (op) => op.axis === 'width')?.pixels;
  const height = lastOp(ops, 'size', (op) => op.axis === 'height')?.pixels;
  if (width !== undefined || height !== undefined) {
    const horizontalIsPrimary = component.layoutMode === 'HORIZONTAL';
    if (width !== undefined) {
      if (horizontalIsPrimary) {
        component.primaryAxisSizingMode = 'FIXED';
      } else {
        component.counterAxisSizingMode = 'FIXED';
      }
    }
    if (height !== undefined) {
      if (horizontalIsPrimary) {
        component.counterAxisSizingMode = 'FIXED';
      } else {
        component.primaryAxisSizingMode = 'FIXED';
      }
    }
    // Figma rejects a zero dimension, so a stated 0 becomes the smallest size it
    // will accept rather than throwing and losing the whole component.
    const clamp = (value: number) => Math.max(value, 0.01);
    component.resize(clamp(width ?? component.width), clamp(height ?? component.height));
  }

  // Applied after any resize, so a max that contradicts a stated width still wins,
  // the same way CSS resolves it.
  (['minWidth', 'maxWidth', 'minHeight', 'maxHeight'] as const).forEach((field) => {
    const op = lastOp(ops, 'sizeLimit', (candidate) => candidate.field === field);
    if (op) {
      component[field] = op.pixels;
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

  // What the producer could not resolve is passed straight through, before this
  // builder has an opinion about anything. These were being dropped: 149 of them
  // across the 99 specs, and the panel a person looks at never mentioned one.
  // A local custom property defined twice, a part rendered under three different
  // parents, a flag that guards only shared parts: all of that is exactly what
  // the gap list is for, and none of it is this builder's to discover.
  (spec.gaps ?? []).forEach((gap) => {
    resolver.gaps.push({
      where: gap.selector ?? 'contract',
      reason: `${gap.kind}: ${gap.reason}`,
      origin: 'spec',
    });
  });

  // Declarations naming a prop value become real variant blocks before anything
  // else looks at the spec, so axis discovery and op caching both see them.
  const built = splitVariantDeclarations(spec, resolver.gaps, resolver.skipped);
  // The element tree says which element each part is. A part the tree can place
  // is built onto that element; one it cannot is still reported as before.
  const tree = built.tree ?? null;
  const baseSelectors = built.styleBlocks.filter((block) => block.kind === 'base').map((block) => block.selector);
  const { rootSelector, orphanRoots, chosenBy } = tree
    ? chooseRoot(tree, baseSelectors, built.component)
    : { rootSelector: null, orphanRoots: [], chosenBy: 'nothing' };
  // Only the chosen root's own subtree can be placed. A node under an orphan root
  // has no known position, and putting it somewhere plausible is the guess this
  // whole contract exists to avoid.
  const placeable = tree && rootSelector ? subtreeOf(tree, rootSelector) : new Set<string>();
  // A set of mutually exclusive class names is one element, so only the member
  // standing for the group keeps its place; the others are folded onto it.
  const { representative, shared } = tree
    ? groupAlternatives(tree)
    : { representative: new Map<string, string>(), shared: [] as PartTreeNode[] };
  representative.forEach((stands, member) => {
    if (member !== stands) {
      placeable.delete(member);
    }
  });
  shared.forEach((node) => placeable.delete(node.selector));
  if (tree) {
    reportModifiers(tree, resolver.skipped);
    new Set(representative.values()).forEach((stands) => {
      const members = [...representative.entries()]
        .filter(([, value]) => value === stands)
        .map(([member]) => member);
      resolver.skipped.push({
        where: stands,
        reason:
          `built as one element with no styling: ${members.join(' and ')} are mutually exclusive names for it, ` +
          'exactly one applies at a time, and nothing says which is the default',
      });
    });
    shared.forEach((node) => {
      resolver.skipped.push({
        where: node.selector,
        reason:
          `not built: ${node.selector} and its alternatives do not all name each other, so this class is used on more ` +
          'than one element and the spec cannot say how many there are',
      });
    });
  }
  // A tree can exist and still have no top, when declarations render each other
  // and every position leads back inside the node's own subtree. Without this the
  // only trace was every part reporting that it is "not in the element tree",
  // which is false: the parts are all there, and it is the top that is missing.
  if (tree && !rootSelector) {
    resolver.gaps.push({
      where: 'contract',
      reason:
        `the element tree has ${tree.length} node(s) and no top: every one of them is contained by ` +
        'another, so there is nothing to build from and the component is built flat. Two declarations ' +
        'that render each other produce this',
    });
  }
  if (orphanRoots.length > 0 && tree) {
    // Ten of the fourteen are one file declaring several things that render JSX,
    // not one component rendering several branches, so saying "could not be
    // connected" asserted a cause that is wrong more often than right. When the
    // tops belong to different declarations, that is what the report says. Which
    // declaration is really the component is left open on purpose: a second one is
    // often a real part of the first, so naming it a sibling would be a guess.
    const declarationOf = (selector: string) => tree.find((node) => node.selector === selector)?.declaredIn;
    const chosen = declarationOf(rootSelector as string);
    const others = orphanRoots.map((selector) => `${selector} in ${declarationOf(selector) ?? 'the same declaration'}`);
    resolver.gaps.push({
      where: 'contract',
      reason:
        chosen && orphanRoots.some((selector) => declarationOf(selector) !== chosen)
          ? `this file declares more than one thing that renders markup; built ${rootSelector} from ${chosen}, ` +
            `chosen by ${chosenBy}, and left ${others.join(', ')} unbuilt. Whether those are separate ` +
            'components or parts of this one is not stated'
          : `the element tree has ${orphanRoots.length + 1} tops (${[rootSelector, ...orphanRoots].join(', ')}); ` +
            `built the subtree under ${rootSelector}, chosen by ${chosenBy}, and left the others unplaced`,
    });
  }
  const opsByBlock = new Map<StyleBlock, Op[]>();
  const opsBySelector = new Map<string, Op[]>();
  let unbuiltPartCalls = 0;
  built.styleBlocks.forEach((block) => {
    if (block.kind === 'part') {
      // One of the alternatives applies and nothing says which, so none of their
      // styling is taken. The element is built; how it looks is not stated.
      if (representative.has(block.selector)) {
        unbuiltPartCalls += block.ciaCalls.filter((call) => call.state === 'default').length;
        return;
      }
      if (placeable.has(block.selector)) {
        // Two blocks can name one element: its own rule, and a rule nested inside
        // an ancestor. Both apply, so they accumulate in source order rather than
        // the second replacing the first, which is the closest this gets to the
        // cascade without inventing specificity.
        // A part block carrying a prop and value styles that element only in that
        // variant, so it is kept apart rather than applied to every one of them.
        const key = block.prop ? `${block.selector}|${block.prop}=${block.value}` : block.selector;
        opsBySelector.set(key, [...(opsBySelector.get(key) ?? []), ...resolver.resolveBlock(block)]);
        return;
      }
      unbuiltPartCalls += block.ciaCalls.filter((call) => call.state === 'default').length;
      resolver.skipped.push({
        where: block.selector,
        // Three different reasons, and saying the wrong one sends a reader to the
        // wrong place. A part outside the built subtree is a real statement about
        // that part; a tree with no top is a statement about the tree, and the
        // part is not at fault at all.
        reason: !tree
          ? 'part skipped: this component has no element tree, so v1 builds the root frame and its label only'
          : rootSelector
            ? 'part skipped: it is not in the component element tree, so there is no node to style'
            : 'part skipped: the element tree has no top, so no part of it could be placed',
      });
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
  if (resolver.usesStroke && !built.styleBlocks.some((block) => block.borders?.length)) {
    resolver.gaps.push({
      where: 'contract',
      reason: `spec carries border-color but no border widths; stroke weight defaulted to ${DEFAULT_STROKE_WEIGHT}px`,
    });
  }

  if (!built.styleBlocks.some((block) => block.kind === 'base')) {
    resolver.gaps.push({
      where: 'contract',
      reason: 'spec has no base style block, so the component is built unstyled',
    });
  }

  // A spec with enum props but no `variant` blocks means the producer could not
  // tie its style blocks to those props — the component builds flat, losing
  // every variant. Naming that plainly is the point; inventing a selector
  // naming convention here would be the guess the contract exists to prevent.
  const enumProps = built.props.filter((prop) => prop.values && prop.values.length > 0);
  const partCount = built.styleBlocks.filter((block) => block.kind === 'part').length;
  if (enumProps.length > 0 && variantAxes(built).length === 0 && partCount > 0) {
    resolver.gaps.push({
      where: 'contract',
      reason:
        `spec declares enum prop(s) ${enumProps.map((prop) => prop.name).join(', ')} but no variant style blocks; ` +
        `${partCount} part block(s) look like unclassified variants, so the component was built without variants`,
    });
  }

  const plans = planVariants(built, resolver.gaps);

  // An axis whose blocks all resolve to nothing still multiplies the set. Checkbox
  // gains a `color` axis of four values whose declarations set the component's own
  // custom properties, which the `.checkmark` part consumes, and parts are not
  // built yet. Four variants that look identical read as a broken component, so
  // the reason is stated rather than left for somebody to discover.
  variantAxes(built).forEach((axis) => {
    const blocks = axis.values.flatMap((value) => axis.blocksByValue.get(value) ?? []);
    if (blocks.length === 0 || blocks.some((block) => (opsByBlock.get(block) ?? []).length > 0)) {
      return;
    }
    resolver.skipped.push({
      where: 'contract',
      reason:
        `the ${axis.prop} axis builds ${axis.values.length} variants that look alike: its styling sets ` +
        'the component\'s own custom properties, which a part consumes, and parts are not built in v1',
    });
  });
  // Same placeholder the TEXT property defaults to, so the canvas and the
  // property panel agree before anyone types anything.
  const placeholder = textProp(built)?.default ?? built.component;
  const components: ComponentNode[] = [];
  const texts: TextNode[] = [];
  let bindings = 0;

  // Six of 99 components get no tree rather than a partial one, and those keep
  // the previous shape: a root frame and a label.
  const treeNodes = tree ? tree.filter((node) => placeable.has(node.selector)) : null;
  const textHome = treeNodes ? textHomeSelector(treeNodes) : null;

  for (const plan of plans) {
    const component = api.createComponent();
    component.name = plan.name;
    let text: TextNode | undefined;
    if (!textHome) {
      text = api.createText();
      text.name = 'label';
      component.appendChild(text);
    }

    const ops = plan.blocks.flatMap((block) => opsByBlock.get(block) ?? []);
    if (treeNodes) {
      // eslint-disable-next-line no-await-in-loop
      const result = await buildTree(api, component, treeNodes, rootSelector, opsBySelector, placeholder, textHome, plan.assignment);
      bindings += result.bindings;
      text = text ?? result.labelText;
    }
    // The root is styled after its children exist, so hugging them is measured
    // against real content rather than an empty frame.
    // eslint-disable-next-line no-await-in-loop
    bindings += await applyOps(api, component, text, placeholder, ops);
    components.push(component);
    if (text) {
      texts.push(text);
    }
  }

  let node: ComponentNode | ComponentSetNode = components[0];
  if (components.length > 1) {
    node = api.combineAsVariants(components, api.currentPage);
    node.name = built.component;
  }

  const properties = addComponentProperties(built, node, texts, resolver.skipped);

  return {
    node,
    result: {
      component: built.component,
      builtFrom: rootSelector ?? undefined,
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
