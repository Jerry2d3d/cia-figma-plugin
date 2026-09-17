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

  setBoundVariable(field: string, variable: Variable) {
    this.bound[field] = variable.id;
  }
}

class FakeComponent {
  name = '';

  fills: SolidPaint[] = [];

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

class FakeComponentSet {
  name = '';

  constructor(public children: FakeComponent[]) {}
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
];
const BOILERPLATE_FLOATS = [
  'space-xs',
  'space-sm',
  'space-md',
  'space-lg',
  'radius-lg',
  'font-size-base',
  'font-weight-medium',
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
    expect(result.variantNames[0]).toBe('variant=primary, size=small');
    expect(result.variantNames[11]).toBe('variant=ghost, size=large');
  });

  it('binds fills, strokes, padding, radius, gap and typography of variant=primary, size=medium to real variables', async () => {
    const { api, components, loadedFonts } = createFakeApi();

    await buildComponent(buttonSpec, { collectionName: 'boilerplate' }, api);

    const primaryMedium = components.find((c) => c.name === 'variant=primary, size=medium') as FakeComponent;
    expect(boundColor(primaryMedium.fills[0])).toBe('action-primary-default');
    expect(boundColor(primaryMedium.strokes[0])).toBe('action-primary-default');
    expect(primaryMedium.strokeWeight).toBe(DEFAULT_STROKE_WEIGHT);
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
    expect(reasons).toContain(
      `contract: spec carries border-color but no border width; stroke weight defaulted to ${DEFAULT_STROKE_WEIGHT}px`,
    );
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
    expect(result).toMatchObject({ variantNames: ['Card'], bindings: 9, gaps: [] });
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
