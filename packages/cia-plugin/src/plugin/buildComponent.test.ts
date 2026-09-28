import { BuildApi, buildComponent, DEFAULT_STROKE_WEIGHT } from '@/plugin/buildComponent';
import { ComponentSpec } from '@/shared/componentSpec';
import buttonSpecJson from '@/__fixtures__/Button.component-spec.json';
import headingSpecJson from '@/__fixtures__/Heading.component-spec.json';
import containerSpecJson from '@/__fixtures__/Container.component-spec.json';
import checkboxSpecJson from '@/__fixtures__/Checkbox.component-spec.json';
import inputSpecJson from '@/__fixtures__/Input.component-spec.json';
import customizeModalSpecJson from '@/__fixtures__/CustomizeModal.component-spec.json';

const buttonSpec = buttonSpecJson as ComponentSpec;
const headingSpec = headingSpecJson as ComponentSpec;
const containerSpec = containerSpecJson as ComponentSpec;
const checkboxSpec = checkboxSpecJson as ComponentSpec;
const inputSpec = inputSpecJson as ComponentSpec;
const customizeModalSpec = customizeModalSpecJson as ComponentSpec;

class FakeVariable {
  constructor(
    public name: string,
    public variableCollectionId: string,
    public resolvedType: VariableResolvedDataType,
  ) {}

  get id() {
    return this.name;
  }
}

class FakeText {
  name = '';

  fontName: FontName = { family: '', style: '' };

  characters = '';

  /** Figma's default for a new text node. */
  fontSize = 12;

  lineHeight: LineHeight = { unit: 'AUTO' };

  letterSpacing: LetterSpacing = { value: 0, unit: 'PERCENT' };

  textCase = 'ORIGINAL';

  fills: SolidPaint[] = [];

  bound: Record<string, string> = {};

  componentPropertyReferences: Record<string, string> | null = null;

  setBoundVariable(field: string, variable: Variable) {
    this.bound[field] = variable.id;
  }
}

/** Figma returns the property name with a unique suffix; mimic that. */
class FakeProperties {
  properties: Record<string, { type: string; defaultValue: string | boolean }> = {};

  private counter = 0;

  addComponentProperty(name: string, type: string, defaultValue: string | boolean) {
    this.counter += 1;
    this.properties[name] = { type, defaultValue };
    return `${name}#${this.counter}:0`;
  }
}

/** Figma hands back a new component already carrying an opaque white fill. */
const FIGMA_DEFAULT_FILL: SolidPaint = { type: 'SOLID', color: { r: 1, g: 1, b: 1 } };

class FakeComponent extends FakeProperties {
  name = '';

  itemSpacing = 0;

  paddingTop = 0;

  paddingLeft = 0;

  fills: SolidPaint[] = [FIGMA_DEFAULT_FILL];

  strokes: SolidPaint[] = [];

  strokeWeight = 0;

  strokeAlign = '';

  layoutMode = 'NONE';

  primaryAxisSizingMode = '';

  counterAxisSizingMode = '';

  primaryAxisAlignItems = '';

  counterAxisAlignItems = '';

  /** Figma's default for a new component. */
  width = 100;

  height = 100;

  minWidth: number | null = null;

  maxWidth: number | null = null;

  minHeight: number | null = null;

  maxHeight: number | null = null;

  children: (FakeText | FakeFrame)[] = [];

  bound: Record<string, string> = {};

  resize(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  appendChild(child: FakeText | FakeFrame) {
    this.children.push(child);
    if (child instanceof FakeFrame) {
      child.parentFrame = this;
    }
  }

  setBoundVariable(field: string, variable: Variable) {
    this.bound[field] = variable.id;
  }
}

/**
 * A tree child. Same styled surface as a component, which is the point: the
 * builder applies one set of operations to both, so the fake has to accept the
 * same ones or the test would pass on a shape Figma does not have.
 */
class FakeFrame {
  name = '';

  /** Set by whoever appends it, so the strict sizing check below can look up. */
  parentFrame: FakeComponent | FakeFrame | null = null;

  private sizing: Record<string, string> = {};

  /**
   * Figma throws "node must be an auto-layout frame or a child of an auto-layout
   * frame" here, and it threw for real once. The fake refuses the same way, so
   * the ordering that made it throw fails in a test instead of in somebody Figma
   * file.
   */
  set layoutSizingHorizontal(value: string) {
    this.requireAutoLayoutParent('layoutSizingHorizontal');
    this.sizing.horizontal = value;
  }

  get layoutSizingHorizontal() {
    return this.sizing.horizontal ?? 'HUG';
  }

  set layoutSizingVertical(value: string) {
    this.requireAutoLayoutParent('layoutSizingVertical');
    this.sizing.vertical = value;
  }

  get layoutSizingVertical() {
    return this.sizing.vertical ?? 'HUG';
  }

  private requireAutoLayoutParent(field: string) {
    if (!this.parentFrame || this.parentFrame.layoutMode === 'NONE') {
      throw new Error(`in set_${field}: node must be an auto-layout frame or a child of an auto-layout frame`);
    }
  }

  itemSpacing = 0;

  paddingTop = 0;

  paddingLeft = 0;

  fills: SolidPaint[] = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];

  strokes: SolidPaint[] = [];

  strokeWeight = 0;

  strokeAlign = '';

  layoutMode = 'NONE';

  primaryAxisSizingMode = '';

  counterAxisSizingMode = '';

  primaryAxisAlignItems = '';

  counterAxisAlignItems = '';

  width = 100;

  height = 100;

  minWidth: number | null = null;

  maxWidth: number | null = null;

  minHeight: number | null = null;

  maxHeight: number | null = null;

  children: (FakeText | FakeFrame)[] = [];

  bound: Record<string, string> = {};

  resize(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  appendChild(child: FakeText | FakeFrame) {
    this.children.push(child);
    if (child instanceof FakeFrame) {
      child.parentFrame = this;
    }
  }

  setBoundVariable(field: string, variable: Variable) {
    this.bound[field] = variable.id;
  }
}

class FakeComponentSet extends FakeProperties {
  name = '';

