import { CiaCall, ComponentSpec, StyleBlock } from '@/shared/componentSpec';

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

/** specVersion 2 carries `border-color` but no border width, so strokes get this until the contract does. */
export const DEFAULT_STROKE_WEIGHT = 1;

const FONT_STYLE_BY_WEIGHT: Record<string, string> = {
  light: 'Light',
  reg: 'Regular',
  regular: 'Regular',
  medium: 'Medium',
  semibold: 'Semi Bold',
  bold: 'Bold',
};

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
  | { kind: 'typography'; fontStyle: string; fontSize?: Variable; fontWeight?: Variable };

type TypographyOp = Extract<Op, { kind: 'typography' }>;

/**
 * Turns a style block's default-state cia calls into Figma operations,
 * resolving token names against the collection and recording every miss.
 * Blocks are resolved once, not once per variant, so a missing token shows up
 * as one gap under its selector instead of twelve copies.
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
    const ops: Op[] = [];
    const skippedStates = new Map<string, number>();

    block.ciaCalls.forEach((call) => {
      if (call.state !== 'default') {
        skippedStates.set(call.state, (skippedStates.get(call.state) ?? 0) + 1);
        return;
      }
      const op = this.resolveCall(call, block.selector);
      if (op) {
        ops.push(op);
      }
    });

    skippedStates.forEach((count, state) => {
      this.skipped.push({
        where: block.selector,
        reason: `${count} ${state} call(s) skipped: v1 builds the default state only`,
      });
    });

    return ops;
  }

  private resolveCall(call: CiaCall, where: string): Op | undefined {
    const signature = `${call.fn}(${call.args.join(', ')})`;
    switch (call.fn) {
      case 'color':
        return this.resolveColor(call, where, signature);
      case 'radius': {
        const variable = this.lookup(`radius-${call.args[0]}`, 'FLOAT', where, `${signature} as border-radius`);
        return variable ? { kind: 'radius', variable } : undefined;
      }
      case 'pad-asym': {
        // cia: `pad-asym($y: 2, $x: 4)` is vertical first, then horizontal.
        const [y = '2', x = '4'] = call.args;
        return {
          kind: 'padding',
          vertical: this.lookup(`space-${y}`, 'FLOAT', where, `${signature} as vertical padding`),
          horizontal: this.lookup(`space-${x}`, 'FLOAT', where, `${signature} as horizontal padding`),
        };
      }
      case 'space':
      case 'space-raw': {
        const variable = this.lookup(`space-${call.args[0]}`, 'FLOAT', where, `${signature} as ${call.property}`);
        if (!variable) {
          return undefined;
        }
        if (call.property === 'gap') {
          return { kind: 'gap', variable };
        }
        if (call.property === 'padding') {
          return { kind: 'padding', vertical: variable, horizontal: variable };
        }
        this.skipped.push({ where, reason: `${signature} sets ${call.property}, which has no Figma equivalent` });
        return undefined;
      }
      case 'flex':
        return this.resolveFlex(call, where, signature);
      case 'font':
        return this.resolveFont(call, where, signature);
      case 'font-family':
        this.skipped.push({
          where,
          reason: `${signature} skipped: token value is a CSS font stack, not a Figma family; using ${DEFAULT_FONT_FAMILY}`,
        });
        return undefined;
      case 'transition':
        this.skipped.push({ where, reason: `${signature} skipped: transitions have no Figma equivalent` });
        return undefined;
      default:
        this.gaps.push({ where, reason: `unsupported call ${signature} for property ${call.property}` });
        return undefined;
    }
  }

  private resolveColor(call: CiaCall, where: string, signature: string): Op | undefined {
    const name = call.args[0];
    switch (call.property) {
      case 'background-color': {
        const variable = this.lookup(name, 'COLOR', where, `${signature} as fill`);
        return variable ? { kind: 'fill', variable } : undefined;
      }
      case 'color': {
        const variable = this.lookup(name, 'COLOR', where, `${signature} as text fill`);
        return variable ? { kind: 'textFill', variable } : undefined;
      }
      case 'border-color': {
        const variable = this.lookup(name, 'COLOR', where, `${signature} as stroke`);
        if (!variable) {
          return undefined;
        }
        this.usesStroke = true;
        return { kind: 'stroke', variable };
      }
      default:
        this.skipped.push({ where, reason: `${signature} sets ${call.property}, which has no Figma equivalent` });
        return undefined;
    }
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

  private resolveFont(call: CiaCall, where: string, signature: string): Op {
    const [weight = 'reg', size, lineHeight] = call.args;
    if (lineHeight) {
      // cia's line-height tokens are unitless multipliers (1.5); a Figma line
      // height binding is in px, so binding it would render 1.5px. Left unbound
      // until the contract carries a px value.
      this.skipped.push({
        where,
        reason: `${signature}: line height "${lineHeight}" not bound (cia token is a unitless multiplier, Figma binds px)`,
      });
    }
    return {
      kind: 'typography',
      fontStyle: FONT_STYLE_BY_WEIGHT[weight] ?? 'Regular',
      fontWeight: this.lookup(`font-weight-${weight}`, 'FLOAT', where, `${signature} as font weight`),
      fontSize: size ? this.lookup(`font-size-${size}`, 'FLOAT', where, `${signature} as font size`) : undefined,
    };
  }
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

function planVariants(spec: ComponentSpec): VariantPlan[] {
  const baseBlocks = spec.styleBlocks.filter((block) => block.kind === 'base');
  const axes = variantAxes(spec);
  if (axes.length === 0) {
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

async function applyOps(
  api: BuildApi,
  component: ComponentNode,
  text: TextNode,
  label: string,
  ops: Op[],
): Promise<number> {
  let bindings = 0;

  // The font has to be loaded before `characters` or any text binding can be
  // set, so the (last-wins) typography op is settled first.
  const typography = ops.filter((op): op is TypographyOp => op.kind === 'typography').pop();
  const fontName: FontName = { family: DEFAULT_FONT_FAMILY, style: typography?.fontStyle ?? 'Regular' };
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
        component.strokeWeight = DEFAULT_STROKE_WEIGHT;
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
      case 'typography':
        if (op === typography) {
          bindText('fontSize', op.fontSize);
          bindText('fontWeight', op.fontWeight);
        }
        break;
    }
  });

  return bindings;
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

  if (resolver.usesStroke) {
    resolver.gaps.push({
      where: 'contract',
      reason: `spec carries border-color but no border width; stroke weight defaulted to ${DEFAULT_STROKE_WEIGHT}px`,
    });
  }

  const plans = planVariants(spec);
  const components: ComponentNode[] = [];
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
  }

  let node: ComponentNode | ComponentSetNode = components[0];
  if (components.length > 1) {
    node = api.combineAsVariants(components, api.currentPage);
    node.name = spec.component;
  }

  return {
    node,
    result: {
      component: spec.component,
      collection: collection.name,
      variantNames: plans.map((plan) => plan.name),
      bindings,
      gaps: resolver.gaps,
      skipped: resolver.skipped,
    },
  };
}
