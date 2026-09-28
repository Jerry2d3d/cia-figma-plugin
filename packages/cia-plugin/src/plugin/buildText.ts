/**
 * The `Text` library component: one variant per cia type preset, so anywhere a
 * component needs text it places an instance and picks the preset, and the size,
 * weight, line height and spacing come with it.
 *
 * Jerry built this by hand first, with h1, h2 and h3, and pointed at Avatar as
 * the reason: its text sat at Figma's default because nothing existed to bind a
 * size to. This is the same idea built from cia's own presets, with cia's own
 * values, so what a designer places is what the code renders.
 *
 * Every typographic field is BOUND to a variable when the collection has one and
 * written as a number when it does not, with the number reported as unable to
 * follow a theme. Today the collection carries one step per axis, so most of
 * these are numbers; the day the derived tokens land upstream, the same build
 * binds them all and nothing here changes.
 *
 * Presets are copied from css-is-awesome's `$_type-scale`, sizes from
 * `$font-sizes`, line heights from `$line-heights` and spacing from
 * `$letter-spacings`. No theme overrides the scale, so a bound value is the same
 * in every mode; the variable is one place to change, not per-theme variation.
 */
import { BuildApi } from '@/plugin/buildComponent';

export const TEXT_COMPONENT_NAME = 'Text';

export interface TypePreset {
  /** The cia preset name, which is the variant value. */
  name: string;
  /** Numbered step in cia's size scale. */
  sizeStep: number;
  sizePx: number;
  weight: string;
  /** Style name in Figma's Inter family. */
  figmaStyle: string;
  weightValue: number;
  /** Numbered step in cia's line-height scale. */
  lineHeightStep: number;
  lineHeightPercent: number;
  letterSpacing?: { key: string; percent: number };
  uppercase?: boolean;
  /** What the placeholder says, so a placed instance is readable at a glance. */
  placeholder: string;
}

/** cia's `$_type-scale`, with every step resolved to its value. */
export const TYPE_PRESETS: TypePreset[] = [
  { name: 'display', sizeStep: 8, sizePx: 36, weight: 'bold', figmaStyle: 'Bold', weightValue: 700, lineHeightStep: 2, lineHeightPercent: 125, letterSpacing: { key: 'tight', percent: -2.5 }, placeholder: 'Display' },
  { name: 'heading-1', sizeStep: 7, sizePx: 30, weight: 'bold', figmaStyle: 'Bold', weightValue: 700, lineHeightStep: 2, lineHeightPercent: 125, placeholder: 'Heading 1' },
  { name: 'heading-2', sizeStep: 6, sizePx: 24, weight: 'semibold', figmaStyle: 'Semi Bold', weightValue: 600, lineHeightStep: 2, lineHeightPercent: 125, placeholder: 'Heading 2' },
  { name: 'heading-3', sizeStep: 5, sizePx: 20, weight: 'semibold', figmaStyle: 'Semi Bold', weightValue: 600, lineHeightStep: 3, lineHeightPercent: 137.5, placeholder: 'Heading 3' },
  { name: 'heading-4', sizeStep: 4, sizePx: 18, weight: 'medium', figmaStyle: 'Medium', weightValue: 500, lineHeightStep: 4, lineHeightPercent: 150, placeholder: 'Heading 4' },
  { name: 'body', sizeStep: 3, sizePx: 16, weight: 'normal', figmaStyle: 'Regular', weightValue: 400, lineHeightStep: 4, lineHeightPercent: 150, placeholder: 'Body text' },
  { name: 'body-sm', sizeStep: 2, sizePx: 14, weight: 'normal', figmaStyle: 'Regular', weightValue: 400, lineHeightStep: 4, lineHeightPercent: 150, placeholder: 'Small body text' },
  { name: 'caption', sizeStep: 1, sizePx: 12, weight: 'normal', figmaStyle: 'Regular', weightValue: 400, lineHeightStep: 4, lineHeightPercent: 150, placeholder: 'Caption' },
  { name: 'overline', sizeStep: 1, sizePx: 12, weight: 'semibold', figmaStyle: 'Semi Bold', weightValue: 600, lineHeightStep: 4, lineHeightPercent: 150, letterSpacing: { key: 'wider', percent: 5 }, uppercase: true, placeholder: 'Overline' },
];

/** The default text colour every instance starts with; a designer overrides the fill. */
export const TEXT_COLOUR_TOKEN = 'text-primary';

/** Width a wrapping variant holds, so it has a line to wrap at. */
export const WRAP_WIDTH = 320;

export const DEFAULT_FONT_FAMILY = 'Inter';

export interface TextBuildResult {
  component: string;
  collection: string;
  variantNames: string[];
  properties: string[];
  bindings: number;
  /** Values applied as numbers because no variable exists to bind. */
  unthemeable: string[];
  /** The collection has no text colour, so instances start black. */
  gaps: string[];
}

export interface TextBuildOptions {
  collectionName: string;
}

function variantName(preset: string, wrap: boolean): string {
  return `preset=${preset}, wrap=${wrap ? 'yes' : 'no'}`;
}

/**
 * Builds the Text component set: nine presets, each with and without wrapping,
 * and the text itself as a property so it is edited on the instance.
 */
