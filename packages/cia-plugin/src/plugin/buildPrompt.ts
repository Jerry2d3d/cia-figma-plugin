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

/** Layer name the Prompt instances live in, so mockup exports can strip them. */
export const PROMPT_LAYER_NAME = '_prompts';

const FONT: FontName = { family: 'Inter', style: 'Regular' };
const HEADER_FONT: FontName = { family: 'Inter', style: 'Semi Bold' };

const NOTE_FILL: SolidPaint = { type: 'SOLID', color: { r: 1, g: 0.972, b: 0.862 } };
const NOTE_STROKE: SolidPaint = { type: 'SOLID', color: { r: 0.905, g: 0.76, b: 0.325 } };
const HEADER_FILL: SolidPaint = { type: 'SOLID', color: { r: 0.42, g: 0.32, b: 0.03 } };
const RULE_FILL: SolidPaint = { type: 'SOLID', color: { r: 0.15, g: 0.13, b: 0.08 } };

const DEFAULT_RULE = 'Describe the rule for this part of the design.';
const WIDTH = 240;

export interface PromptApi {
  createComponent(): ComponentNode;
  createText(): TextNode;
  loadFontAsync(font: FontName): Promise<void>;
  combineAsVariants(nodes: ComponentNode[], parent: BaseNode & ChildrenMixin): ComponentSetNode;
  readonly currentPage: BaseNode & ChildrenMixin;
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
      component.resize(WIDTH, 1);
      component.layoutMode = 'VERTICAL';
      component.primaryAxisSizingMode = 'AUTO';
      component.counterAxisSizingMode = 'FIXED';
      component.counterAxisAlignItems = 'MIN';
      component.paddingTop = 12;
      component.paddingBottom = 12;
      component.paddingLeft = 12;
      component.paddingRight = 12;
      component.itemSpacing = 6;
      component.cornerRadius = 6;
      component.fills = [NOTE_FILL];
      component.strokes = [NOTE_STROKE];
      component.strokeWeight = 1;

      // A fixed caption, not a property: it states which variant this is, so a
      // Prompt is readable on the canvas without opening the right sidebar.
      const header = api.createText();
      header.name = 'scope';
      header.fontName = HEADER_FONT;
      header.fontSize = 10;
      header.characters = `PROMPT · ${scope.toUpperCase()} · ${kind.toUpperCase()}`;
      header.fills = [HEADER_FILL];
      header.layoutSizingHorizontal = 'FILL';
      component.appendChild(header);

      const rule = api.createText();
      rule.name = 'rule';
      rule.fontName = FONT;
      rule.fontSize = 12;
      rule.characters = DEFAULT_RULE;
      rule.fills = [RULE_FILL];
      rule.textAutoResize = 'HEIGHT';
      rule.layoutSizingHorizontal = 'FILL';
      component.appendChild(rule);

      const target = api.createText();
      target.name = 'target';
      target.fontName = FONT;
      target.fontSize = 10;
      target.characters = '';
      target.fills = [HEADER_FILL];
      target.textAutoResize = 'HEIGHT';
      target.layoutSizingHorizontal = 'FILL';
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