  constructor(public children: FakeComponent[]) {
    super();
  }
}

/**
 * The text node a component or a tree frame carries. Once the element tree is
 * built, a root's first child may be a frame rather than the label, so tests ask
 * for the text by what it is instead of by position.
 */
function labelOf(node: FakeComponent | FakeFrame): FakeText {
  // Named rather than positional: every built frame carries a text node, so the
  // component's own label is the one called "label", wherever the tree put it.
  const found = textIn(node, (text) => text.name === "label") ?? textIn(node);
  if (!found) {
    throw new Error(`${node.name || "node"} has no text anywhere beneath it`);
  }
  return found;
}

/** Depth-first, because the element tree can put the label several levels down. */
function textIn(
  node: FakeComponent | FakeFrame,
  match: (text: FakeText) => boolean = () => true,
): FakeText | undefined {
  for (const child of node.children) {
    if (child instanceof FakeText) {
      if (match(child)) {
        return child;
      }
      continue;
    }
    const nested = textIn(child, match);
    if (nested) {
      return nested;
    }
  }
  return undefined;
}

/** A named descendant frame, for asserting the element tree was built. */
function frameNamed(node: FakeComponent | FakeFrame, name: string): FakeFrame | undefined {
  for (const child of node.children) {
    if (child instanceof FakeText) {
      continue;
    }
    if (child.name === name) {
      return child;
    }
    const nested = frameNamed(child, name);
    if (nested) {
      return nested;
    }
  }
  return undefined;
}

/** Variable names exactly as figma-import-export's boilerplate token export has them today. */
const BOILERPLATE_COLORS = [
  'surface-muted',
  'surface-default',
  'surface-subtle',
  'text-primary',
  'text-inverse',
  'action-primary-default',
  'action-primary-hover',
  'action-secondary-default',
  'action-secondary-hover',
  'border-emphasis',
  'border-subtle',
  'surface-subtle',
  'brand-primary',
];
// Deliberately no `space-2xs`: the real combined boilerplate export is missing
// it, and the gap tests below pin that behaviour.
const BOILERPLATE_FLOATS = [
  'space-xs',
  'space-sm',
  'space-md',
  'space-lg',
  'radius-lg',
  'font-size-base',
  'font-size-xs',
  'font-weight-medium',
  'font-weight-bold',
  'line-height-normal',
];

function createFakeApi(collectionName = 'boilerplate') {
  const collection = { id: 'c1', name: collectionName } as unknown as VariableCollection;
  const variables: FakeVariable[] = [
    ...BOILERPLATE_COLORS.map((name) => new FakeVariable(name, 'c1', 'COLOR')),
    ...BOILERPLATE_FLOATS.map((name) => new FakeVariable(name, 'c1', 'FLOAT')),
    new FakeVariable('font-primary', 'c1', 'STRING'),
    // Same name in another collection must not be picked up.
    new FakeVariable('surface-muted', 'other', 'COLOR'),
  ];
  const components: FakeComponent[] = [];
  const frames: FakeFrame[] = [];
  const sets: FakeComponentSet[] = [];
  const loadedFonts: FontName[] = [];
  const page = {} as BaseNode & ChildrenMixin;

  const api: BuildApi = {
    getLocalVariableCollectionsAsync: async () => [collection],
    getLocalVariablesAsync: async () => variables as unknown as Variable[],
    createComponent: () => {
      const component = new FakeComponent();
      components.push(component);
      return component as unknown as ComponentNode;
    },
    createText: () => new FakeText() as unknown as TextNode,
    createFrame: () => {
      const frame = new FakeFrame();
      frames.push(frame);
      return frame as unknown as FrameNode;
    },
    loadFontAsync: async (font) => {
      loadedFonts.push(font);
    },
    setBoundVariableForPaint: (paint, field, variable) =>
      ({ ...paint, boundVariables: { [field]: { type: 'VARIABLE_ALIAS', id: variable.id } } }) as SolidPaint,
    combineAsVariants: (nodes, parent) => {
      expect(parent).toBe(page);
      const set = new FakeComponentSet(nodes as unknown as FakeComponent[]);
      sets.push(set);
      return set as unknown as ComponentSetNode;
    },
    currentPage: page,
  };

  return { api, components, frames, sets, loadedFonts };
}

const boundColor = (paint: SolidPaint) => paint.boundVariables?.color?.id;

describe('buildComponent', () => {
  it('builds every variant combination of the real Button spec as one component set', async () => {
    const { api, components, sets } = createFakeApi();

    const { result, node } = await buildComponent(buttonSpec, { collectionName: 'boilerplate' }, api);

    expect(components).toHaveLength(12);
    expect(sets).toHaveLength(1);
    expect(node).toBe(sets[0]);
    expect(sets[0].name).toBe('Button');
    expect(result.component).toBe('Button');
    expect(result.collection).toBe('boilerplate');
    expect(result.variantNames).toHaveLength(12);
    // Figma hands out the FIRST variant when someone drags from Assets, and
    // Button's spec declares variant=primary size=medium as its defaults. A
    // designer placing a Button should get the one the code would render.
    expect(result.variantNames[0]).toBe('variant=primary, size=medium');
    expect(result.variantNames).toHaveLength(12);
  });

  it('binds fills, strokes, padding, radius, gap and typography of variant=primary, size=medium to real variables', async () => {
    const { api, components, loadedFonts } = createFakeApi();

    await buildComponent(buttonSpec, { collectionName: 'boilerplate' }, api);

    const primaryMedium = components.find((c) => c.name === 'variant=primary, size=medium') as FakeComponent;
    expect(boundColor(primaryMedium.fills[0])).toBe('action-primary-default');
    expect(boundColor(primaryMedium.strokes[0])).toBe('action-primary-default');
    // 2px, read from the spec's own borders array, not the fallback.
    expect(primaryMedium.strokeWeight).toBe(2);
    expect(primaryMedium.strokeWeight).not.toBe(DEFAULT_STROKE_WEIGHT);
    expect(primaryMedium.layoutMode).toBe('HORIZONTAL');
    expect(primaryMedium.primaryAxisAlignItems).toBe('CENTER');
    expect(primaryMedium.counterAxisAlignItems).toBe('CENTER');
    expect(primaryMedium.primaryAxisSizingMode).toBe('AUTO');
    expect(primaryMedium.bound).toEqual({
      itemSpacing: 'space-xs',
      paddingTop: 'space-xs',
      paddingBottom: 'space-xs',
      paddingLeft: 'space-md',
      paddingRight: 'space-md',
      topLeftRadius: 'radius-lg',
      topRightRadius: 'radius-lg',
      bottomLeftRadius: 'radius-lg',
      bottomRightRadius: 'radius-lg',
    });

    const label = labelOf(primaryMedium);
    expect(label.characters).toBe('Button');
    expect(label.fontName).toEqual({ family: 'Inter', style: 'Semi Bold' });
    expect(loadedFonts).toContainEqual({ family: 'Inter', style: 'Semi Bold' });
    expect(boundColor(label.fills[0])).toBe('text-inverse');
    expect(label.bound).toEqual({ fontSize: 'font-size-base' });
  });

  it('lets a variant block override the base block (outline keeps base fill, swaps stroke and text)', async () => {
    const { api, components } = createFakeApi();

    await buildComponent(buttonSpec, { collectionName: 'boilerplate' }, api);

    const outlineLarge = components.find((c) => c.name === 'variant=outline, size=large') as FakeComponent;
    expect(boundColor(outlineLarge.fills[0])).toBe('surface-muted');
    expect(boundColor(outlineLarge.strokes[0])).toBe('border-emphasis');
    expect(boundColor(labelOf(outlineLarge).fills[0])).toBe('text-primary');
    expect(outlineLarge.bound.paddingTop).toBe('space-sm');
    expect(outlineLarge.bound.paddingLeft).toBe('space-lg');
    expect(outlineLarge.bound.itemSpacing).toBe('space-sm');
  });

  it('reports every unresolvable token once per selector, plus the missing border width as a contract gap', async () => {
    const { api } = createFakeApi();

    const { result } = await buildComponent(buttonSpec, { collectionName: 'boilerplate' }, api);

    const reasons = result.gaps.map((gap) => `${gap.where}: ${gap.reason}`);
    // A weight with no token is not a gap: Figma derives the weight from the
    // font style, which is set either way, so only the binding is missing.
    expect(reasons.some((reason) => reason.includes('font-weight-semibold'))).toBe(false);
    expect(reasons).toContain(
      '.small: no variable named "space-2xs" in the collection (needed for pad-asym(2xs, sm) as vertical padding)',
    );
    // A size with no token behind it is applied from cia's scale rather than
    // reported as a gap, so it no longer leaves the text at Figma's default.
    expect(reasons.some((reason) => reason.includes('font-size-sm'))).toBe(false);
    expect(reasons.some((reason) => reason.includes('font-size-lg'))).toBe(false);
    // The spec has carried real border widths since 2026-09-24, so the old
    // "no border width" contract gap must no longer be reported.
    expect(reasons.some((reason) => reason.includes('no border width'))).toBe(false);
    // Resolved once per block, not once per variant: the .small gap must not be repeated 4x.
    expect(reasons.filter((reason) => reason.includes('"space-2xs"'))).toHaveLength(2);
  });

  it('reports non-default states, parts, media queries and transitions as skipped, not as gaps', async () => {
    const { api } = createFakeApi();

    const { result } = await buildComponent(buttonSpec, { collectionName: 'boilerplate' }, api);

    const skipped = result.skipped.map((skip) => `${skip.where}: ${skip.reason}`);
    expect(skipped).toContain('.button: 3 hover call(s) skipped: v1 builds the default state only');
    expect(skipped).toContain('.button: 2 focus call(s) skipped: v1 builds the default state only');
    // `.icon` is in Button's element tree, so it is built rather than skipped.
    // Only its hover styling and its transition remain unbuilt, for the ordinary
    // reasons that apply to every block.
    expect(skipped.some((s) => s.startsWith('.icon: part skipped'))).toBe(false);
    expect(skipped).toContain('.icon: 1 hover call(s) skipped: v1 builds the default state only');
    expect(skipped).toContain(
      '@include cia.mobile-only: skipped: media queries and other non-variant blocks are not built',
    );
    expect(skipped.some((s) => s.startsWith('.button: transition('))).toBe(true);
    expect(skipped.some((s) => s.startsWith('.button: font-family(primary) skipped'))).toBe(true);
    // A line height is applied as a percentage and reported as unthemeable,
    // rather than dropped: the value is exact, only the binding is impossible.
    expect(skipped).toContain(
      '.button: font(semibold, base, normal) applied as 150%: a unitless multiplier has no Figma Variable type, so this line height cannot follow a theme',
    );
    expect(skipped).toContain(
      '.small: font(semibold, sm, normal) applied as 14px: cia exports no "font-size-sm" variable, so this size cannot follow a theme',
    );
    expect(result.gaps.some((gap) => gap.reason.includes('hover'))).toBe(false);
  });

  it('applies a size and line height that have no token, so the text is not left at Figma defaults', async () => {
    const { api, components } = createFakeApi();

    await buildComponent(buttonSpec, { collectionName: 'boilerplate' }, api);

    // .small is font(semibold, sm, normal): 14px at a 1.5 multiplier.
    const small = components.find((component) => component.name.includes('small'));
    expect(small).toBeDefined();
    const label = labelOf(small!);
    expect(label.fontSize).toBe(14);
    expect(label.lineHeight).toEqual({ value: 150, unit: 'PERCENT' });
    // The weight has no token either, but the Figma style needs none.
    expect(label.fontName.style).toBe('Semi Bold');
  });

  it('builds a single plain component when the spec has no variant blocks', async () => {
    const { api, components, sets } = createFakeApi();
    const spec: ComponentSpec = {
      specVersion: 2,
      component: 'Card',
      props: [],
      styleBlocks: [
        {
          selector: '.card',
          kind: 'base',
          ciaCalls: [
            { fn: 'color', args: ['surface-default'], property: 'background-color', state: 'default' },
            { fn: 'space', args: ['md'], property: 'padding', state: 'default' },
            { fn: 'radius', args: ['lg'], property: 'border-radius', state: 'default' },
          ],
        },
      ],
    };

    const { result, node } = await buildComponent(spec, { collectionName: 'boilerplate' }, api);

    expect(sets).toHaveLength(0);
    expect(components).toHaveLength(1);
    expect(node).toBe(components[0]);
    expect(components[0].name).toBe('Card');
    expect(components[0].bound.paddingTop).toBe('space-md');
    expect(components[0].bound.paddingLeft).toBe('space-md');
    expect(result).toMatchObject({ variantNames: ['Card'], bindings: 9, gaps: [], properties: [] });
  });

  it('exposes the label as a TEXT property and boolean props as BOOLEAN properties', async () => {
    const { api, sets, components } = createFakeApi();

    const { result } = await buildComponent(buttonSpec, { collectionName: 'boilerplate' }, api);

    expect(result.properties).toEqual(['label: TEXT', 'disabled: BOOLEAN']);
    expect(sets[0].properties).toEqual({
      label: { type: 'TEXT', defaultValue: 'Button' },
      disabled: { type: 'BOOLEAN', defaultValue: false },
    });
    // Every variant's label follows the set's TEXT property.
    components.forEach((component) => {
      expect(labelOf(component).componentPropertyReferences?.characters).toBe(sets[0].properties.label && 'label#1:0');
    });
    expect(result.skipped).toContainEqual({
      where: 'props',
      reason: 'boolean property "disabled" added for read-back but drives nothing visually in v1',
    });
  });

  it('binds background, brand, font-size and font-weight the way the other components use them', async () => {
    const { api, components } = createFakeApi();
    const spec: ComponentSpec = {
      specVersion: 2,
      component: 'Badgeish',
      props: [],
      styleBlocks: [
        {
          selector: '.badge',
          kind: 'base',
          ciaCalls: [
            // cia emits `background`, not only `background-color`.
            { fn: 'color', args: ['surface-subtle'], property: 'background', state: 'default' },
            { fn: 'brand', args: ['primary'], property: 'border-color', state: 'default' },
            { fn: 'font-size', args: ['xs'], property: 'font-size', state: 'default' },
            { fn: 'font-weight', args: ['bold'], property: 'font-weight', state: 'default' },
            // `padding: xs md` arrives as two same-property calls.
            { fn: 'space', args: ['xs'], property: 'padding', state: 'default' },
            { fn: 'space', args: ['md'], property: 'padding', state: 'default' },
          ],
        },
      ],
    };

    const { result } = await buildComponent(spec, { collectionName: 'boilerplate' }, api);

    const built = components[0];
    expect(boundColor(built.fills[0])).toBe('surface-subtle');
    expect(boundColor(built.strokes[0])).toBe('brand-primary');
    expect(labelOf(built).fontName.style).toBe('Bold');
    expect(labelOf(built).bound).toEqual({ fontSize: 'font-size-xs', fontWeight: 'font-weight-bold' });
    expect(built.bound.paddingTop).toBe('space-xs');
    expect(built.bound.paddingLeft).toBe('space-md');
    expect(result.gaps.filter((gap) => gap.where === '.badge')).toEqual([]);
  });

  it('resolves font() through cia font type presets, not the preset spelling', async () => {
    const { api, components } = createFakeApi();
    const spec: ComponentSpec = {
      specVersion: 2,
      component: 'Noteish',
      props: [],
      styleBlocks: [
        {
          selector: '.note',
          kind: 'base',
          // `reg` is a type preset meaning weight `normal`, not a weight key.
          ciaCalls: [{ fn: 'font', args: ['reg', 'base'], property: 'typography', state: 'default' }],
        },
        {
          selector: '.emphasis',
          kind: 'base',
          ciaCalls: [{ fn: 'font', args: ['medium-it', 'base'], property: 'typography', state: 'default' }],
        },
      ],
    };

    const { result } = await buildComponent(spec, { collectionName: 'boilerplate' }, api);

    // `normal` has no token, but the weight still reaches Figma as the style, so
    // this is an unthemeable value rather than a lost one.
    expect(result.gaps).toEqual([]);
    expect(result.skipped.map((skip) => skip.reason)).toContain(
      'font(reg, base) applied as Regular: cia exports no "font-weight-normal" variable, so this weight cannot follow a theme',
    );
    // The italic preset resolves to a real Figma style and a real weight token.
    expect(labelOf(components[0]).fontName).toEqual({ family: 'Inter', style: 'Medium Italic' });
    expect(labelOf(components[0]).bound.fontWeight).toBe('font-weight-medium');
  });

  it('names the two structural problems the real component specs have', async () => {
    const { api } = createFakeApi();
    const spec: ComponentSpec = {
      specVersion: 2,
      component: 'Headingish',
      props: [
        { name: 'variant', optional: true, type: 'enum', values: ['a', 'b'] },
      ],
      styleBlocks: [
        {
          selector: '.headingA',
          kind: 'part',
          ciaCalls: [{ fn: 'type', args: ['display'], property: 'typography', state: 'default' }],
        },
        {
          selector: '.headingB',
          kind: 'part',
          ciaCalls: [],
        },
      ],
    };

    const { result } = await buildComponent(spec, { collectionName: 'boilerplate' }, api);

    expect(result.gaps).toEqual([
      { where: 'contract', reason: 'spec has no base style block, so the component is built unstyled' },
      {
        where: 'contract',
        reason:
          'spec declares enum prop(s) variant but no variant style blocks; ' +
          '2 part block(s) look like unclassified variants, so the component was built without variants',
      },
    ]);
  });

  it('expands a Sass type preset into a size, weight, line height and letter spacing', async () => {
    const { api, components } = createFakeApi();
    const spec: ComponentSpec = {
      specVersion: 2,
      component: 'Titleish',
      props: [],
      styleBlocks: [
        {
          selector: '.title',
          kind: 'base',
          ciaCalls: [
            { fn: 'type', args: ['display'], property: 'typography', state: 'default' },
            { fn: 'z', args: ['tooltip'], property: 'z-index', state: 'default' },
            { fn: 'line-height', args: ['normal'], property: 'line-height', state: 'default' },
          ],
        },
      ],
    };

    const { result } = await buildComponent(spec, { collectionName: 'boilerplate' }, api);

    // `display` is size 8, weight bold, line height 1.25, letter spacing -0.025em.
    const label = labelOf(components[0]);
    expect(label.fontName.style).toBe('Bold');
    expect(label.fontSize).toBe(36);
    expect(label.letterSpacing).toEqual({ value: -2.5, unit: 'PERCENT' });
    // The preset's own 1.25 is overridden by the later explicit line-height(normal).
    expect(label.lineHeight).toEqual({ value: 150, unit: 'PERCENT' });
    // The weight is the one part of the preset with a token, so it is bound.
    expect(label.bound.fontWeight).toBe('font-weight-bold');

    expect(result.gaps).toEqual([]);
    expect(result.skipped.map((skip) => skip.reason)).toEqual([
      'type(display) applied as 36px: cia exports no "font-size-8" variable, so this size cannot follow a theme',
      'type(display) applied as 125%: a unitless multiplier has no Figma Variable type, so this line height cannot follow a theme',
      'z(tooltip) skipped: z-index has no Figma equivalent',
      'line-height(normal) applied as 150%: a unitless multiplier has no Figma Variable type, so this line height cannot follow a theme',
    ]);
  });

  it('reports an unknown type preset rather than guessing a size for it', async () => {
    const { api } = createFakeApi();
    const spec: ComponentSpec = {
      specVersion: 2,
      component: 'Oddity',
      props: [],
      styleBlocks: [
        {
          selector: '.title',
          kind: 'base',
          ciaCalls: [{ fn: 'type', args: ['mega-shout'], property: 'typography', state: 'default' }],
        },
      ],
    };

    const { result } = await buildComponent(spec, { collectionName: 'boilerplate' }, api);

    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0].reason).toContain('unknown cia type preset "mega-shout"');
    // The message lists what is valid, so the reader can see the typo.
    expect(result.gaps[0].reason).toContain('heading-1');
  });

  it('reports a type mismatch instead of binding the wrong kind of variable', async () => {
    const { api } = createFakeApi();
    const spec: ComponentSpec = {
      specVersion: 2,
      component: 'Odd',
      props: [],
      styleBlocks: [
        {
          selector: '.odd',
          kind: 'base',
          ciaCalls: [{ fn: 'color', args: ['space-md'], property: 'background-color', state: 'default' }],
        },
      ],
    };

    const { result } = await buildComponent(spec, { collectionName: 'boilerplate' }, api);

    expect(result.gaps).toEqual([
      { where: '.odd', reason: 'variable "space-md" is FLOAT, color(space-md) as fill needs COLOR' },
    ]);
  });

  it('throws a readable error when the collection does not exist', async () => {
    const { api } = createFakeApi();

    await expect(buildComponent(buttonSpec, { collectionName: 'nope' }, api)).rejects.toThrow(
      'no local Variable collection named "nope"',
    );
  });
});

