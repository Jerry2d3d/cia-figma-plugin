import {
  buildPromptComponent,
  PROMPT_COMPONENT_NAME,
  PROMPT_KINDS,
  PROMPT_SCOPES,
  PromptApi,
} from '@/plugin/buildPrompt';

class FakeText {
  name = '';

  fontName: FontName = { family: '', style: '' };

  fontSize = 0;

  characters = '';

  fills: SolidPaint[] = [];

  textAutoResize = '';

  layoutSizingHorizontal = '';

  componentPropertyReferences: Record<string, string> | null = null;
}

class FakeComponent {
  name = '';

  width = 0;

  layoutMode = 'NONE';

  primaryAxisSizingMode = '';

  counterAxisSizingMode = '';

  counterAxisAlignItems = '';

  paddingTop = 0;

  paddingBottom = 0;

  paddingLeft = 0;

  paddingRight = 0;

  itemSpacing = 0;

  cornerRadius = 0;

  fills: SolidPaint[] = [];

  strokes: SolidPaint[] = [];

  strokeWeight = 0;

  children: FakeText[] = [];

  resize(width: number) {
    this.width = width;
  }

  appendChild(child: FakeText) {
    this.children.push(child);
  }
}

class FakeComponentSet {
  name = '';

  properties: Record<string, { type: string; defaultValue: string | boolean }> = {};

  private counter = 0;

  constructor(public children: FakeComponent[]) {}

  addComponentProperty(name: string, type: string, defaultValue: string | boolean) {
    this.counter += 1;
    this.properties[name] = { type, defaultValue };
    return `${name}#${this.counter}:0`;
  }
}

function createFakeApi() {
  const components: FakeComponent[] = [];
  const sets: FakeComponentSet[] = [];
  const loadedFonts: FontName[] = [];
  const page = {} as BaseNode & ChildrenMixin;

  const api: PromptApi = {
    createComponent: () => {
      const component = new FakeComponent();
      components.push(component);
      return component as unknown as ComponentNode;
    },
    createText: () => new FakeText() as unknown as TextNode,
    loadFontAsync: async (font) => {
      loadedFonts.push(font);
    },
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

describe('buildPromptComponent', () => {
  it('builds every scope and kind combination as one component set', async () => {
    const { api, components, sets } = createFakeApi();

    const { result, node } = await buildPromptComponent(api);

    expect(components).toHaveLength(PROMPT_SCOPES.length * PROMPT_KINDS.length);
    expect(node).toBe(sets[0]);
    expect(sets[0].name).toBe(PROMPT_COMPONENT_NAME);
    expect(result.variantNames[0]).toBe('scope=app, kind=page');
    expect(result.variantNames).toContain('scope=component, kind=tooling');
    expect(result.variantNames).toHaveLength(8);
  });

  it('exposes rule and target as TEXT properties wired to every variant', async () => {
    const { api, components, sets } = createFakeApi();

    const { result } = await buildPromptComponent(api);

    expect(result.properties).toEqual(['rule: TEXT', 'target: TEXT']);
    expect(sets[0].properties.rule.type).toBe('TEXT');
    expect(sets[0].properties.target).toEqual({ type: 'TEXT', defaultValue: '' });
    components.forEach((component) => {
      const [, rule, target] = component.children;
      expect(rule.name).toBe('rule');
      expect(rule.componentPropertyReferences?.characters).toBe('rule#1:0');
      expect(target.name).toBe('target');
      expect(target.componentPropertyReferences?.characters).toBe('target#2:0');
    });
  });

  it('captions each variant on the canvas so a Prompt is readable without the sidebar', async () => {
    const { api, components } = createFakeApi();

    await buildPromptComponent(api);

    const sectionTooling = components.find((c) => c.name === 'scope=section, kind=tooling') as FakeComponent;
    expect(sectionTooling.children[0].characters).toBe('PROMPT · SECTION · TOOLING');
  });

  it('uses flat colours and vertical auto-layout, never theme Variables', async () => {
    const { api, components, loadedFonts } = createFakeApi();

    await buildPromptComponent(api);

    const first = components[0];
    expect(first.layoutMode).toBe('VERTICAL');
    expect(first.primaryAxisSizingMode).toBe('AUTO');
    expect(first.width).toBe(240);
    expect(first.fills[0]).toMatchObject({ type: 'SOLID' });
    expect(first.fills[0].boundVariables).toBeUndefined();
    expect(first.strokes[0].boundVariables).toBeUndefined();
    expect(loadedFonts).toContainEqual({ family: 'Inter', style: 'Regular' });
    expect(loadedFonts).toContainEqual({ family: 'Inter', style: 'Semi Bold' });
  });
});
