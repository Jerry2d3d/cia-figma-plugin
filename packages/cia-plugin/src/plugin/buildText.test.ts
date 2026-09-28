import { BuildApi } from '@/plugin/buildComponent';
import {
  TEXT_COLOUR_TOKEN,
  TEXT_COMPONENT_NAME,
  TYPE_PRESETS,
  WRAP_WIDTH,
  buildTextComponent,
} from '@/plugin/buildText';

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

  fontSize = 12;

  lineHeight: LineHeight = { unit: 'AUTO' };

  letterSpacing: LetterSpacing = { value: 0, unit: 'PERCENT' };

  textCase = 'ORIGINAL';

  textAutoResize = 'NONE';

  width = 0;

  height = 16;

  fills: SolidPaint[] = [];

  bound: Record<string, string> = {};

  componentPropertyReferences: Record<string, string> | null = null;

  setBoundVariable(field: string, variable: Variable) {
    this.bound[field] = variable.id;
  }

  resize(width: number, height: number) {
    this.width = width;
    this.height = height;
  }
}

class FakeComponent {
  name = '';

  layoutMode = 'NONE';

  primaryAxisSizingMode = '';

  counterAxisSizingMode = '';

  fills: SolidPaint[] = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];

  children: FakeText[] = [];

  appendChild(child: FakeText) {
    this.children.push(child);
  }
}

class FakeComponentSet {
  name = '';

  properties: Record<string, { type: string; defaultValue: string }> = {};

  constructor(public children: FakeComponent[]) {}

  addComponentProperty(name: string, type: string, defaultValue: string) {
    this.properties[name] = { type, defaultValue };
    return `${name}#1:0`;
  }
}

/**
 * The real cia export today: one step per axis and no derived tokens. `extra`
 * is for the day the derived tokens land, so the bind-when-present path is
 * exercised by a test that says out loud it is hypothetical.
 */
function createFakeApi(extra: string[] = []) {
  const collection = { id: 'c1', name: 'cia' } as unknown as VariableCollection;
  const variables = [
    new FakeVariable(TEXT_COLOUR_TOKEN, 'c1', 'COLOR'),
    new FakeVariable('font-size-base', 'c1', 'FLOAT'),
    new FakeVariable('font-weight-medium', 'c1', 'FLOAT'),
    new FakeVariable('line-height-normal', 'c1', 'FLOAT'),
    ...extra.map((name) => new FakeVariable(name, 'c1', 'FLOAT')),
  ];
  const components: FakeComponent[] = [];
  const sets: FakeComponentSet[] = [];
  const loadedFonts: FontName[] = [];

  const api = {
    getLocalVariableCollectionsAsync: async () => [collection],
    getLocalVariablesAsync: async () => variables as unknown as Variable[],
    createComponent: () => {
      const component = new FakeComponent();
      components.push(component);
      return component as unknown as ComponentNode;
    },
    createText: () => new FakeText() as unknown as TextNode,
    createFrame: () => ({}) as FrameNode,
    loadFontAsync: async (font: FontName) => {
      loadedFonts.push(font);
    },
    setBoundVariableForPaint: (paint: SolidPaint, field: string, variable: Variable) =>
      ({ ...paint, boundVariables: { [field]: { type: 'VARIABLE_ALIAS', id: variable.id } } }) as SolidPaint,
    combineAsVariants: (nodes: ComponentNode[]) => {
      const set = new FakeComponentSet(nodes as unknown as FakeComponent[]);
      sets.push(set);
      return set as unknown as ComponentSetNode;
    },
    currentPage: {} as BaseNode & ChildrenMixin,
  } as unknown as BuildApi;

  return { api, components, sets, loadedFonts };
}

const textOf = (component: FakeComponent) => component.children[0];
const find = (components: FakeComponent[], preset: string, wrap: 'yes' | 'no') =>
  components.find((component) => component.name === `preset=${preset}, wrap=${wrap}`) as FakeComponent;