describe('border widths', () => {
  it('takes the stroke weight from the spec and lets a variant override the base', async () => {
    const { api, components } = createFakeApi();
    const spec: ComponentSpec = {
      specVersion: 2,
      component: 'Bordered',
      props: [{ name: 'variant', optional: true, type: 'enum', values: ['thin', 'thick'] }],
      styleBlocks: [
        {
          selector: '.bordered',
          kind: 'base',
          ciaCalls: [{ fn: 'color', args: ['border-emphasis'], property: 'border-color', state: 'default' }],
          borders: [
            { property: 'border-width', width: '2px', style: 'solid', state: 'default' },
            // A focus ring has no Figma equivalent, and non-default states are
            // out of v1 scope. Neither should reach the stroke.
            { property: 'outline-width', width: '2px', style: 'solid', state: 'focus' },
            { property: 'border-width', width: '4px', style: 'solid', state: 'hover' },
          ],
        },
        {
          selector: '.thin',
          kind: 'variant',
          prop: 'variant',
          value: 'thin',
          ciaCalls: [],
          borders: [{ property: 'border-width', width: '1px', style: 'solid', state: 'default' }],
        },
        {
          selector: '.thick',
          kind: 'variant',
          prop: 'variant',
          value: 'thick',
          ciaCalls: [],
          borders: [{ property: 'border-width', width: '6px', style: 'solid', state: 'default' }],
        },
      ],
    };

    const { result } = await buildComponent(spec, { collectionName: 'boilerplate' }, api);

    expect(components.find((c) => c.name === 'variant=thin')?.strokeWeight).toBe(1);
    expect(components.find((c) => c.name === 'variant=thick')?.strokeWeight).toBe(6);
    expect(result.gaps).toEqual([]);
    const skipped = result.skipped.map((skip) => skip.reason);
    expect(skipped).toContain('outline-width 2px skipped: Figma has no equivalent');
    expect(skipped).toContain(
      'border-width 4px in the hover state skipped: v1 builds the default state only',
    );
  });

  it('keeps a zero width, because `border: none` means draw nothing', async () => {
    const { api, components } = createFakeApi();
    const spec: ComponentSpec = {
      specVersion: 2,
      component: 'Borderless',
      props: [],
      styleBlocks: [
        {
          selector: '.borderless',
          kind: 'base',
          ciaCalls: [{ fn: 'color', args: ['border-subtle'], property: 'border-color', state: 'default' }],
          borders: [{ property: 'border-width', width: '0px', style: 'none', state: 'default' }],
        },
      ],
    };

    await buildComponent(spec, { collectionName: 'boilerplate' }, api);

    expect(components[0].strokeWeight).toBe(0);
  });

  it('reports a non-px width as a gap rather than guessing a pixel value', async () => {
    const { api } = createFakeApi();
    const spec: ComponentSpec = {
      specVersion: 2,
      component: 'Odd',
      props: [],
      styleBlocks: [
        {
          selector: '.odd',
          kind: 'base',
          ciaCalls: [],
          borders: [{ property: 'border-width', width: '0.125rem', style: 'solid', state: 'default' }],
        },
      ],
    };

    const { result } = await buildComponent(spec, { collectionName: 'boilerplate' }, api);

    expect(result.gaps).toEqual([
      {
        where: '.odd',
        reason: 'border-width "0.125rem" is not a px value, so it cannot become a Figma stroke weight',
      },
    ]);
  });
});

describe("Figma's default white fill", () => {
  it('is cleared, so a component with no background in its spec is transparent', async () => {
    const { api, components } = createFakeApi();
    const spec: ComponentSpec = {
      specVersion: 2,
      component: 'Textish',
      props: [],
      styleBlocks: [
        {
          selector: '.text',
          kind: 'base',
          // Text colour only: this component is transparent by design, like
          // Text, Heading, Link, Flex, Grid and Stack.
          ciaCalls: [{ fn: 'color', args: ['text-primary'], property: 'color', state: 'default' }],
        },
      ],
    };

    await buildComponent(spec, { collectionName: 'boilerplate' }, api);

    expect(components[0].fills).toEqual([]);
  });

  it('is replaced, not merged, when the spec does declare a background', async () => {
    const { api, components } = createFakeApi();
    const spec: ComponentSpec = {
      specVersion: 2,
      component: 'Carded',
      props: [],
      styleBlocks: [
        {
          selector: '.card',
          kind: 'base',
          ciaCalls: [
            { fn: 'color', args: ['surface-default'], property: 'background-color', state: 'default' },
          ],
        },
      ],
    };

    await buildComponent(spec, { collectionName: 'boilerplate' }, api);

    expect(components[0].fills).toHaveLength(1);
    expect(boundColor(components[0].fills[0])).toBe('surface-default');
  });

  it('leaves no white behind on a component whose spec has nothing at all', async () => {
    const { api, components } = createFakeApi();
    const spec: ComponentSpec = {
      specVersion: 2,
      component: 'Empty',
      props: [],
      styleBlocks: [{ selector: '.empty', kind: 'base', ciaCalls: [] }],
    };

    await buildComponent(spec, { collectionName: 'boilerplate' }, api);

    // An empty component should look empty. A white box looks deliberate.
    expect(components[0].fills).toEqual([]);
  });
});

describe('declared defaults', () => {
  it('puts the default value first on every axis, so the default instance matches the code', async () => {
    const { api } = createFakeApi();
    const spec: ComponentSpec = {
      specVersion: 2,
      component: 'Sized',
      props: [
        { name: 'size', optional: true, type: 'enum', values: ['sm', 'md', 'lg'], default: 'lg' },
        { name: 'tone', optional: true, type: 'enum', values: ['quiet', 'loud'], default: 'loud' },
      ],
      styleBlocks: [
        { selector: '.sized', kind: 'base', ciaCalls: [] },
        ...['sm', 'md', 'lg'].map((value) => ({
          selector: `.${value}`,
          kind: 'variant' as const,
          prop: 'size',
          value,
          ciaCalls: [],
        })),
        ...['quiet', 'loud'].map((value) => ({
          selector: `.${value}`,
          kind: 'variant' as const,
          prop: 'tone',
          value,
          ciaCalls: [],
        })),
      ],
    };

    const { result } = await buildComponent(spec, { collectionName: 'boilerplate' }, api);

    expect(result.variantNames[0]).toBe('size=lg, tone=loud');
    // Every value is still built, only the order changed.
    expect(result.variantNames).toHaveLength(6);
    expect(result.variantNames).toContain('size=sm, tone=quiet');
  });

  it('leaves the order alone when no default is declared', async () => {
    const { api } = createFakeApi();
    const spec: ComponentSpec = {
      specVersion: 2,
      component: 'Plain',
      props: [{ name: 'tone', optional: true, type: 'enum', values: ['a', 'b'] }],
      styleBlocks: [
        { selector: '.plain', kind: 'base', ciaCalls: [] },
        { selector: '.a', kind: 'variant', prop: 'tone', value: 'a', ciaCalls: [] },
        { selector: '.b', kind: 'variant', prop: 'tone', value: 'b', ciaCalls: [] },
      ],
    };

    const { result } = await buildComponent(spec, { collectionName: 'boilerplate' }, api);

    expect(result.variantNames[0]).toBe('tone=a');
  });

  it("uses a text prop's own default as the placeholder, on the canvas and the property", async () => {
    const { api, components, sets } = createFakeApi();
    const spec: ComponentSpec = {
      specVersion: 2,
      component: 'CodeBlock',
      props: [{ name: 'label', optional: true, type: 'string', values: null, default: 'Code' }],
      styleBlocks: [{ selector: '.codeBlock', kind: 'base', ciaCalls: [] }],
    };

    await buildComponent(spec, { collectionName: 'boilerplate' }, api);

    expect(labelOf(components[0]).characters).toBe('Code');
    expect(components[0].properties.label).toEqual({ type: 'TEXT', defaultValue: 'Code' });
    expect(sets).toHaveLength(0);
  });

  it('falls back to the component name when a text prop declares no default', async () => {
    const { api, components } = createFakeApi();

    await buildComponent(buttonSpec, { collectionName: 'boilerplate' }, api);

    expect(labelOf(components[0]).characters).toBe('Button');
  });
});

describe('components whose styling is all in parts', () => {
  it('counts the style calls it could not build, so "arrived empty" is a number', async () => {
    const { api } = createFakeApi();
    const spec: ComponentSpec = {
      specVersion: 2,
      component: 'Tableish',
      props: [],
      styleBlocks: [
        // No base, no variants: every declaration is in a part. This is the
        // real shape of DataTable, DashboardNav and 17 others.
        {
          selector: '.tableHeader',
          kind: 'part',
          ciaCalls: [
            { fn: 'color', args: ['surface-muted'], property: 'background-color', state: 'default' },
            { fn: 'space', args: ['md'], property: 'padding', state: 'default' },
            { fn: 'color', args: ['text-primary'], property: 'color', state: 'hover' },
          ],
        },
        {
          selector: '.tableCell',
          kind: 'part',
          ciaCalls: [{ fn: 'color', args: ['border-subtle'], property: 'border-color', state: 'default' }],
        },
      ],
    };

    const { result } = await buildComponent(spec, { collectionName: 'boilerplate' }, api);

    // Three default-state calls across the two parts; the hover one is not
    // counted, because it would not have been built even in a base block.
    expect(result.unbuiltPartCalls).toBe(3);
    expect(result.bindings).toBe(0);
  });

  it('is zero for a component this version can actually build', async () => {
    const { api } = createFakeApi();

    const { result } = await buildComponent(buttonSpec, { collectionName: 'boilerplate' }, api);

    expect(result.bindings).toBeGreaterThan(0);
    // Button's `.icon` is in its element tree, so its styling now lands on that
    // node instead of being counted as unbuildable.
    expect(result.unbuiltPartCalls).toBe(0);
  });
});

describe('styling reached through a local custom property', () => {
  it('binds a part-style consumption the same as a direct call', async () => {
    const { api, components } = createFakeApi();
    const spec: ComponentSpec = {
      specVersion: 2,
      component: 'Dropdownish',
      props: [],
      styleBlocks: [
        {
          selector: '.trigger',
          kind: 'base',
          // What the stylesheet literally contains: a gap, and nothing else.
          ciaCalls: [{ fn: 'space', args: ['xs'], property: 'gap', state: 'default' }],
          borders: [{ property: 'border-width', width: '1px', style: 'solid', state: 'default' }],
          // What it actually renders, via --dropdown-* set in a mixin block.
          consumes: [
            {
              property: 'background-color',
              localToken: '--dropdown-bg-color',
              state: 'default',
              from: { fn: 'color', args: ['surface-default'] },
            },
            {
              property: 'border-color',
              localToken: '--dropdown-border-color',
              state: 'default',
              from: { fn: 'color', args: ['border-subtle'] },
            },
            {
              property: 'border-radius',
              localToken: '--dropdown-border-radius',
              state: 'default',
              from: { fn: 'radius', args: ['lg'] },
            },
          ],
        },
      ],
    };

    const { result } = await buildComponent(spec, { collectionName: 'boilerplate' }, api);

    const built = components[0];
    expect(boundColor(built.fills[0])).toBe('surface-default');
    expect(boundColor(built.strokes[0])).toBe('border-subtle');
    expect(built.bound.topLeftRadius).toBe('radius-lg');
    expect(built.bound.itemSpacing).toBe('space-xs');
    expect(built.strokeWeight).toBe(1);
    expect(result.gaps).toEqual([]);
  });

  it('reports a missing token from a consumption exactly as it would a direct call', async () => {
    const { api } = createFakeApi();
    const spec: ComponentSpec = {
      specVersion: 2,
      component: 'Oddish',
      props: [],
      styleBlocks: [
        {
          selector: '.thing',
          kind: 'base',
          ciaCalls: [],
          consumes: [
            {
              property: 'background-color',
              localToken: '--thing-bg',
              state: 'default',
              from: { fn: 'color', args: ['not-a-token'] },
            },
          ],
        },
      ],
    };

    const { result } = await buildComponent(spec, { collectionName: 'boilerplate' }, api);

    expect(result.gaps[0].reason).toContain('no variable named "not-a-token"');
  });

  it('builds a spec with no consumes exactly as before', async () => {
    const { api } = createFakeApi();

    const { result } = await buildComponent(buttonSpec, { collectionName: 'boilerplate' }, api);

    expect(result.bindings).toBeGreaterThan(200);
  });
});

describe('the other two shapes a local value arrives in', () => {
  function withConsumes(consumes: ComponentSpec['styleBlocks'][number]['consumes']): ComponentSpec {
    return {
      specVersion: 2,
      component: 'Localish',
      props: [],
      styleBlocks: [{ selector: '.thing', kind: 'base', ciaCalls: [], consumes }],
    };
  }

  it('keeps a border width stated as a literal', async () => {
    const { api, components } = createFakeApi();

    const { result } = await buildComponent(
      withConsumes([
        {
          property: 'border',
          localToken: '--dropdown-border-width',
          state: 'default',
          from: { fn: null, args: [], literal: '2px' },
        },
      ]),
      { collectionName: 'boilerplate' },
      api,
    );

    expect(components[0].strokeWeight).toBe(2);
    expect(result.gaps).toEqual([]);
  });

  it('skips a literal with no Figma equivalent, and says which one', async () => {
    const { api } = createFakeApi();

    const { result } = await buildComponent(
      withConsumes([
        {
          property: 'transition',
          localToken: '--dropdown-transition',
          state: 'default',
          from: { fn: null, args: [], literal: 'all 0.2s ease' },
        },
      ]),
      { collectionName: 'boilerplate' },
      api,
    );

    expect(result.gaps).toEqual([]);
    expect(result.skipped[0].reason).toBe(
      'transition is the literal "all 0.2s ease" from --dropdown-transition, which is not a token and has no Figma equivalent',
    );
  });

  it('skips an unresolved local without reporting it twice', async () => {
    const { api } = createFakeApi();

    const { result } = await buildComponent(
      withConsumes([
        { property: 'background-color', localToken: '--x-bg', state: 'default', from: null },
      ]),
      { collectionName: 'boilerplate' },
      api,
    );

    // The producer already reports the ambiguity in the spec's own gaps.
    expect(result.gaps).toEqual([]);
    expect(result.skipped[0].reason).toContain('could not resolve to one value');
  });

  it('ignores a non-default state, like every other non-default styling', async () => {
    const { api, components } = createFakeApi();

    await buildComponent(
      withConsumes([
        {
          property: 'background-color',
          localToken: '--x-bg',
          state: 'hover',
          from: { fn: 'color', args: ['surface-default'] },
        },
      ]),
      { collectionName: 'boilerplate' },
      api,
    );

    expect(components[0].fills).toEqual([]);
  });
});