export async function buildTextComponent(
  options: TextBuildOptions,
  api: BuildApi,
): Promise<{ result: TextBuildResult; node: ComponentSetNode }> {
  const collections = await api.getLocalVariableCollectionsAsync();
  const collection = collections.find((candidate) => candidate.name === options.collectionName);
  if (!collection) {
    throw new Error(
      `no local Variable collection named "${options.collectionName}" (have: ${collections.map((c) => c.name).join(', ') || 'none'})`,
    );
  }
  const byName = new Map<string, Variable>();
  (await api.getLocalVariablesAsync()).forEach((variable) => {
    if (variable.variableCollectionId === collection.id) {
      byName.set(variable.name, variable);
    }
  });
  // A step and its alias name one entry in cia's map, so either variable binds.
  const lookup = (...names: string[]) => names.map((name) => byName.get(name)).find(Boolean);

  const unthemeable = new Set<string>();
  const gaps: string[] = [];
  let bindings = 0;
  const components: ComponentNode[] = [];
  const texts: TextNode[] = [];

  const colour = byName.get(TEXT_COLOUR_TOKEN);
  if (!colour) {
    gaps.push(`no variable named "${TEXT_COLOUR_TOKEN}" in ${collection.name}, so text starts black rather than bound`);
  }

  for (const preset of TYPE_PRESETS) {
    const font: FontName = { family: DEFAULT_FONT_FAMILY, style: preset.figmaStyle };
    // eslint-disable-next-line no-await-in-loop
    await api.loadFontAsync(font);

    for (const wrap of [false, true]) {
      const component = api.createComponent();
      component.name = variantName(preset.name, wrap);
      component.layoutMode = 'HORIZONTAL';
      component.primaryAxisSizingMode = 'AUTO';
      component.counterAxisSizingMode = 'AUTO';
      // A component arrives with an opaque white fill nobody asked for.
      component.fills = [];

      const text = api.createText();
      text.name = 'text';
      text.fontName = font;
      text.characters = preset.placeholder;
      component.appendChild(text);

      // Size: bound when the collection has it, a number when it does not.
      const sizeVariable = lookup(`font-size-${preset.sizeStep}`, sizeAlias(preset.sizeStep));
      text.fontSize = preset.sizePx;
      if (sizeVariable) {
        text.setBoundVariable('fontSize', sizeVariable);
        bindings += 1;
      } else {
        unthemeable.add(`font-size-${preset.sizeStep} (${preset.sizePx}px)`);
      }

      // Weight: the style is always set, since Figma derives the weight from it;
      // the binding is what would let a theme change it.
      const weightVariable = byName.get(`font-weight-${preset.weight}`);
      if (weightVariable) {
        text.setBoundVariable('fontWeight', weightVariable);
        bindings += 1;
      } else {
        unthemeable.add(`font-weight-${preset.weight} (${preset.weightValue})`);
      }

      // Line height and spacing are percentages, because a unitless multiplier
      // has no Figma unit and 1.25 is exactly 125%.
      text.lineHeight = { value: preset.lineHeightPercent, unit: 'PERCENT' };
      // The numbered step ONLY, never its alias. cia declares `line-height-normal`
      // as the multiplier 1.5 and the derived `line-height-4` as the percentage
      // 150, and both sit in the same file. Bound to a node whose unit is PERCENT,
      // the alias reads as 1.5%. A test on the token file pins this hazard.
      const lineHeightVariable = byName.get(`line-height-${preset.lineHeightStep}`);
      if (lineHeightVariable) {
        text.setBoundVariable('lineHeight', lineHeightVariable);
        bindings += 1;
      } else {
        unthemeable.add(`line-height-${preset.lineHeightStep} (${preset.lineHeightPercent}%)`);
      }

      if (preset.letterSpacing) {
        text.letterSpacing = { value: preset.letterSpacing.percent, unit: 'PERCENT' };
        const spacingVariable = byName.get(`letter-spacing-${preset.letterSpacing.key}`);
        if (spacingVariable) {
          text.setBoundVariable('letterSpacing', spacingVariable);
          bindings += 1;
        } else {
          unthemeable.add(`letter-spacing-${preset.letterSpacing.key} (${preset.letterSpacing.percent}%)`);
        }
      }
      if (preset.uppercase) {
        text.textCase = 'UPPER';
      }

      if (colour) {
        text.fills = [api.setBoundVariableForPaint({ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }, 'color', colour)];
        bindings += 1;
      }

      // Wrapping is a fixed width with the height following the text. Not
      // wrapping lets the text set its own width. Both hug in the component.
      if (wrap) {
        text.textAutoResize = 'HEIGHT';
        text.resize(WRAP_WIDTH, text.height);
      } else {
        text.textAutoResize = 'WIDTH_AND_HEIGHT';
      }

      components.push(component);
      texts.push(text);
    }
  }

  const node = api.combineAsVariants(components, api.currentPage);
  node.name = TEXT_COMPONENT_NAME;

  const textId = node.addComponentProperty('text', 'TEXT', 'Text');
  texts.forEach((text) => {
    text.componentPropertyReferences = { ...(text.componentPropertyReferences ?? {}), characters: textId };
  });

  return {
    node,
    result: {
      component: TEXT_COMPONENT_NAME,
      collection: collection.name,
      variantNames: components.map((component) => component.name),
      properties: ['text: TEXT'],
      bindings,
      unthemeable: [...unthemeable].sort(),
      gaps,
    },
  };
}

/** cia's `$font-sizes-aliases`: the other name each numbered step goes by. */
function sizeAlias(step: number): string {
  const aliases: Record<number, string> = { 1: 'xs', 2: 'sm', 3: 'base', 4: 'lg', 5: 'xl', 6: '2xl', 7: '3xl', 8: '4xl', 9: '5xl', 10: '6xl' };
  return `font-size-${aliases[step] ?? step}`;
}