describe('the Text component', () => {
  it('builds one variant per cia preset, with and without wrapping', async () => {
    const { api, components, sets } = createFakeApi();

    const { result, node } = await buildTextComponent({ collectionName: 'cia' }, api);

    expect(result.component).toBe(TEXT_COMPONENT_NAME);
    expect(components).toHaveLength(TYPE_PRESETS.length * 2);
    expect(sets[0].name).toBe(TEXT_COMPONENT_NAME);
    expect(node).toBe(sets[0]);
    expect(result.variantNames).toContain('preset=heading-1, wrap=no');
    expect(result.variantNames).toContain('preset=body, wrap=yes');
  });

  it("gives each preset cia's own size, weight and line height", async () => {
    const { api, components } = createFakeApi();

    await buildTextComponent({ collectionName: 'cia' }, api);

    // heading-1 is step 7, bold, line height 1.25. Not the 32 a hand demo used.
    const h1 = textOf(find(components, 'heading-1', 'no'));
    expect(h1.fontSize).toBe(30);
    expect(h1.fontName).toEqual({ family: 'Inter', style: 'Bold' });
    expect(h1.lineHeight).toEqual({ value: 125, unit: 'PERCENT' });

    const h3 = textOf(find(components, 'heading-3', 'no'));
    expect(h3.fontSize).toBe(20);
    expect(h3.fontName.style).toBe('Semi Bold');
    expect(h3.lineHeight).toEqual({ value: 137.5, unit: 'PERCENT' });

    const overline = textOf(find(components, 'overline', 'no'));
    expect(overline.textCase).toBe('UPPER');
    expect(overline.letterSpacing).toEqual({ value: 5, unit: 'PERCENT' });
    // Only display and overline carry spacing; the rest must not inherit it.
    expect(h1.letterSpacing).toEqual({ value: 0, unit: 'PERCENT' });
  });

  it('exposes the text as one property wired to every variant', async () => {
    const { api, components, sets } = createFakeApi();

    const { result } = await buildTextComponent({ collectionName: 'cia' }, api);

    expect(result.properties).toEqual(['text: TEXT']);
    expect(sets[0].properties.text).toEqual({ type: 'TEXT', defaultValue: 'Text' });
    components.forEach((component) => {
      expect(textOf(component).componentPropertyReferences?.characters).toBe('text#1:0');
    });
  });

  it('wraps by holding a width and letting the height follow', async () => {
    const { api, components } = createFakeApi();

    await buildTextComponent({ collectionName: 'cia' }, api);

    const wrapped = textOf(find(components, 'body', 'yes'));
    expect(wrapped.textAutoResize).toBe('HEIGHT');
    expect(wrapped.width).toBe(WRAP_WIDTH);
    const loose = textOf(find(components, 'body', 'no'));
    expect(loose.textAutoResize).toBe('WIDTH_AND_HEIGHT');
  });

  it('binds what the collection has and reports what it does not, against the real export', async () => {
    const { api, components } = createFakeApi();

    const { result } = await buildTextComponent({ collectionName: 'cia' }, api);

    // body is step 3, which is `base`, the one size cia exports today.
    const body = textOf(find(components, 'body', 'no'));
    expect(body.bound.fontSize).toBe('font-size-base');
    expect(body.bound.lineHeight).toBe('line-height-normal');
    // heading-4 is the one preset whose weight, medium, cia exports.
    expect(textOf(find(components, 'heading-4', 'no')).bound.fontWeight).toBe('font-weight-medium');
    // heading-1 has none of them, so its values are set as numbers and said so.
    const h1 = textOf(find(components, 'heading-1', 'no'));
    expect(h1.bound.fontSize).toBeUndefined();
    expect(h1.fontSize).toBe(30);
    expect(result.unthemeable).toContain('font-size-7 (30px)');
    expect(result.unthemeable).toContain('font-weight-bold (700)');
    expect(result.unthemeable).toContain('line-height-2 (125%)');
    // Every text starts on the primary text colour, bound.
    expect(body.fills[0].boundVariables?.color?.id).toBe(TEXT_COLOUR_TOKEN);
    expect(result.gaps).toEqual([]);
  });

  it('binds everything the day the derived tokens exist, with no change here', async () => {
    // Hypothetical: the list sent upstream, as it would arrive.
    const { api, components } = createFakeApi([
      'font-size-7',
      'font-weight-bold',
      'line-height-2',
      'letter-spacing-tight',
      'font-size-8',
    ]);

    const { result } = await buildTextComponent({ collectionName: 'cia' }, api);

    const h1 = textOf(find(components, 'heading-1', 'no'));
    expect(h1.bound).toEqual({
      fontSize: 'font-size-7',
      fontWeight: 'font-weight-bold',
      lineHeight: 'line-height-2',
    });
    const display = textOf(find(components, 'display', 'no'));
    expect(display.bound.letterSpacing).toBe('letter-spacing-tight');
    expect(result.unthemeable).not.toContain('font-size-7 (30px)');
  });

  it('accepts a size by its alias, since a step and its alias are one entry in cia', async () => {
    const { api, components } = createFakeApi(['font-size-3xl']);

    await buildTextComponent({ collectionName: 'cia' }, api);

    expect(textOf(find(components, 'heading-1', 'no')).bound.fontSize).toBe('font-size-3xl');
  });

  it('says so when the collection has no text colour, rather than silently starting black', async () => {
    const { api } = createFakeApi();
    (api.getLocalVariablesAsync as unknown as () => Promise<Variable[]>) = async () =>
      [new FakeVariable('font-size-base', 'c1', 'FLOAT')] as unknown as Variable[];

    const { result } = await buildTextComponent({ collectionName: 'cia' }, api);

    expect(result.gaps[0]).toContain(`no variable named "${TEXT_COLOUR_TOKEN}"`);
  });

  it('refuses a collection that does not exist, naming the ones that do', async () => {
    const { api } = createFakeApi();

    await expect(buildTextComponent({ collectionName: 'nope' }, api)).rejects.toThrow(
      'no local Variable collection named "nope" (have: cia)',
    );
  });

  it('loads each font style once, since Figma needs it before any text is set', async () => {
    const { api, loadedFonts } = createFakeApi();

    await buildTextComponent({ collectionName: 'cia' }, api);

    const styles = new Set(loadedFonts.map((font) => font.style));
    expect(styles).toEqual(new Set(['Bold', 'Semi Bold', 'Medium', 'Regular']));
  });
});