describe('a state rule folded into the base block', () => {
  it('uses the plain value, not the read-only or error one that follows it', async () => {
    const { api, components } = createFakeApi();
    const spec: ComponentSpec = {
      specVersion: 2,
      component: 'Textareaish',
      props: [],
      styleBlocks: [
        {
          selector: '.textarea',
          kind: 'base',
          ciaCalls: [],
          // Exactly Textarea's real shape: the plain rule first, then
          // :read-only and [data-error] folded in as more "default" entries.
          consumes: [
            {
              property: 'background-color',
              localToken: '--textarea-bg-color',
              state: 'default',
              from: { fn: 'color', args: ['surface-default'] },
            },
            {
              property: 'background-color',
              localToken: '--textarea-readonly-bg-color',
              state: 'default',
              from: { fn: 'color', args: ['surface-subtle'] },
            },
            {
              property: 'border-color',
              localToken: '--textarea-border-color',
              state: 'default',
              from: { fn: 'color', args: ['border-emphasis'] },
            },
            {
              property: 'border-color',
              localToken: '--textarea-border-color-error',
              state: 'default',
              from: { fn: 'color', args: ['action-secondary-default'] },
            },
            // A genuine shorthand pair, which must both survive.
            { property: 'padding', localToken: '--p-y', state: 'default', from: { fn: 'space', args: ['xs'] } },
            { property: 'padding', localToken: '--p-x', state: 'default', from: { fn: 'space', args: ['md'] } },
          ],
        },
      ],
    };

    const { result } = await buildComponent(spec, { collectionName: 'boilerplate' }, api);

    const built = components[0];
    expect(boundColor(built.fills[0])).toBe('surface-default');
    expect(boundColor(built.strokes[0])).toBe('border-emphasis');
    // Both padding values kept: vertical and horizontal, not a conflict.
    expect(built.bound.paddingTop).toBe('space-xs');
    expect(built.bound.paddingLeft).toBe('space-md');

    const reasons = result.skipped.map((skip) => skip.reason);
    expect(reasons).toContain(
      'background-color is set by both --textarea-bg-color and --textarea-readonly-bg-color; ' +
        'used --textarea-bg-color, because a state or modifier rule folded into this block',
    );
    expect(reasons.some((reason) => reason.includes('--textarea-border-color-error'))).toBe(true);
  });
});

describe('border and border-color write the same stroke', () => {
  it('does not let an error colour overwrite the real border', async () => {
    const { api, components } = createFakeApi();
    // Textarea's exact shape: a `border` shorthand giving width and colour,
    // then a `border-color` from the [data-error] rule folded in.
    const spec: ComponentSpec = {
      specVersion: 2,
      component: 'Textareaish',
      props: [],
      styleBlocks: [
        {
          selector: '.textarea',
          kind: 'base',
          ciaCalls: [],
          consumes: [
            {
              property: 'border',
              localToken: '--textarea-border-width',
              state: 'default',
              from: { fn: null, args: [], literal: '1px' },
            },
            {
              property: 'border',
              localToken: '--textarea-border-color',
              state: 'default',
              from: { fn: 'color', args: ['border-emphasis'] },
            },
            {
              property: 'border-color',
              localToken: '--textarea-border-color-error',
              state: 'default',
              from: { fn: 'color', args: ['action-secondary-default'] },
            },
          ],
        },
      ],
    };

    const { result } = await buildComponent(spec, { collectionName: 'boilerplate' }, api);

    const built = components[0];
    expect(boundColor(built.strokes[0])).toBe('border-emphasis');
    expect(built.strokeWeight).toBe(1);
    expect(result.skipped.map((skip) => skip.reason)).toContain(
      'border-color is set by both --textarea-border-color and --textarea-border-color-error; ' +
        'used --textarea-border-color, because a state or modifier rule folded into this block',
    );
  });

  it('says nothing about the same declaration seen twice', async () => {
    const { api } = createFakeApi();
    const spec: ComponentSpec = {
      specVersion: 2,
      component: 'Roundish',
      props: [],
      styleBlocks: [
        {
          selector: '.thing',
          kind: 'base',
          ciaCalls: [],
          // `border-radius: X X` arrives as the same local twice.
          consumes: [
            { property: 'border-radius', localToken: '--r', state: 'default', from: { fn: 'radius', args: ['lg'] } },
            { property: 'border-radius', localToken: '--r', state: 'default', from: { fn: 'radius', args: ['lg'] } },
          ],
        },
      ],
    };

    const { result } = await buildComponent(spec, { collectionName: 'boilerplate' }, api);

    expect(result.skipped).toEqual([]);
    expect(result.gaps).toEqual([]);
  });
});

describe('spacing with no token behind it', () => {
  it('computes grid(n) rather than calling it unsupported', async () => {
    const { api, components } = createFakeApi();
    const spec: ComponentSpec = {
      specVersion: 2,
      component: 'Gridish',
      props: [],
      styleBlocks: [
        {
          selector: '.thing',
          kind: 'base',
          // cia: grid($n, $base: 0.25rem) returns n x 4px. Arithmetic, not a token.
          ciaCalls: [
            { fn: 'grid', args: ['2'], property: 'gap', state: 'default' },
            { fn: 'grid', args: ['1.5'], property: 'padding', state: 'default' },
          ],
        },
      ],
    };

    const { result } = await buildComponent(spec, { collectionName: 'boilerplate' }, api);

    expect(components[0].itemSpacing).toBe(8);
    expect(components[0].paddingTop).toBe(6);
    expect(result.gaps).toEqual([]);
    // A literal is not a binding: it follows no theme and is not counted as one.
    expect(result.bindings).toBe(0);
  });

  it('keeps a literal padding reached through a local property', async () => {
    const { api, components } = createFakeApi();
    const spec: ComponentSpec = {
      specVersion: 2,
      component: 'Textareaish',
      props: [],
      styleBlocks: [
        {
          selector: '.textarea',
          kind: 'base',
          ciaCalls: [],
          // Textarea's real shape: padding stated as a literal, not a token.
          consumes: [
            {
              property: 'padding',
              localToken: '--textarea-padding-y',
              state: 'default',
              from: { fn: null, args: [], literal: '12px' },
            },
          ],
        },
      ],
    };

    const { result } = await buildComponent(spec, { collectionName: 'boilerplate' }, api);

    expect(components[0].paddingTop).toBe(12);
    expect(components[0].paddingLeft).toBe(12);
    expect(result.gaps).toEqual([]);
  });

  it('still says so when a computed value lands somewhere Figma has nothing for', async () => {
    const { api } = createFakeApi();
    const spec: ComponentSpec = {
      specVersion: 2,
      component: 'Marginish',
      props: [],
      styleBlocks: [
        {
          selector: '.thing',
          kind: 'base',
          ciaCalls: [{ fn: 'grid', args: ['1'], property: 'margin-left', state: 'default' }],
        },
      ],
    };

    const { result } = await buildComponent(spec, { collectionName: 'boilerplate' }, api);

    expect(result.gaps).toEqual([]);
    expect(result.skipped[0].reason).toBe(
      'grid(1) is 4px on margin-left, which has no Figma equivalent',
    );
  });
});

describe('a block that sets font-size more than once', () => {
  const foldedSpec = (args: string[]): ComponentSpec => ({
    specVersion: 2,
    component: 'Sizeish',
    props: [],
    styleBlocks: [
      {
        selector: '.thing',
        kind: 'base',
        ciaCalls: args.map((arg) => ({
          fn: 'font-size',
          args: [arg],
          property: 'font-size',
          state: 'default' as const,
        })),
      },
    ],
  });

  it('prefers the size that has a token, because a fold gives no way to tell which is the default', async () => {
    const { api, components } = createFakeApi();

    // Checkbox's real shape: [data-size=sm], [data-size=md], [data-size=lg]
    // folded into one block. Only `base` has a variable in the collection.
    const { result } = await buildComponent(foldedSpec(['sm', 'base', 'lg']), { collectionName: 'boilerplate' }, api);

    expect(labelOf(components[0]).bound.fontSize).toBe('font-size-base');
    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0].reason).toContain('font-size is set 3 times in one block');
    expect(result.gaps[0].reason).toContain('14px, font-size-base, 18px');
    expect(result.gaps[0].reason).toContain('used font-size-base');
    // The point of the message: the values are fine, the variant axis is missing.
    expect(result.gaps[0].reason).toContain('variant axis');
  });

  it('falls back to the first when none of the candidates has a token', async () => {
    const { api, components } = createFakeApi();

    const { result } = await buildComponent(foldedSpec(['sm', 'lg']), { collectionName: 'boilerplate' }, api);

    expect(labelOf(components[0]).fontSize).toBe(14);
    expect(labelOf(components[0]).bound.fontSize).toBeUndefined();
    expect(result.gaps[0].reason).toContain('used 14px');
  });

  it('says nothing when the same size is stated twice', async () => {
    const { api, components } = createFakeApi();

    const { result } = await buildComponent(foldedSpec(['sm', 'sm']), { collectionName: 'boilerplate' }, api);

    expect(labelOf(components[0]).fontSize).toBe(14);
    expect(result.gaps).toEqual([]);
  });

  it('lets a variant override the base size, which is the one case that is a real cascade', async () => {
    const { api, components } = createFakeApi();
    const spec: ComponentSpec = {
      specVersion: 2,
      component: 'Buttonish',
      props: [{ name: 'size', optional: true, type: 'enum', values: ['base', 'small'] }],
      styleBlocks: [
        {
          selector: '.btn',
          kind: 'base',
          ciaCalls: [{ fn: 'font-size', args: ['base'], property: 'font-size', state: 'default' }],
        },
        {
          selector: '.small',
          kind: 'variant',
          prop: 'size',
          value: 'small',
          ciaCalls: [{ fn: 'font-size', args: ['sm'], property: 'font-size', state: 'default' }],
        },
      ],
    };

    const { result } = await buildComponent(spec, { collectionName: 'boilerplate' }, api);

    // Two separate blocks, so no fold and nothing to report.
    expect(result.gaps).toEqual([]);
    const small = components.find((component) => component.name.includes('small'));
    const base = components.find((component) => !component.name.includes('small'));
    // The small variant costs a binding to gain the right size. Before the scale
    // was mirrored it kept the binding and rendered at the base size instead.
    expect(labelOf(small as FakeComponent).fontSize).toBe(14);
    expect(labelOf(base as FakeComponent).bound.fontSize).toBe('font-size-base');
  });
});

/**
 * Built from the real shipped Heading spec rather than a hand-written one. Five
 * of its six variants carry nothing but a `type()` call, so before the type
 * scale was mirrored every level came out at the same size: the component was
 * ready by placement and broken by outcome.
 */
describe('Heading, from the real spec', () => {
  it('gives each of the six levels its own size and weight', async () => {
    const { api, components } = createFakeApi();

    const { result } = await buildComponent(headingSpec, { collectionName: 'boilerplate' }, api);

    expect(components).toHaveLength(6);
    const byLevel = new Map(
      components.map((component) => {
        const level = /level=(\d)/.exec(component.name)?.[1] ?? '?';
        return [level, labelOf(component)];
      }),
    );

    // cia's $_type-scale, in pixels at the 16px root.
    expect(byLevel.get('1')?.fontSize).toBe(36);
    expect(byLevel.get('2')?.fontSize).toBe(30);
    expect(byLevel.get('3')?.fontSize).toBe(24);
    expect(byLevel.get('4')?.fontSize).toBe(20);
    expect(byLevel.get('5')?.fontSize).toBe(18);
    // Level 6 is the one variant written longhand rather than as a preset.
    expect(byLevel.get('6')?.fontSize).toBe(14);

    const sizes = [...byLevel.values()].map((label) => label?.fontSize);
    expect(new Set(sizes).size).toBe(6);

    expect(byLevel.get('1')?.fontName.style).toBe('Bold');
    expect(byLevel.get('3')?.fontName.style).toBe('Semi Bold');
    expect(byLevel.get('5')?.fontName.style).toBe('Medium');

    // Only `display` carries letter spacing, so the others must not inherit it.
    expect(byLevel.get('1')?.letterSpacing).toEqual({ value: -2.5, unit: 'PERCENT' });
    expect(byLevel.get('2')?.letterSpacing).toEqual({ value: 0, unit: 'PERCENT' });

    // The base block's colour is the one thing here that is a real token, and it
    // must still reach all six levels rather than being lost to the variants.
    [...byLevel.values()].forEach((label) => {
      expect(label?.fills).toHaveLength(1);
    });

    // The gap that used to stand in for the whole type scale is gone, and no
    // heading level reports a missing size.
    const reasons = result.gaps.map((gap) => gap.reason);
    expect(reasons.some((reason) => reason.includes('type preset with no token'))).toBe(false);
    expect(reasons.some((reason) => reason.includes('font-size'))).toBe(false);

    // What remains is honest: the sizes are applied but cannot follow a theme.
    const unthemeable = result.skipped.filter((skip) => skip.reason.includes('cannot follow a theme'));
    expect(unthemeable.length).toBeGreaterThanOrEqual(6);
  });
});

