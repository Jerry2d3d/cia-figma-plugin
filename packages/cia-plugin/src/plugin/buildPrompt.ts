/**
 * The `Prompt` component: how a PMO leaves rules for the AI inside a Figma
 * file, next to the part of the design they apply to ("this login is Google",
 * "leave this blank", "behind feature flag X").
 *
 * Unlike every other component this plugin builds, Prompt has no BoilerPlate
 * source and no component spec — it is tooling, not part of the design system.
 * So it is hand-defined here, and deliberately uses flat colours rather than
 * Variables: it must look the same in every theme and must never be mistaken
 * for a design element.
 *
 * Figma comments stay human-only. This component is the one channel the
 * pipeline reads.
 */

export const PROMPT_COMPONENT_NAME = 'Prompt';

/** Where a rule applies. Placement decides it: a Prompt inside a frame governs that frame. */
export const PROMPT_SCOPES = ['app', 'page', 'section', 'component'] as const;

/** What a rule is about: the page itself, or how it gets built. */
export const PROMPT_KINDS = ['page', 'tooling'] as const;

export type PromptScope = (typeof PROMPT_SCOPES)[number];
export type PromptKind = (typeof PROMPT_KINDS)[number];

/**
 * What each scope governs, shown on the component itself.
 *
 * Scope is authoritative and placement is the weaker signal: the two are
 * allowed to differ, and routinely do when the library and the screens share
 * one file, because there is no separate cover page for app-scoped rules to
 * live on. Saying so on the component means a PM reads it at the moment they
 * choose the scope, rather than being expected to remember a convention from a
 * document they never saw.
 */
export const SCOPE_HINTS: Record<PromptScope, string> = {
  app: 'Governs the whole app, wherever this note sits.',
  page: 'Governs the frame this note sits inside.',
  section: 'Governs the section this note sits inside.',
  component: 'Governs the layer named in target, below.',
};

export const KIND_HINTS: Record<PromptKind, string> = {
  page: 'A rule about what the page does.',
  tooling: 'A rule about how it gets built.',
};

/** Layer name the Prompt instances live in, so mockup exports can strip them. */
export const PROMPT_LAYER_NAME = '_prompts';

const FONT: FontName = { family: 'Inter', style: 'Regular' };
const HEADER_FONT: FontName = { family: 'Inter', style: 'Semi Bold' };

const NOTE_FILL: SolidPaint = { type: 'SOLID', color: { r: 1, g: 0.972, b: 0.862 } };
const NOTE_STROKE: SolidPaint = { type: 'SOLID', color: { r: 0.905, g: 0.76, b: 0.325 } };
const HEADER_FILL: SolidPaint = { type: 'SOLID', color: { r: 0.42, g: 0.32, b: 0.03 } };
const RULE_FILL: SolidPaint = { type: 'SOLID', color: { r: 0.15, g: 0.13, b: 0.08 } };

const DEFAULT_RULE = 'Describe the rule for this part of the design.';
const PADDING = 12;
/**
 * Text nodes get an explicit width and the frame hugs them, rather than the
 * frame being fixed-width and the children filling it. `layoutSizingHorizontal`
 * only works once a node is already inside an auto-layout frame, and `resize`
 * on an auto-layout frame flips that axis to fixed — sizing the text instead
 * avoids both traps.
 */
const TEXT_WIDTH = 216;

export interface PromptApi {
  createComponent(): ComponentNode;
  createText(): TextNode;
  loadFontAsync(font: FontName): Promise<void>;
  combineAsVariants(nodes: ComponentNode[], parent: BaseNode & ChildrenMixin): ComponentSetNode;
  readonly currentPage: BaseNode & ChildrenMixin;
}

interface TextSpec {
  name: string;
  font: FontName;
  size: number;
  characters: string;
  fill: SolidPaint;
}

function createSizedText(api: PromptApi, spec: TextSpec): TextNode {
  const text = api.createText();
  text.name = spec.name;
  // Font first: `characters` and every later text edit require it loaded.
  text.fontName = spec.font;
  text.characters = spec.characters;
  text.fontSize = spec.size;
  text.fills = [spec.fill];
  text.textAutoResize = 'HEIGHT';
  text.resize(TEXT_WIDTH, text.height);
  return text;
}

