import { BuildApi, buildComponent, DEFAULT_STROKE_WEIGHT } from '@/plugin/buildComponent';
import { ComponentSpec } from '@/shared/componentSpec';
import buttonSpecJson from '@/__fixtures__/Button.component-spec.json';

const buttonSpec = buttonSpecJson as ComponentSpec;

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

  fills: SolidPaint[] = [FIGMA_DEFAULT_FILL];

  strokes: SolidPaint[] = [];

  strokeWeight = 0;

  strokeAlign = '';

  layoutMode = 'NONE';

  primaryAxisSizingMode = '';

  counterAxisSizingMode = '';

  primaryAxisAlignItems = '';

  counterAxisAlignItems = '';

  children: FakeText[] = [];

  bound: Record<string, string> = {};

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
    expect(reasons).toContain(
      '.button: no variable named "font-weight-semibold" in the collection (needed for font(semibold, base, normal) as font weight)',
    );
    expect(reasons).toContain(
      '.small: no variable named "space-2xs" in the collection (needed for pad-asym(2xs, sm) as vertical padding)',
    );
    expect(reasons).toContain(
      '.small: no variable named "font-size-sm" in the collection (needed for font(semibold, sm, normal) as font size)',
    );
    expect(reasons).toContain(
      '.large: no variable named "font-size-lg" in the collection (needed for font(semibold, lg, normal) as font size)',
    );
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
    expect(skipped).toContain(
      '.button: font(semibold, base, normal): line height "normal" not bound (cia token is a unitless multiplier, Figma binds px)',
    );
    expect(result.gaps.some((gap) => gap.reason.includes('hover'))).toBe(false);
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

    expect(result.gaps.map((gap) => gap.reason)).toEqual([
      'no variable named "font-weight-normal" in the collection (needed for font(reg, base) as font weight)',
    ]);
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

  it('reports a Sass type preset as a gap rather than guessing which tokens it expands to', async () => {
    const { api } = createFakeApi();
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

    expect(result.gaps).toEqual([
      {
        where: '.title',
        reason:
          'type(display) is a Sass type preset with no token to bind; ' +
          'needs upstream expansion into font-size/font-weight',
      },
    ]);
    expect(result.skipped.map((skip) => skip.reason)).toEqual([
      'z(tooltip) skipped: z-index has no Figma equivalent',
      'line-height(normal) skipped: cia line height is a unitless multiplier, Figma binds px',
    ]);
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
              from: { fn: 'color', args: ['surface-default'] },
            },
            {
              property: 'border-color',
              localToken: '--dropdown-border-color',
              from: { fn: 'color', args: ['border-subtle'] },
            },
            {
              property: 'border-radius',
              localToken: '--dropdown-border-radius',
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