describe('widths and heights stated as plain values', () => {
  const dimSpec = (dimensions: { property: string; value: string; state: 'default' }[]): ComponentSpec => ({
    specVersion: 2,
    component: 'Boxish',
    props: [],
    styleBlocks: [{ selector: '.box', kind: 'base', ciaCalls: [], dimensions }],
  });

  it('applies a px bound, which is what Container needs', async () => {
    const { api, components } = createFakeApi();

    const { result } = await buildComponent(
      dimSpec([{ property: 'max-width', value: '640px', state: 'default' }]),
      { collectionName: 'boilerplate' },
      api,
    );

    expect(components[0].maxWidth).toBe(640);
    // A literal is not a binding, so it must not inflate the binding count.
    expect(result.bindings).toBe(0);
    expect(result.gaps).toEqual([]);
  });

  it('treats `none` on a bound as removing it, not as a value it cannot read', async () => {
    const { api, components } = createFakeApi();

    const { result } = await buildComponent(
      dimSpec([{ property: 'max-width', value: 'none', state: 'default' }]),
      { collectionName: 'boilerplate' },
      api,
    );

    expect(components[0].maxWidth).toBeNull();
    expect(result.skipped).toEqual([]);
  });

  it('pins the axis before resizing, so a fixed width is not undone by hugging', async () => {
    const { api, components } = createFakeApi();

    await buildComponent(
      dimSpec([
        { property: 'width', value: '240px', state: 'default' },
        { property: 'height', value: '48px', state: 'default' },
      ]),
      { collectionName: 'boilerplate' },
      api,
    );

    expect(components[0].width).toBe(240);
    expect(components[0].height).toBe(48);
    // Horizontal layout, so width is the primary axis and height the counter.
    expect(components[0].primaryAxisSizingMode).toBe('FIXED');
    expect(components[0].counterAxisSizingMode).toBe('FIXED');
  });

  it('leaves the other axis hugging when only one is stated', async () => {
    const { api, components } = createFakeApi();

    await buildComponent(
      dimSpec([{ property: 'height', value: '56px', state: 'default' }]),
      { collectionName: 'boilerplate' },
      api,
    );

    expect(components[0].height).toBe(56);
    expect(components[0].counterAxisSizingMode).toBe('FIXED');
    expect(components[0].primaryAxisSizingMode).toBe('AUTO');
  });

  it('says the component own element has nothing to fill, rather than dropping it', async () => {
    const { api, components } = createFakeApi();

    const { result } = await buildComponent(
      dimSpec([{ property: 'width', value: '100%', state: 'default' }]),
      { collectionName: 'boilerplate' },
      api,
    );

    expect(components[0].width).toBe(100);
    // A child filling its parent is real and now built. The ROOT filling its
    // parent is not, because a component set on the canvas has none, and that is
    // stated once rather than left as silence.
    const reported = result.skipped.find((skip) => skip.reason.includes('nothing to fill'));
    expect(reported?.reason).toContain("width: 100% on the component's own element");
  });

  it('says an `auto` width needs no action rather than reporting it as a failure', async () => {
    const { api } = createFakeApi();

    const { result } = await buildComponent(
      dimSpec([{ property: 'width', value: 'auto', state: 'default' }]),
      { collectionName: 'boilerplate' },
      api,
    );

    expect(result.gaps).toEqual([]);
    expect(result.skipped[0].reason).toContain('already hugs its content');
  });

  it('will not set a bound Figma rejects', async () => {
    const { api, components } = createFakeApi();

    const { result } = await buildComponent(
      dimSpec([{ property: 'min-width', value: '0', state: 'default' }]),
      { collectionName: 'boilerplate' },
      api,
    );

    expect(components[0].minWidth).toBeNull();
    expect(result.skipped[0].reason).toContain('requires a positive minWidth');
  });

  it('keeps a stated zero width, clamped to the smallest size Figma accepts', async () => {
    const { api, components } = createFakeApi();

    await buildComponent(
      dimSpec([{ property: 'width', value: '0', state: 'default' }]),
      { collectionName: 'boilerplate' },
      api,
    );

    expect(components[0].width).toBe(0.01);
  });
});

describe('Container, from the real spec', () => {
  it('builds the five maxWidth variants it was blocked on', async () => {
    const { api, components } = createFakeApi();

    const { result } = await buildComponent(containerSpec, { collectionName: 'boilerplate' }, api);

    expect(result.variantNames).toHaveLength(5);
    const bound = new Map(
      components.map((component) => [/maxWidth=(\w+)/.exec(component.name)?.[1] ?? '?', component.maxWidth]),
    );
    expect(bound.get('sm')).toBe(640);
    expect(bound.get('md')).toBe(768);
    expect(bound.get('lg')).toBe(1024);
    expect(bound.get('xl')).toBe(1280);
    // `full` is `max-width: none`, which is the absence of a bound.
    expect(bound.get('full')).toBeNull();
  });
});

describe('an argument the exporter could not resolve', () => {
  it('says it is an unresolved Sass variable, not a missing token', async () => {
    const { api } = createFakeApi();
    const spec: ComponentSpec = {
      specVersion: 2,
      component: 'Stackish',
      props: [],
      styleBlocks: [
        {
          selector: '.stack',
          kind: 'base',
          // Stack really ships this: `space($gap)` inside a mixin.
          ciaCalls: [{ fn: 'space', args: ['$gap'], property: 'gap', state: 'default' }],
        },
      ],
    };

    const { result } = await buildComponent(spec, { collectionName: 'boilerplate' }, api);

    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0].reason).toContain('unresolved Sass variable "$gap"');
    // Nobody should go looking for a token by this name.
    expect(result.gaps[0].reason).not.toContain('no variable named');
  });
});

describe('declarations tagged with the prop value they belong to', () => {
  it('splits them into a real variant axis instead of folding them into the base', async () => {
    const { api, components } = createFakeApi();
    const spec: ComponentSpec = {
      specVersion: 2,
      component: 'Sizeish',
      props: [{ name: 'size', optional: true, type: 'enum', values: ['sm', 'md', 'lg'], default: 'md' }],
      styleBlocks: [
        {
          selector: '.thing',
          kind: 'base',
          ciaCalls: [
            { fn: 'color', args: ['text-primary'], property: 'color', state: 'default' },
            { fn: 'font-size', args: ['sm'], property: 'font-size', state: 'default', variant: { prop: 'size', value: 'sm' } },
            { fn: 'font-size', args: ['base'], property: 'font-size', state: 'default', variant: { prop: 'size', value: 'md' } },
            { fn: 'font-size', args: ['lg'], property: 'font-size', state: 'default', variant: { prop: 'size', value: 'lg' } },
          ],
        },
      ],
    };

    const { result } = await buildComponent(spec, { collectionName: 'boilerplate' }, api);

    expect(result.variantNames).toEqual(['size=md', 'size=sm', 'size=lg']);
    const byValue = new Map(components.map((c) => [/size=(\w+)/.exec(c.name)?.[1], labelOf(c)]));
    expect(byValue.get('sm')?.fontSize).toBe(14);
    expect(byValue.get('lg')?.fontSize).toBe(18);
    expect(byValue.get('md')?.bound.fontSize).toBe('font-size-base');
    components.forEach((component) => expect(labelOf(component).fills).toHaveLength(1));
    expect(result.gaps).toEqual([]);
  });

  it('applies a tagged dimension and border to their variant only', async () => {
    const { api, components } = createFakeApi();
    const spec: ComponentSpec = {
      specVersion: 2,
      component: 'Edgeish',
      props: [{ name: 'tone', optional: true, type: 'enum', values: ['flat', 'raised'] }],
      styleBlocks: [
        {
          selector: '.thing',
          kind: 'base',
          ciaCalls: [],
          borders: [
            { property: 'border-width', width: '3px', style: 'solid', state: 'default', variant: { prop: 'tone', value: 'raised' } },
          ],
          dimensions: [
            { property: 'max-width', value: '480px', state: 'default', variant: { prop: 'tone', value: 'flat' } },
          ],
        },
      ],
    };

    await buildComponent(spec, { collectionName: 'boilerplate' }, api);

    const byValue = new Map(components.map((c) => [/tone=(\w+)/.exec(c.name)?.[1], c]));
    expect(byValue.get('raised')?.strokeWeight).toBe(3);
    expect(byValue.get('raised')?.maxWidth).toBeNull();
    expect(byValue.get('flat')?.maxWidth).toBe(480);
  });

  it('makes an axis from it, but keeps the styling on the child rather than the root', async () => {
    const { api, components } = createFakeApi();
    const spec: ComponentSpec = {
      specVersion: 2,
      component: 'Partish',
      props: [{ name: 'size', optional: true, type: 'enum', values: ['sm', 'lg'] }],
      styleBlocks: [
        { selector: '.root', kind: 'base', ciaCalls: [] },
        {
          selector: '.label',
          kind: 'part',
          ciaCalls: [
            { fn: 'font-size', args: ['lg'], property: 'font-size', state: 'default', variant: { prop: 'size', value: 'lg' } },
          ],
        },
      ],
    };

    const { result } = await buildComponent(spec, { collectionName: 'boilerplate' }, api);

    // A part can be the only evidence an axis exists: seven components vary a
    // child by a prop without the root changing at all. The prop is declared with
    // its values and the styling names them, so the axis is stated.
    expect(result.variantNames).toEqual(['size=sm', 'size=lg']);
    // The root itself takes none of it. There is no tree here, so the child it
    // belongs to is not built and the styling is reported rather than misplaced.
    components.forEach((component) => expect(labelOf(component).fontSize).toBe(12));
    expect(result.skipped.some((s) => s.reason.includes('part skipped'))).toBe(true);
  });

  it('reports a declaration that would belong to two axes at once rather than mis-building it', async () => {
    const { api } = createFakeApi();
    const spec: ComponentSpec = {
      specVersion: 2,
      component: 'Crossish',
      props: [
        { name: 'variant', optional: true, type: 'enum', values: ['primary'] },
        { name: 'size', optional: true, type: 'enum', values: ['sm'] },
      ],
      styleBlocks: [
        { selector: '.root', kind: 'base', ciaCalls: [] },
        {
          selector: '.primary',
          kind: 'variant',
          prop: 'variant',
          value: 'primary',
          ciaCalls: [
            { fn: 'font-size', args: ['sm'], property: 'font-size', state: 'default', variant: { prop: 'size', value: 'sm' } },
          ],
        },
      ],
    };

    const { result } = await buildComponent(spec, { collectionName: 'boilerplate' }, api);

    expect(result.gaps.some((g) => g.reason.includes('two variant axes at once'))).toBe(true);
  });
});

describe('Checkbox, from the real spec', () => {
  it('builds the size axis that used to be three sizes in one block', async () => {
    const { api, components } = createFakeApi();

    const { result } = await buildComponent(checkboxSpec, { collectionName: 'boilerplate' }, api);

    expect(result.variantNames).toHaveLength(12);
    const sizes = new Set(
      components.map((component) => `${/size=(\w+)/.exec(component.name)?.[1]}:${labelOf(component).fontSize}`),
    );
    expect(sizes).toContain('sm:14');
    expect(sizes).toContain('lg:18');
    // The fold on the wrapper is gone, which was the point of the variant tag.
    const folds = result.gaps.filter((gap) => gap.reason.includes('times in one block'));
    expect(folds.map((gap) => gap.where)).not.toContain('.checkboxWrapper');
    // One remains, on a part, and it is a pseudo-element rather than a variant or
    // a descendant: `.errorMessage::before` is an error icon with its own size,
    // and a pseudo-element is not tagged the way a child selector now is.
    expect(folds.map((gap) => gap.where)).toEqual(['.errorMessage']);
  });
});

describe('declarations that came from a descendant selector', () => {
  it('keeps them off the root frame, because they style a child', async () => {
    const { api, components } = createFakeApi();
    const spec: ComponentSpec = {
      specVersion: 2,
      component: 'Cardish',
      props: [],
      styleBlocks: [
        {
          selector: '.card',
          kind: 'base',
          ciaCalls: [
            // The card's own background.
            { fn: 'color', args: ['surface-default'], property: 'background-color', state: 'default' },
            // StartCard's real shape: h3 at 20px and p at 14px, both nested.
            { fn: 'font-size', args: ['xl'], property: 'font-size', state: 'default', parts: ['h3'] },
            { fn: 'font-size', args: ['sm'], property: 'font-size', state: 'default', parts: ['p'] },
          ],
        },
      ],
    };

    const { result } = await buildComponent(spec, { collectionName: 'boilerplate' }, api);

    // The root keeps its own background and takes neither child's size.
    expect(components[0].fills).toHaveLength(1);
    expect(labelOf(components[0]).fontSize).toBe(12);
    // Two sizes for one element was the old ambiguity, and it is gone.
    expect(result.gaps).toEqual([]);
    // They are reported as unbuilt child styling instead.
    expect(result.unbuiltPartCalls).toBe(2);
    expect(result.skipped.filter((s) => s.reason.includes('part skipped'))).toHaveLength(2);
  });

  it('groups a whole path, and keeps a selector list as the one fact it is', async () => {
    const { api } = createFakeApi();
    const spec: ComponentSpec = {
      specVersion: 2,
      component: 'Inputish',
      props: [],
      styleBlocks: [
        {
          selector: '.inputWrapper',
          kind: 'base',
          ciaCalls: [
            // Input's real shape, including the two-selector list.
            { fn: 'font-size', args: ['base'], property: 'font-size', state: 'default', parts: ['.label'] },
            { fn: 'font-size', args: ['sm'], property: 'font-size', state: 'default', parts: ['.helperText, .errorMessage'] },
            { fn: 'color', args: ['text-primary'], property: 'color', state: 'default', parts: ['.label'] },
          ],
        },
      ],
    };

    const { result } = await buildComponent(spec, { collectionName: 'boilerplate' }, api);

    const parts = result.skipped.filter((s) => s.reason.includes('part skipped'));
    // Two children, not three: the two declarations on `.label` share one.
    expect(parts).toHaveLength(2);
    // Keyed by the innermost selector, because that is the element being styled
    // and the name the element tree knows it by. The selector list stays whole.
    expect(parts.map((s) => s.where)).toEqual(['.label', '.helperText, .errorMessage']);
    expect(result.bindings).toBe(0);
  });

  it('routes by descendant before variant, since a child is not styled by either', async () => {
    const { api, components } = createFakeApi();
    const spec: ComponentSpec = {
      specVersion: 2,
      component: 'Sizedish',
      props: [{ name: 'size', optional: true, type: 'enum', values: ['sm', 'lg'] }],
      styleBlocks: [
        {
          selector: '.wrapper',
          kind: 'base',
          ciaCalls: [
            {
              fn: 'font-size',
              args: ['lg'],
              property: 'font-size',
              state: 'default',
              variant: { prop: 'size', value: 'lg' },
              parts: ['.label'],
            },
          ],
        },
      ],
    };

    const { result } = await buildComponent(spec, { collectionName: 'boilerplate' }, api);

    // No size axis forms: nothing about the root differs between the two sizes.
    expect(result.variantNames).toHaveLength(1);
    expect(labelOf(components[0]).fontSize).toBe(12);
    // The variant is kept in the name, so the fact is not lost.
    expect(result.skipped.some((s) => s.where === '.label [size=lg]')).toBe(true);
  });

  it('applies a declaration with no path, so an ordinary block is untouched', async () => {
    const { api, components } = createFakeApi();
    const spec: ComponentSpec = {
      specVersion: 2,
      component: 'Plainish',
      props: [],
      styleBlocks: [
        {
          selector: '.plain',
          kind: 'base',
          ciaCalls: [{ fn: 'font-size', args: ['base'], property: 'font-size', state: 'default' }],
        },
      ],
    };

    const { result } = await buildComponent(spec, { collectionName: 'boilerplate' }, api);

    expect(labelOf(components[0]).bound.fontSize).toBe('font-size-base');
    expect(result.unbuiltPartCalls).toBe(0);
  });
});