export interface PromptBuildResult {
  component: string;
  variantNames: string[];
  properties: string[];
}

function variantName(scope: PromptScope, kind: PromptKind): string {
  return `scope=${scope}, kind=${kind}`;
}

/**
 * Builds the Prompt component set: every scope x kind combination as a Figma
 * variant, plus `rule` and `target` as TEXT properties so a PMO fills them in
 * on the instance and the screen read-back can report them.
 */
export async function buildPromptComponent(api: PromptApi): Promise<{
  result: PromptBuildResult;
  node: ComponentSetNode;
}> {
  await api.loadFontAsync(FONT);
  await api.loadFontAsync(HEADER_FONT);

  const components: ComponentNode[] = [];
  const ruleTexts: TextNode[] = [];
  const targetTexts: TextNode[] = [];

  PROMPT_SCOPES.forEach((scope) => {
    PROMPT_KINDS.forEach((kind) => {
      const component = api.createComponent();
      component.name = variantName(scope, kind);
      // Both axes hug: the children carry the width (see TEXT_WIDTH).
      component.layoutMode = 'VERTICAL';
      component.primaryAxisSizingMode = 'AUTO';
      component.counterAxisSizingMode = 'AUTO';
      component.counterAxisAlignItems = 'MIN';
      component.paddingTop = PADDING;
      component.paddingBottom = PADDING;
      component.paddingLeft = PADDING;
      component.paddingRight = PADDING;
      component.itemSpacing = 6;
      component.cornerRadius = 6;
      component.fills = [NOTE_FILL];
      component.strokes = [NOTE_STROKE];
      component.strokeWeight = 1;

      // A fixed caption, not a property: it states which variant this is, so a
      // Prompt is readable on the canvas without opening the right sidebar.
      const header = createSizedText(api, {
        name: 'scope',
        font: HEADER_FONT,
        size: 10,
        characters: `PROMPT · ${scope.toUpperCase()} · ${kind.toUpperCase()}`,
        fill: HEADER_FILL,
      });
      component.appendChild(header);

      const hint = createSizedText(api, {
        name: 'hint',
        font: FONT,
        size: 9,
        characters: `${SCOPE_HINTS[scope]} ${KIND_HINTS[kind]}`,
        fill: HEADER_FILL,
      });
      component.appendChild(hint);

      const rule = createSizedText(api, {
        name: 'rule',
        font: FONT,
        size: 12,
        characters: DEFAULT_RULE,
        fill: RULE_FILL,
      });
      component.appendChild(rule);

      const target = createSizedText(api, {
        name: 'target',
        font: FONT,
        size: 10,
        // Placeholder for the unbound layer only. The TEXT property default
        // below is empty on purpose: figma-import-export reads a non-empty
        // `target` as a real layer name, so a placeholder default would be
        // read as a target the PM never set.
        characters: 'target',
        fill: HEADER_FILL,
      });
      component.appendChild(target);

      components.push(component);
      ruleTexts.push(rule);
      targetTexts.push(target);
    });
  });

  const node = api.combineAsVariants(components, api.currentPage);
  node.name = PROMPT_COMPONENT_NAME;

  const ruleId = node.addComponentProperty('rule', 'TEXT', DEFAULT_RULE);
  // A layer name, for a rule about one instance: Figma does not allow placing
  // a node inside an instance, so the Prompt sits beside it and names it.
  const targetId = node.addComponentProperty('target', 'TEXT', '');

  ruleTexts.forEach((text) => {
    text.componentPropertyReferences = { ...(text.componentPropertyReferences ?? {}), characters: ruleId };
  });
  targetTexts.forEach((text) => {
    text.componentPropertyReferences = { ...(text.componentPropertyReferences ?? {}), characters: targetId };
  });

  return {
    node,
    result: {
      component: PROMPT_COMPONENT_NAME,
      variantNames: components.map((component) => component.name),
      properties: ['rule: TEXT', 'target: TEXT'],
    },
  };
}
