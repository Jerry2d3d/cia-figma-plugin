import { BuildApi, buildComponent, DEFAULT_STROKE_WEIGHT } from '@/plugin/buildComponent';
import { ComponentSpec } from '@/shared/componentSpec';
import buttonSpecJson from '@/__fixtures__/Button.component-spec.json';
import headingSpecJson from '@/__fixtures__/Heading.component-spec.json';
import containerSpecJson from '@/__fixtures__/Container.component-spec.json';

const buttonSpec = buttonSpecJson as ComponentSpec;
const headingSpec = headingSpecJson as ComponentSpec;
const containerSpec = containerSpecJson as ComponentSpec;

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

  children: FakeText[] = [];

  bound: Record<string, string> = {};

  resize(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  appendChild(child: FakeText) {
    this.children.push(child);
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

  return { api, components, sets, loadedFonts };
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

    const label = primaryMedium.children[0];
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
    expect(boundColor(outlineLarge.children[0].fills[0])).toBe('text-primary');
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
    expect(skipped).toContain('.button: 4 hover call(s) skipped: v1 builds the default state only');
    expect(skipped).toContain('.button: 2 focus call(s) skipped: v1 builds the default state only');
    expect(skipped).toContain('.icon: part skipped: v1 builds the root frame and its label only');
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
    const label = small!.children[0];
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
      expect(component.children[0].componentPropertyReferences?.characters).toBe(sets[0].properties.label && 'label#1:0');
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
    expect(built.children[0].fontName.style).toBe('Bold');
    expect(built.children[0].bound).toEqual({ fontSize: 'font-size-xs', fontWeight: 'font-weight-bold' });
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
    expect(components[0].children[0].fontName).toEqual({ family: 'Inter', style: 'Medium Italic' });
    expect(components[0].children[0].bound.fontWeight).toBe('font-weight-medium');
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
    const label = components[0].children[0];
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

    expect(components[0].children[0].characters).toBe('Code');
    expect(components[0].properties.label).toEqual({ type: 'TEXT', defaultValue: 'Code' });
    expect(sets).toHaveLength(0);
  });

  it('falls back to the component name when a text prop declares no default', async () => {
    const { api, components } = createFakeApi();

    await buildComponent(buttonSpec, { collectionName: 'boilerplate' }, api);

    expect(components[0].children[0].characters).toBe('Button');
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
    expect(result.unbuiltPartCalls).toBe(3);
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

    expect(components[0].children[0].bound.fontSize).toBe('font-size-base');
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

    expect(components[0].children[0].fontSize).toBe(14);
    expect(components[0].children[0].bound.fontSize).toBeUndefined();
    expect(result.gaps[0].reason).toContain('used 14px');
  });

  it('says nothing when the same size is stated twice', async () => {
    const { api, components } = createFakeApi();

    const { result } = await buildComponent(foldedSpec(['sm', 'sm']), { collectionName: 'boilerplate' }, api);

    expect(components[0].children[0].fontSize).toBe(14);
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
    expect(small?.children[0].fontSize).toBe(14);
    expect(base?.children[0].bound.fontSize).toBe('font-size-base');
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
        return [level, component.children[0]];
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

  it('refuses to invent a number for a percentage, and says why', async () => {
    const { api, components } = createFakeApi();

    const { result } = await buildComponent(
      dimSpec([{ property: 'width', value: '100%', state: 'default' }]),
      { collectionName: 'boilerplate' },
      api,
    );

    expect(components[0].width).toBe(100);
    expect(result.skipped[0].reason).toContain('width: 100% not applied');
    expect(result.skipped[0].reason).toContain('has no parent');
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