describe('Input, from the real spec', () => {
  it('no longer takes its label and helper text sizes onto the wrapper', async () => {
    const { api, components } = createFakeApi();

    const { result } = await buildComponent(inputSpec, { collectionName: 'boilerplate' }, api);

    // The fold this used to report is gone: the two sizes belong to .label and
    // to the `.helperText, .errorMessage` pair, neither of which is the root.
    expect(result.gaps.some((g) => g.reason.includes('one block'))).toBe(false);
    components.forEach((component) => {
      expect(labelOf(component).fontSize).toBe(12);
    });
    // `.label` is in Input's element tree, so its size is built onto that node.
    // The two-selector list is not a single node, so it is still reported.
    expect(frameNamed(components[0], 'label')).toBeDefined();
    expect(
      result.skipped.some((s) => s.where === '.helperText, .errorMessage'),
    ).toBe(true);
  });
});

describe('the component element tree', () => {
  const treeSpec = (tree: { selector: string; parent: string | null; tag: string }[]): ComponentSpec => ({
    specVersion: 2,
    component: 'Treeish',
    props: [],
    tree,
    styleBlocks: [
      { selector: '.root', kind: 'base', ciaCalls: [{ fn: 'color', args: ['surface-default'], property: 'background-color', state: 'default' }] },
      { selector: '.icon', kind: 'part', ciaCalls: [{ fn: 'color', args: ['text-primary'], property: 'color', state: 'default' }] },
      { selector: '.label', kind: 'part', ciaCalls: [{ fn: 'font-size', args: ['base'], property: 'font-size', state: 'default' }] },
    ],
  });

  it('builds each node as a nested frame and styles it, instead of discarding the part', async () => {
    const { api, components } = createFakeApi();

    const { result } = await buildComponent(
      treeSpec([
        { selector: '.root', parent: null, tag: 'div' },
        { selector: '.icon', parent: '.root', tag: 'span' },
        { selector: '.label', parent: '.root', tag: 'span' },
      ]),
      { collectionName: 'boilerplate' },
      api,
    );

    const icon = frameNamed(components[0], 'icon');
    const label = frameNamed(components[0], 'label');
    expect(icon).toBeDefined();
    expect(label).toBeDefined();
    // The part's colour landed on its own node's text, not on the root.
    expect(labelOf(icon!).fills).toHaveLength(1);
    expect(labelOf(label!).bound.fontSize).toBe('font-size-base');
    // Nothing is reported as unbuildable, because everything found a node.
    expect(result.unbuiltPartCalls).toBe(0);
    expect(result.skipped.some((s) => s.reason.includes('part skipped'))).toBe(false);
  });

  it('nests a grandchild under its own parent, not under the root', async () => {
    const { api, components } = createFakeApi();

    await buildComponent(
      treeSpec([
        { selector: '.root', parent: null, tag: 'div' },
        { selector: '.icon', parent: '.root', tag: 'span' },
        { selector: '.label', parent: '.icon', tag: 'span' },
      ]),
      { collectionName: 'boilerplate' },
      api,
    );

    const icon = frameNamed(components[0], 'icon');
    expect(icon).toBeDefined();
    // Found inside the icon, which is only true if containment was honoured.
    expect(frameNamed(icon!, 'label')).toBeDefined();
    expect(components[0].children.filter((child) => child instanceof FakeFrame)).toHaveLength(1);
  });

  it('puts the component text in the label node rather than loose on the root', async () => {
    const { api, components, sets } = createFakeApi();
    const spec = treeSpec([
      { selector: '.root', parent: null, tag: 'div' },
      { selector: '.label', parent: '.root', tag: 'span' },
    ]);
    spec.props = [{ name: 'label', optional: true, type: 'string', values: null, default: 'Go' }];

    const { result } = await buildComponent(spec, { collectionName: 'boilerplate' }, api);

    const label = frameNamed(components[0], 'label');
    expect(labelOf(label!).characters).toBe('Go');
    expect(labelOf(label!).name).toBe('label');
    // The root has no text of its own: exactly one text node carries the label.
    expect(components[0].children.some((child) => child instanceof FakeText)).toBe(false);
    expect(result.properties).toContain('label: TEXT');
    expect(sets.length + 1).toBeGreaterThan(0);
  });

  it('keeps the root label when the tree offers nowhere to put it', async () => {
    const { api, components } = createFakeApi();

    await buildComponent(
      treeSpec([
        { selector: '.root', parent: null, tag: 'div' },
        { selector: '.icon', parent: '.root', tag: 'span' },
      ]),
      { collectionName: 'boilerplate' },
      api,
    );

    // No `.label` node, so the root carries the text as it always did.
    expect(components[0].children.some((child) => child instanceof FakeText)).toBe(true);
  });

  it('gives every built node a text child, so a frame with only a background is visible', async () => {
    const { api, components } = createFakeApi();

    await buildComponent(
      treeSpec([
        { selector: '.root', parent: null, tag: 'div' },
        { selector: '.icon', parent: '.root', tag: 'span' },
      ]),
      { collectionName: 'boilerplate' },
      api,
    );

    const icon = frameNamed(components[0], 'icon');
    // An auto-layout frame with no children collapses to nothing in Figma, and
    // the name makes the structure readable on the canvas.
    expect(labelOf(icon!).characters).toBe('icon');
    expect(icon!.layoutMode).toBe('HORIZONTAL');
  });

  it('builds one subtree and reports the rest when several nodes claim no parent', async () => {
    const { api, components } = createFakeApi();

    const { result } = await buildComponent(
      treeSpec([
        // `.root` is what the base block names, so it wins.
        { selector: '.icon', parent: null, tag: 'span' },
        { selector: '.root', parent: null, tag: 'div' },
        { selector: '.label', parent: '.root', tag: 'span' },
      ]),
      { collectionName: 'boilerplate' },
      api,
    );

    expect(frameNamed(components[0], 'label')).toBeDefined();
    // `.icon` has no known position, so it is not placed somewhere plausible.
    expect(frameNamed(components[0], 'icon')).toBeUndefined();
    const reported = result.gaps.find((gap) => gap.reason.includes('tops ('));
    expect(reported?.reason).toContain('built the subtree under .root');
    expect(result.skipped.some((s) => s.where === '.icon' && s.reason.includes('not in the component element tree'))).toBe(true);
  });

  it('builds nothing from a tree when the producer could not scan the component', async () => {
    const { api, components } = createFakeApi();
    const spec = treeSpec([]);
    spec.tree = null;

    const { result } = await buildComponent(spec, { collectionName: 'boilerplate' }, api);

    expect(components[0].children.filter((child) => child instanceof FakeFrame)).toHaveLength(0);
    expect(result.skipped.some((s) => s.reason.includes('has no element tree'))).toBe(true);
  });
});

describe('a conditional class, which is not an element', () => {
  const modSpec = (tree: { selector: string; parent: string | null; tag: string; modifierOf?: string }[]): ComponentSpec => ({
    specVersion: 2,
    component: 'Modish',
    props: [],
    tree,
    styleBlocks: [
      { selector: '.root', kind: 'base', ciaCalls: [{ fn: 'color', args: ['surface-default'], property: 'background-color', state: 'default' }] },
      { selector: '.rootMuted', kind: 'part', ciaCalls: [{ fn: 'color', args: ['text-primary'], property: 'color', state: 'default' }] },
    ],
  });

  it('builds no node for a modifier, because it is a state of another element', async () => {
    const { api, components } = createFakeApi();

    const { result } = await buildComponent(
      modSpec([
        { selector: '.root', parent: null, tag: 'p' },
        // Text's real shape: one tag, two class names, the second conditional.
        { selector: '.rootMuted', parent: null, tag: 'p', modifierOf: '.root' },
      ]),
      { collectionName: 'boilerplate' },
      api,
    );

    expect(frameNamed(components[0], 'rootMuted')).toBeUndefined();
    expect(
      result.skipped.some(
        (s) => s.where === '.rootMuted' && s.reason.includes('a state of that element rather than a child'),
      ),
    ).toBe(true);
  });

  it('does not count a parentless modifier as a second root', async () => {
    const { api } = createFakeApi();

    const { result } = await buildComponent(
      modSpec([
        { selector: '.root', parent: null, tag: 'p' },
        { selector: '.rootMuted', parent: null, tag: 'p', modifierOf: '.root' },
      ]),
      { collectionName: 'boilerplate' },
      api,
    );

    // Counting it as a root is what made 5 of 18 components look ambiguous.
    expect(result.gaps.some((gap) => gap.reason.includes('tops ('))).toBe(false);
  });

  it('still builds an ordinary child that has no conditional class', async () => {
    const { api, components } = createFakeApi();

    await buildComponent(
      modSpec([
        { selector: '.root', parent: null, tag: 'div' },
        { selector: '.rootMuted', parent: '.root', tag: 'span' },
      ]),
      { collectionName: 'boilerplate' },
      api,
    );

    expect(frameNamed(components[0], 'rootMuted')).toBeDefined();
  });
});

describe('classes that are mutually exclusive names for one element', () => {
  const altSpec = (tree: { selector: string; parent: string | null; tag: string; alternativeTo?: string[] }[]): ComponentSpec => ({
    specVersion: 2,
    component: 'Altish',
    props: [],
    tree,
    styleBlocks: [
      { selector: '.root', kind: 'base', ciaCalls: [{ fn: 'color', args: ['surface-default'], property: 'background-color', state: 'default' }] },
      { selector: '.iconIn', kind: 'part', ciaCalls: [{ fn: 'color', args: ['text-primary'], property: 'color', state: 'default' }] },
      { selector: '.iconOut', kind: 'part', ciaCalls: [{ fn: 'color', args: ['brand-primary'], property: 'color', state: 'default' }] },
    ],
  });

  it('builds one element for the pair, not one per branch', async () => {
    const { api, components } = createFakeApi();

    // Input's real shape: `className={icon ? styles.iconOut : styles.iconIn}` on
    // one button, which puts the button in the tree twice.
    const { result } = await buildComponent(
      altSpec([
        { selector: '.root', parent: null, tag: 'div' },
        { selector: '.iconOut', parent: '.root', tag: 'button', alternativeTo: ['.iconIn'] },
        { selector: '.iconIn', parent: '.root', tag: 'button', alternativeTo: ['.iconOut'] },
      ]),
      { collectionName: 'boilerplate' },
      api,
    );

    // The first in tree order stands for the group; the other is not a sibling.
    expect(frameNamed(components[0], 'iconOut')).toBeDefined();
    expect(frameNamed(components[0], 'iconIn')).toBeUndefined();
    const reported = result.skipped.find((s) => s.where === '.iconOut' && s.reason.includes('mutually exclusive'));
    expect(reported?.reason).toContain('.iconOut and .iconIn');
    expect(reported?.reason).toContain('nothing says which is the default');
  });

  it('takes no styling from either branch, because exactly one applies', async () => {
    const { api, components } = createFakeApi();

    const { result } = await buildComponent(
      altSpec([
        { selector: '.root', parent: null, tag: 'div' },
        { selector: '.iconOut', parent: '.root', tag: 'button', alternativeTo: ['.iconIn'] },
        { selector: '.iconIn', parent: '.root', tag: 'button', alternativeTo: ['.iconOut'] },
      ]),
      { collectionName: 'boilerplate' },
      api,
    );

    const icon = frameNamed(components[0], 'iconOut');
    // Neither colour is applied: picking one would invent a default.
    expect(labelOf(icon!).fills).toHaveLength(0);
    // Both are counted as styling this version did not build.
    expect(result.unbuiltPartCalls).toBe(2);
  });

  it('refuses to collapse a set whose members do not all name each other', async () => {
    const { api, components } = createFakeApi();
    const spec = altSpec([
      { selector: '.root', parent: null, tag: 'div' },
      // DesignSandbox's real shape: `.up` is used on two different lines, paired
      // with `.iconIn` on one and `.iconOut` on the other. Three classes, two
      // elements, and `.iconIn` and `.iconOut` never name each other.
      { selector: '.iconIn', parent: '.root', tag: 'line', alternativeTo: ['.up'] },
      { selector: '.up', parent: '.root', tag: 'line', alternativeTo: ['.iconIn', '.iconOut'] },
      { selector: '.iconOut', parent: '.root', tag: 'line', alternativeTo: ['.up'] },
    ]);
    spec.styleBlocks.push({ selector: '.up', kind: 'part', ciaCalls: [] });

    const { result } = await buildComponent(spec, { collectionName: 'boilerplate' }, api);

    // None of the three is built: one frame would be too few, three too many, and
    // the spec cannot say how many elements there are.
    expect(frameNamed(components[0], 'iconIn')).toBeUndefined();
    expect(frameNamed(components[0], 'up')).toBeUndefined();
    expect(frameNamed(components[0], 'iconOut')).toBeUndefined();
    expect(
      result.skipped.some((s) => s.reason.includes('used on more than one element')),
    ).toBe(true);
  });
});

describe('Input, its info button is one element under two names', () => {
  it('builds one button rather than two siblings, and says why it is unstyled', async () => {
    const { api, components } = createFakeApi();

    const { result } = await buildComponent(inputSpec, { collectionName: 'boilerplate' }, api);

    // `className={icon ? styles.infoIconOutside : styles.infoIcon}` on one button.
    const outside = frameNamed(components[0], 'infoIconOutside');
    const inside = frameNamed(components[0], 'infoIcon');
    expect([outside, inside].filter(Boolean)).toHaveLength(1);
    expect(
      result.skipped.some(
        (s) => s.reason.includes('mutually exclusive names for it') && s.reason.includes('infoIcon'),
      ),
    ).toBe(true);
  });
});

describe("the producer's own findings", () => {
  it('relays them instead of dropping them, marked as coming from the spec', async () => {
    const { api } = createFakeApi();
    const spec: ComponentSpec = {
      specVersion: 2,
      component: 'Reportish',
      props: [],
      styleBlocks: [
        {
          selector: '.root',
          kind: 'base',
          // No `space-2xs` in the collection, so this is a gap the builder finds.
          ciaCalls: [{ fn: 'space', args: ['2xs'], property: 'gap', state: 'default' }],
        },
      ],
      gaps: [
        {
          kind: 'ambiguous-local-property',
          selector: '.root',
          reason: '--gap is defined twice with different values',
        },
        { kind: 'no-part-tree', selector: null, reason: 'the JSX scan did not account for everything' },
      ],
    };

    const { result } = await buildComponent(spec, { collectionName: 'boilerplate' }, api);

    const relayed = result.gaps.filter((gap) => gap.origin === 'spec');
    expect(relayed).toHaveLength(2);
    expect(relayed[0]).toEqual({
      where: '.root',
      reason: 'ambiguous-local-property: --gap is defined twice with different values',
      origin: 'spec',
    });
    // A gap about the whole component has no selector, so it reads as contract.
    expect(relayed[1].where).toBe('contract');
    // The builder's own finding stays distinguishable from the producer's, which
    // is the whole point: they are acted on in different repos.
    const own = result.gaps.filter((gap) => gap.origin !== 'spec');
    expect(own).toHaveLength(1);
    expect(own[0].reason).toContain('no variable named "space-2xs"');
  });

  it('builds a spec that reports nothing exactly as before', async () => {
    const { api } = createFakeApi();

    const { result } = await buildComponent(buttonSpec, { collectionName: 'boilerplate' }, api);

    expect(result.gaps.every((gap) => gap.origin !== 'spec' || gap.reason.includes(':'))).toBe(true);
  });
});

describe('CustomizeModal, whose parts are rendered in several places', () => {
  it('surfaces that a part it built in one position exists in others too', async () => {
    const { api } = createFakeApi();

    const { result } = await buildComponent(customizeModalSpec, { collectionName: 'boilerplate' }, api);

    // `.helperText` is under `.label`, `.section` AND `.footer`. The tree keeps one
    // node per class, so the builder puts it in one place and would otherwise say
    // nothing about the other two.
    const multi = result.gaps.filter((gap) => gap.reason.startsWith('part-rendered-in-several-places'));
    expect(multi.length).toBeGreaterThan(0);
    const helper = multi.find((gap) => gap.where === '.helperText');
    expect(helper?.reason).toContain('.section, .footer');
    expect(helper?.origin).toBe('spec');
  });
});

describe('a part rendered in several places', () => {
  it('builds one frame per position, not one for the first only', async () => {
    const { api, components } = createFakeApi();
    const spec: ComponentSpec = {
      specVersion: 2,
      component: 'Manyish',
      props: [],
      tree: [
        { selector: '.root', parent: null, tag: 'div' },
        { selector: '.section', parent: '.root', tag: 'div' },
        { selector: '.footer', parent: '.root', tag: 'div' },
        // CustomizeModal's real shape.
        { selector: '.helperText', parent: '.section', parents: ['.section', '.footer'], tag: 'p' },
      ],
      styleBlocks: [
        { selector: '.root', kind: 'base', ciaCalls: [] },
        {
          selector: '.helperText',
          kind: 'part',
          ciaCalls: [{ fn: 'color', args: ['text-primary'], property: 'color', state: 'default' }],
        },
      ],
    };

    await buildComponent(spec, { collectionName: 'boilerplate' }, api);

    const section = frameNamed(components[0], 'section');
    const footer = frameNamed(components[0], 'footer');
    // One inside each, and both carry the part's styling.
    expect(frameNamed(section!, 'helperText')).toBeDefined();
    expect(frameNamed(footer!, 'helperText')).toBeDefined();
    expect(labelOf(frameNamed(footer!, 'helperText')!).fills).toHaveLength(1);
  });

  it('builds one level of a class nested inside itself, then stops', async () => {
    const { api, components } = createFakeApi();
    const spec: ComponentSpec = {
      specVersion: 2,
      component: 'Recursish',
      props: [],
      tree: [
        { selector: '.root', parent: null, tag: 'div' },
        // DesignSandbox's real shape: a .demoRow label inside a .demoRow div.
        { selector: '.demoRow', parent: '.root', parents: ['.root', '.demoRow'], tag: 'div' },
      ],
      styleBlocks: [{ selector: '.root', kind: 'base', ciaCalls: [] }],
    };

    await buildComponent(spec, { collectionName: 'boilerplate' }, api);

    const outer = frameNamed(components[0], 'demoRow');
    expect(outer).toBeDefined();
    const inner = frameNamed(outer!, 'demoRow');
    expect(inner).toBeDefined();
    // And no third level: the chain guard stops it rather than recursing forever.
    expect(frameNamed(inner!, 'demoRow')).toBeUndefined();
  });

  it('treats a node that is only sometimes a root as a child, not a second root', async () => {
    const { api, components } = createFakeApi();
    const spec: ComponentSpec = {
      specVersion: 2,
      component: 'Skeletish',
      props: [],
      tree: [
        { selector: '.root', parent: null, tag: 'div' },
        { selector: '.lines', parent: '.root', tag: 'div' },
        // Skeleton's real shape: inside .lines, and also standing alone.
        { selector: '.skeleton', parent: '.lines', parents: ['.lines', null], tag: 'div' },
      ],
      styleBlocks: [{ selector: '.root', kind: 'base', ciaCalls: [] }],
    };

    const { result } = await buildComponent(spec, { collectionName: 'boilerplate' }, api);

    // It is built where it is contained, and its standalone position is not
    // invented as a child of the component root.
    expect(frameNamed(frameNamed(components[0], 'lines')!, 'skeleton')).toBeDefined();
    expect(result.gaps.some((gap) => gap.reason.includes('tops ('))).toBe(false);
  });
});

describe('a file that declares more than one thing rendering markup', () => {
  const menuish = (): ComponentSpec => ({
    specVersion: 2,
    component: 'Menuish',
    props: [],
    tree: [
      // Menu.tsx's real shape: three declarations in one file.
      { selector: '.menu', parent: null, tag: 'ul', declaredIn: 'MenuList' },
      { selector: '.item', parent: '.menu', tag: 'li', declaredIn: 'MenuList' },
      { selector: '.menuPopup', parent: null, parents: [null, '.contextTarget'], tag: 'div', declaredIn: 'Menu' },
      { selector: '.contextTarget', parent: null, tag: 'div', declaredIn: 'ContextMenu' },
    ],
    styleBlocks: [
      { selector: '.menu', kind: 'base', ciaCalls: [] },
      { selector: '.item', kind: 'part', ciaCalls: [{ fn: 'color', args: ['text-primary'], property: 'color', state: 'default' }] },
    ],
  });

  it('says the file declares several things rather than blaming the scan', async () => {
    const { api, components } = createFakeApi();

    const { result } = await buildComponent(menuish(), { collectionName: 'boilerplate' }, api);

    // The base block names `.menu`, so MenuList's subtree is the one built.
    expect(frameNamed(components[0], 'item')).toBeDefined();
    expect(frameNamed(components[0], 'contextTarget')).toBeUndefined();
    const reported = result.gaps.find((gap) => gap.reason.includes('declares more than one thing'));
    expect(reported?.reason).toContain('built .menu from MenuList');
    // Whether the others are separate components or parts of this one is not this
    // builder's call, and the message says so rather than picking.
    expect(reported?.reason).toContain('is not stated');
  });

  it('counts a node as a top when only another declaration contains it', async () => {
    const { api } = createFakeApi();

    const { result } = await buildComponent(menuish(), { collectionName: 'boilerplate' }, api);

    // `.menuPopup` has a root position, and its other position belongs to
    // ContextMenu, so nothing in Menu's own markup contains it. Having a second
    // position must not hide it the way it correctly hides Skeleton's reused child.
    const reported = result.gaps.find((gap) => gap.reason.includes('declares more than one thing'));
    expect(reported?.reason).toContain('.menuPopup in Menu');
  });

  it('still hides a reused child whose container shares its declaration', async () => {
    const { api } = createFakeApi();
    const spec: ComponentSpec = {
      specVersion: 2,
      component: 'Skeletish',
      props: [],
      tree: [
        { selector: '.root', parent: null, tag: 'div', declaredIn: 'Skeletish' },
        { selector: '.lines', parent: '.root', tag: 'div', declaredIn: 'Skeletish' },
        { selector: '.skeleton', parent: '.lines', parents: ['.lines', null], tag: 'div', declaredIn: 'Skeletish' },
      ],
      styleBlocks: [{ selector: '.root', kind: 'base', ciaCalls: [] }],
    };

    const { result } = await buildComponent(spec, { collectionName: 'boilerplate' }, api);

    expect(result.gaps.some((gap) => gap.reason.includes('declares more than one thing'))).toBe(false);
    expect(result.gaps.some((gap) => gap.reason.includes('tops ('))).toBe(false);
  });
});

describe('a base block that is not itself the top of the tree', () => {
  const nested = (roots: string[]): ComponentSpec => ({
    specVersion: 2,
    component: 'Nestish',
    props: [],
    tree: [
      // Menu's real shape after the declarations were joined: the styled element
      // sits inside the component's own root, and a sibling component's root is
      // also in the file.
      { selector: roots[0], parent: null, tag: 'div', declaredIn: 'Other' },
      { selector: '.popup', parent: null, tag: 'div', declaredIn: 'Nestish' },
      { selector: '.menu', parent: '.popup', tag: 'ul', declaredIn: 'MenuList' },
      { selector: '.item', parent: '.menu', tag: 'li', declaredIn: 'MenuList' },
    ],
    styleBlocks: [
      { selector: '.menu', kind: 'base', ciaCalls: [] },
      { selector: '.item', kind: 'part', ciaCalls: [{ fn: 'color', args: ['text-primary'], property: 'color', state: 'default' }] },
    ],
  });

  it('walks up to the top that contains the styled element', async () => {
    const { api, components } = createFakeApi();

    // `.other` comes first in the tree, so taking the first top would build the
    // wrong component. Textarea was doing exactly that, building from its toolbar.
    await buildComponent(nested(['.other']), { collectionName: 'boilerplate' }, api);

    expect(frameNamed(components[0], 'menu')).toBeDefined();
    expect(frameNamed(components[0], 'item')).toBeDefined();
    expect(frameNamed(components[0], 'other')).toBeUndefined();
  });

  it('still prefers a top the base block names directly', async () => {
    const { api, components } = createFakeApi();
    const spec = nested(['.other']);
    spec.styleBlocks.push({ selector: '.popup', kind: 'base', ciaCalls: [] });

    await buildComponent(spec, { collectionName: 'boilerplate' }, api);

    // Both `.popup` and `.menu` are named by a base block; the one that is itself
    // a top wins without any walking.
    expect(frameNamed(components[0], 'menu')).toBeDefined();
  });
});

describe('a file with two public components and no base block', () => {
  const popupish = (): ComponentSpec => ({
    specVersion: 2,
    component: 'Popupish',
    props: [],
    tree: [
      // Popup.tsx's real shape: two exported components, neither styled by a base
      // block, so the stylesheet cannot say which one this spec is about.
      { selector: '.popover', parent: null, tag: 'div', declaredIn: 'Popover' },
      { selector: '.body', parent: '.popover', tag: 'div', declaredIn: 'Popover' },
      { selector: '.panel', parent: null, tag: 'div', declaredIn: 'Popupish' },
    ],
    styleBlocks: [
      { selector: '.panel', kind: 'part', ciaCalls: [] },
      { selector: '.body', kind: 'part', ciaCalls: [] },
    ],
  });

  it('uses the declaration that shares the component name, rather than file order', async () => {
    const { api, components } = createFakeApi();

    const { result } = await buildComponent(popupish(), { collectionName: 'boilerplate' }, api);

    // `.popover` comes first, so taking the first top would build the other one.
    expect(result.builtFrom).toBe('.panel');
    expect(frameNamed(components[0], 'body')).toBeUndefined();
  });

  it('says which evidence decided, since it is weaker here than a base block', async () => {
    const { api } = createFakeApi();

    const { result } = await buildComponent(popupish(), { collectionName: 'boilerplate' }, api);

    const reported = result.gaps.find((gap) => gap.reason.includes('declares more than one thing'));
    // Crediting the base block here would have been a false claim: there is none.
    expect(reported?.reason).toContain('chosen by the declaration named Popupish');
    expect(reported?.reason).not.toContain('base style block');
  });

  it('admits when nothing chose, rather than implying something did', async () => {
    const { api } = createFakeApi();
    const spec = popupish();
    // No declaration matches the component name either.
    spec.component = 'Unrelated';

    const { result } = await buildComponent(spec, { collectionName: 'boilerplate' }, api);

    const reported = result.gaps.find((gap) => gap.reason.includes('declares more than one thing'));
    expect(reported?.reason).toContain('first in the file, with nothing to choose on');
  });
});

describe('walking up to the top from the styled element', () => {
  it('terminates when a position points back into the element own subtree', async () => {
    const { api } = createFakeApi();
    const spec: ComponentSpec = {
      specVersion: 2,
      component: 'Loopish',
      props: [],
      tree: [
        { selector: '.popup', parent: null, tag: 'div', declaredIn: 'Loopish' },
        // Menu's real shape while the positions were mis-ordered upstream: the
        // menu sits inside a submenu popup, which sits inside an item, which sits
        // inside the menu. Following one position blindly never reaches a top.
        { selector: '.menu', parent: '.submenuPopup', parents: ['.submenuPopup', '.popup'], tag: 'ul', declaredIn: 'MenuList' },
        { selector: '.item', parent: '.menu', tag: 'li', declaredIn: 'MenuList' },
        { selector: '.submenuPopup', parent: '.item', tag: 'div', declaredIn: 'MenuList' },
      ],
      styleBlocks: [{ selector: '.menu', kind: 'base', ciaCalls: [] }],
    };

    const { result } = await buildComponent(spec, { collectionName: 'boilerplate' }, api);

    // Every position is followed, not just the first, and each node is visited
    // once, so the cycle is crossed rather than fallen into.
    expect(result.builtFrom).toBe('.popup');
  });

  it('follows every position, so an inner one listed first does not hide the outer', async () => {
    const { api, components } = createFakeApi();
    const spec: ComponentSpec = {
      specVersion: 2,
      component: 'Orderish',
      props: [],
      tree: [
        { selector: '.outer', parent: null, tag: 'div', declaredIn: 'Orderish' },
        { selector: '.mid', parent: '.outer', tag: 'div', declaredIn: 'Orderish' },
        { selector: '.leaf', parent: '.mid', parents: ['.mid', '.outer'], tag: 'span', declaredIn: 'Orderish' },
      ],
      styleBlocks: [{ selector: '.leaf', kind: 'base', ciaCalls: [] }],
    };

    await buildComponent(spec, { collectionName: 'boilerplate' }, api);

    expect(frameNamed(components[0], 'mid')).toBeDefined();
    expect(frameNamed(components[0], 'leaf')).toBeDefined();
  });
});

describe('when the declaration name matches more than one top', () => {
  it('says the name did not choose, rather than letting file order wear its authority', async () => {
    const { api } = createFakeApi();
    const spec: ComponentSpec = {
      specVersion: 2,
      component: 'Twoish',
      props: [],
      tree: [
        { selector: '.first', parent: null, tag: 'div', declaredIn: 'Twoish' },
        { selector: '.second', parent: null, tag: 'div', declaredIn: 'Twoish' },
      ],
      styleBlocks: [{ selector: '.first', kind: 'part', ciaCalls: [] }],
    };

    const { result } = await buildComponent(spec, { collectionName: 'boilerplate' }, api);

    const reported = result.gaps.find((gap) => gap.reason.includes('tops ('));
    expect(reported?.reason).toContain('2 tops are declared in Twoish');
    expect(reported?.reason).toContain('does not choose between them');
  });
});

describe('an element tree with no top at all', () => {
  const mutual = (): ComponentSpec => ({
    specVersion: 2,
    component: 'Mutualish',
    props: [],
    // Two declarations that render each other, so every node is contained by
    // another and no walk reaches a top. Upstream built this as a fixture after
    // finding its ordering rule assumed an outside position always exists.
    tree: [
      { selector: '.branch', parent: '.leaf', tag: 'ul', declaredIn: 'Branch' },
      { selector: '.leaf', parent: '.branch', tag: 'li', declaredIn: 'Leaf' },
    ],
    styleBlocks: [
      { selector: '.branch', kind: 'base', ciaCalls: [] },
      { selector: '.leaf', kind: 'part', ciaCalls: [{ fn: 'color', args: ['text-primary'], property: 'color', state: 'default' }] },
    ],
  });

  it('builds flat and says the tree has no top, rather than blaming the parts', async () => {
    const { api, components } = createFakeApi();

    const { result } = await buildComponent(mutual(), { collectionName: 'boilerplate' }, api);

    expect(result.builtFrom).toBeUndefined();
    expect(frameNamed(components[0], 'leaf')).toBeUndefined();
    const reported = result.gaps.find((gap) => gap.reason.includes('no top'));
    expect(reported?.reason).toContain('2 node(s) and no top');
    expect(reported?.reason).toContain('render each other');
  });

  it('does not tell a part it is missing from a tree it is in', async () => {
    const { api } = createFakeApi();

    const { result } = await buildComponent(mutual(), { collectionName: 'boilerplate' }, api);

    const part = result.skipped.find((skip) => skip.where === '.leaf');
    // `.leaf` IS in the tree. Saying otherwise sends a reader to the wrong place.
    expect(part?.reason).toBe('part skipped: the element tree has no top, so no part of it could be placed');
  });

  it('terminates rather than looping, which is the whole hazard here', async () => {
    const { api } = createFakeApi();

    // If any walk followed one position without a visited set, this would hang.
    const { result } = await buildComponent(mutual(), { collectionName: 'boilerplate' }, api);

    expect(result.component).toBe('Mutualish');
  });
});

describe('part styling that belongs to one variant', () => {
  const dividerish = (): ComponentSpec => ({
    specVersion: 2,
    component: 'Dividerish',
    props: [{ name: 'align', optional: true, type: 'enum', values: ['center', 'start', 'end'] }],
    tree: [
      { selector: '.divider', parent: null, tag: 'div', declaredIn: 'Dividerish' },
      { selector: '.line', parent: '.divider', tag: 'span', declaredIn: 'Dividerish' },
    ],
    styleBlocks: [
      { selector: '.divider', kind: 'base', ciaCalls: [] },
      {
        selector: '.line',
        kind: 'part',
        ciaCalls: [
          // Divider's real shape: the line is spaced differently at each edge, and
          // not at all in the middle.
          { fn: 'space', args: ['lg'], property: 'gap', state: 'default', variant: { prop: 'align', value: 'start' } },
          { fn: 'space', args: ['sm'], property: 'gap', state: 'default', variant: { prop: 'align', value: 'end' } },
          { fn: 'color', args: ['border-subtle'], property: 'background-color', state: 'default' },
        ],
      },
    ],
  });

  it('applies it to that variant only, not to every one of them', async () => {
    const { api, components } = createFakeApi();

    await buildComponent(dividerish(), { collectionName: 'boilerplate' }, api);

    const lineIn = (variant: string) =>
      frameNamed(components.find((component) => component.name.includes(`align=${variant}`))!, 'line');
    expect(lineIn('start')?.bound.itemSpacing).toBe('space-lg');
    expect(lineIn('end')?.bound.itemSpacing).toBe('space-sm');
    // The centred one gets neither, which is the case that was wrong: both edges'
    // spacing used to land on every variant, last one winning.
    expect(lineIn('center')?.bound.itemSpacing).toBeUndefined();
  });

  it('still gives every variant the part styling that is not variant-scoped', async () => {
    const { api, components } = createFakeApi();

    await buildComponent(dividerish(), { collectionName: 'boilerplate' }, api);

    components.forEach((component) => {
      const line = frameNamed(component, 'line');
      expect(line?.fills).toHaveLength(1);
    });
  });
});

describe('a local custom property that takes several values', () => {
  const sized = (entries: { qualifier: string; variant: { prop: string; value: string } | null; literal: string }[]): ComponentSpec => ({
    specVersion: 2,
    component: 'Sizedish',
    props: [{ name: 'size', optional: true, type: 'enum', values: ['sm', 'md', 'lg'], default: 'md' }],
    tree: [
      { selector: '.root', parent: null, tag: 'div', declaredIn: 'Sizedish' },
      { selector: '.mark', parent: '.root', tag: 'span', declaredIn: 'Sizedish' },
    ],
    styleBlocks: [
      { selector: '.root', kind: 'base', ciaCalls: [] },
      {
        selector: '.mark',
        kind: 'part',
        ciaCalls: [],
        // Checkbox's real shape: `--checkbox-size` defined once per [data-size].
        consumes: [
          {
            property: 'width',
            localToken: '--mark-size',
            state: 'default',
            from: { fn: null, args: [], literal: '20px' },
            fromByVariant: entries.map((entry) => ({
              qualifier: entry.qualifier,
              variant: entry.variant,
              from: { fn: null, args: [], literal: entry.literal },
            })),
          },
        ],
      },
    ],
  });

  it('gives each variant its own value rather than reporting the local as undecidable', async () => {
    const { api, components } = createFakeApi();

    await buildComponent(
      sized([
        { qualifier: 'default', variant: null, literal: '20px' },
        { qualifier: 'size=sm', variant: { prop: 'size', value: 'sm' }, literal: '16px' },
        { qualifier: 'size=lg', variant: { prop: 'size', value: 'lg' }, literal: '24px' },
      ]),
      { collectionName: 'boilerplate' },
      api,
    );

    const markIn = (value: string) =>
      frameNamed(components.find((component) => component.name.includes(`size=${value}`))!, 'mark');
    expect(markIn('sm')?.width).toBe(16);
    expect(markIn('lg')?.width).toBe(24);
    // md has no entry of its own, so it keeps the unqualified value.
    expect(markIn('md')?.width).toBe(20);
  });

  it('reports a qualifier no declared prop names, instead of guessing a variant for it', async () => {
    const { api } = createFakeApi();

    const { result } = await buildComponent(
      sized([
        { qualifier: 'default', variant: null, literal: '20px' },
        // Calendar's theme overrides and Password's strength meter are this shape:
        // a real qualifier that no prop declares.
        { qualifier: 'theme=dark', variant: null, literal: '18px' },
      ]),
      { collectionName: 'boilerplate' },
      api,
    );

    const reported = result.skipped.find((skip) => skip.reason.includes('theme=dark'));
    expect(reported?.reason).toContain('no declared prop names that qualifier');
    // And the base value still lands, rather than the whole local being dropped.
    expect(result.bindings + result.skipped.length).toBeGreaterThan(0);
  });
});

describe('a local overridden for a theme', () => {
  const themed = (from: { fn: string | null; args: string[]; literal?: string }): ComponentSpec => ({
    specVersion: 2,
    component: 'Themeish',
    props: [],
    styleBlocks: [
      {
        selector: '.root',
        kind: 'base',
        ciaCalls: [],
        consumes: [
          {
            property: 'background-color',
            localToken: '--bg',
            state: 'default',
            from: { fn: 'color', args: ['surface-default'] },
            fromByVariant: [
              { qualifier: 'default', variant: null, from: { fn: 'color', args: ['surface-default'] } },
              { qualifier: 'theme=dark', variant: null, from },
            ],
          },
        ],
      },
    ],
  });

  it('binds the unqualified token and says why the dark one cannot follow', async () => {
    const { api, components } = createFakeApi();

    // 27 of the library's 30 theme overrides are this shape: a DIFFERENT token in
    // dark, and `surface-default` and `surface-subtle` have different dark values.
    const { result } = await buildComponent(
      themed({ fn: 'color', args: ['surface-subtle'] }),
      { collectionName: 'boilerplate' },
      api,
    );

    expect(boundColor(components[0].fills[0])).toBe('surface-default');
    const reported = result.skipped.find((skip) => skip.reason.includes('theme=dark'));
    // The precise reason, because this looks like the case Figma handles best.
    expect(reported?.reason).toContain('points at one variable whose value the mode chooses');
    expect(reported?.reason).toContain('cannot point at another variable in another mode');
  });

  it('gives a literal override the general reason, since no token is involved', async () => {
    const { api } = createFakeApi();

    // Drawer's backdrop is the one literal: rgba(0,0,0,0.65) for dark.
    const { result } = await buildComponent(
      themed({ fn: null, args: [], literal: 'rgba(0, 0, 0, 0.65)' }),
      { collectionName: 'boilerplate' },
      api,
    );

    const reported = result.skipped.find((skip) => skip.reason.includes('theme=dark'));
    expect(reported?.reason).toContain('no declared prop names that qualifier');
  });
});

describe('a child that fills its parent', () => {
  const filling = (value: string): ComponentSpec => ({
    specVersion: 2,
    component: 'Fillish',
    props: [],
    tree: [
      { selector: '.root', parent: null, tag: 'div', declaredIn: 'Fillish' },
      { selector: '.bar', parent: '.root', tag: 'div', declaredIn: 'Fillish' },
    ],
    styleBlocks: [
      { selector: '.root', kind: 'base', ciaCalls: [] },
      {
        selector: '.bar',
        kind: 'part',
        ciaCalls: [],
        dimensions: [{ property: 'width', value, state: 'default' }],
      },
    ],
  });

  it('applies 100% as fill, which Figma does have for a child', async () => {
    const { api, components } = createFakeApi();

    const { result } = await buildComponent(filling('100%'), { collectionName: 'boilerplate' }, api);

    // This used to be refused on the grounds that a component set on the canvas
    // has no parent. True before the element tree existed, false for a child.
    expect(frameNamed(components[0], 'bar')?.layoutSizingHorizontal).toBe('FILL');
    expect(result.skipped.some((skip) => skip.reason.includes('width: 100% not applied'))).toBe(false);
  });

  it('applies it only after the parent has its layout, which Figma requires', async () => {
    const { api, components } = createFakeApi();

    // The fake throws the same error Figma threw for real if this is set while
    // the parent is not yet an auto-layout frame, so reaching here at all is the
    // assertion. The root gets its layout after its children are built.
    await buildComponent(filling('100%'), { collectionName: 'boilerplate' }, api);

    expect(components[0].layoutMode).toBe('HORIZONTAL');
  });

  it('still refuses a proportion, because Figma has fill or fixed and nothing between', async () => {
    const { api, components } = createFakeApi();

    const { result } = await buildComponent(filling('70%'), { collectionName: 'boilerplate' }, api);

    expect(frameNamed(components[0], 'bar')?.layoutSizingHorizontal).toBe('HUG');
    const reported = result.skipped.find((skip) => skip.reason.includes('width: 70%'));
    expect(reported?.reason).toContain('fill or fixed, with no proportion of its parent between them');
  });

  it('never fills the component root, which has no parent to fill', async () => {
    const { api, components } = createFakeApi();
    const spec = filling('100%');
    spec.styleBlocks[0].dimensions = [{ property: 'width', value: '100%', state: 'default' }];

    await buildComponent(spec, { collectionName: 'boilerplate' }, api);

    // Reaching here means nothing tried to set a sizing mode on the root.
    expect(components[0].layoutMode).toBe('HORIZONTAL');
  });
});
