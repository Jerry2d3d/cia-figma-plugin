import { UiToPluginMessage, postToUi } from '@/shared/messages';
import { normaliseAliases, validateTokenContract } from '@/shared/tokenContract';
import { validateComponentSpec } from '@/shared/componentSpec';
import { syncTokenContract } from '@/plugin/syncTokens';
import { BuildApi, BuildResult, buildComponent } from '@/plugin/buildComponent';
import { layoutInGrid, originBelow } from '@/plugin/layoutNodes';
import { PROMPT_COMPONENT_NAME, PromptApi, buildPromptComponent } from '@/plugin/buildPrompt';
import { TEXT_COMPONENT_NAME, buildTextComponent } from '@/plugin/buildText';
import { VariableMapApi, writeVariableMap } from '@/plugin/variableMap';
import { MarkableNode, markFrame } from '@/plugin/frameType';

figma.showUI(__html__, { width: 380, height: 600 });

const buildApi: BuildApi & PromptApi = {
  getLocalVariableCollectionsAsync: () => figma.variables.getLocalVariableCollectionsAsync(),
  getLocalVariablesAsync: () => figma.variables.getLocalVariablesAsync(),
  createComponent: () => figma.createComponent(),
  createText: () => figma.createText(),
  createFrame: () => figma.createFrame(),
  loadFontAsync: (font) => figma.loadFontAsync(font),
  setBoundVariableForPaint: (paint, field, variable) =>
    figma.variables.setBoundVariableForPaint(paint, field, variable),
  combineAsVariants: (nodes, parent) => figma.combineAsVariants(nodes, parent),
  get currentPage() {
    return figma.currentPage;
  },
};

function reveal(node: SceneNode): void {
  figma.currentPage.selection = [node];
  figma.viewport.scrollAndZoomIntoView([node]);
}

/**
 * Names of the component sets and components already on the page. Building
 * again makes a second set rather than updating the first, which is easy to do
 * by accident and leaves duplicates in the assets panel. Nothing is deleted
 * here: an existing set may already have instances placed from it, and
 * removing it would detach them. The build is reported instead.
 */
function existingComponentNames(): Set<string> {
  const names = new Set<string>();
  figma.currentPage.children.forEach((node) => {
    if (node.type === 'COMPONENT_SET' || node.type === 'COMPONENT') {
      names.add(node.name);
    }
  });
  return names;
}

async function sendCollections(): Promise<void> {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  postToUi({ type: 'collections', names: collections.map((collection) => collection.name) });
}

const variableMapApi: VariableMapApi = {
  getLocalVariableCollectionsAsync: () => figma.variables.getLocalVariableCollectionsAsync(),
  getLocalVariablesAsync: () => figma.variables.getLocalVariablesAsync(),
  setSharedPluginData: (namespace, key, value) => figma.root.setSharedPluginData(namespace, key, value),
};

async function handleSyncTokens(contract: unknown): Promise<void> {
  const validation = validateTokenContract(contract);
  if (!validation.valid) {
    postToUi({ type: 'sync-error', message: validation.errors.join('; ') });
    return;
  }
  try {
    // A variable the file says to bind "as" another becomes a Figma alias of it,
    // so binding either name resolves to one value and they cannot drift. The
    // producer keeps the declared value for its own round trip; this is where
    // the pointer is made real.
    const normalised = normaliseAliases(validation.contract);
    const result = syncTokenContract(normalised.contract, figma.variables);
    normalised.notes.forEach((reason) => {
      result.gaps.push({ variable: reason.split('"')[1] ?? 'contract', reason });
    });
    // Figma's REST API reports a bound field as a variable id, and only an
    // Enterprise plan can resolve ids to names. Writing the map here is what
    // lets the screen read-back report `space-md` instead of an opaque id.
    const map = await writeVariableMap(variableMapApi);
    postToUi({ type: 'sync-result', result, variableMap: map });
  } catch (error) {
    postToUi({ type: 'sync-error', message: (error as Error).message });
  }
}

async function handleBuildComponents(
  specs: { name: string; json: unknown }[],
  collection: string,
): Promise<void> {
  const results: BuildResult[] = [];
  const failures: { name: string; message: string }[] = [];
  const built: SceneNode[] = [];
  const alreadyPresent = existingComponentNames();
  const duplicates: string[] = [];

  // Everything already on the page, so a second batch lands below the first
  // rather than on top of it.
  const existing = figma.currentPage.children.filter(
    (node): node is SceneNode & { width: number; height: number } =>
      'width' in node && 'height' in node,
  );
  const origin = originBelow(existing);

  for (const spec of specs) {
    const validation = validateComponentSpec(spec.json);
    if (!validation.valid) {
      failures.push({ name: spec.name, message: validation.errors.join('; ') });
      continue;
    }
    try {
      // eslint-disable-next-line no-await-in-loop
      const { result, node } = await buildComponent(validation.spec, { collectionName: collection }, buildApi);
      if (alreadyPresent.has(result.component)) {
        duplicates.push(result.component);
      }
      results.push(result);
      built.push(node);
    } catch (error) {
      failures.push({ name: spec.name, message: (error as Error).message });
    }
  }

  if (built.length > 0) {
    layoutInGrid(built, origin);
    figma.currentPage.selection = built;
    figma.viewport.scrollAndZoomIntoView(built);
  }

  postToUi({ type: 'build-result', results, failures, duplicates });
}

async function handleBuildPrompt(): Promise<void> {
  try {
    const duplicate = existingComponentNames().has(PROMPT_COMPONENT_NAME);
    const { result, node } = await buildPromptComponent(buildApi);
    reveal(node);
    postToUi({ type: 'prompt-result', result, duplicate });
  } catch (error) {
    postToUi({ type: 'prompt-error', message: (error as Error).message });
  }
}

/**
 * Builds the Text library component against a collection, so its sizes,
 * weights and line heights bind to Variables where they exist. Same duplicate
 * rule as every other build: a second copy is reported, never deleted.
 */
async function handleBuildText(collection: string): Promise<void> {
  try {
    const duplicate = existingComponentNames().has(TEXT_COMPONENT_NAME);
    const { result, node } = await buildTextComponent({ collectionName: collection }, buildApi);
    reveal(node);
    postToUi({ type: 'text-result', result, duplicate });
  } catch (error) {
    postToUi({ type: 'text-error', message: (error as Error).message });
  }
}

/**
 * Marks the selected frames. Several at once is the common case when a person
 * has just drawn three modals, and a selection holding something unmarkable
 * reports that node rather than refusing the whole batch.
 */
function handleMarkFrame(frameType: string): void {
  const selection = figma.currentPage.selection;
  if (selection.length === 0) {
    postToUi({ type: 'frame-result', marked: [], errors: ['select a frame on the canvas first'] });
    return;
  }

  const marked: { name: string; previousName: string; type: string }[] = [];
  const errors: string[] = [];

  selection.forEach((node) => {
    const outcome = markFrame(node as unknown as MarkableNode, frameType);
    if (outcome.ok) {
      marked.push({
        name: outcome.result.name,
        previousName: outcome.result.previousName,
        type: outcome.result.type,
      });
    } else {
      errors.push(`${node.name}: ${outcome.error}`);
    }
  });

  postToUi({ type: 'frame-result', marked, errors });
}

figma.ui.onmessage = async (message: UiToPluginMessage) => {
  // Every handler runs inside this. Without it an unexpected throw becomes an
  // unhandled rejection: the plugin thread stops, the UI never hears back, and
  // the panel sits on "Building…" forever with nothing to report. A dead panel
  // is the worst possible failure, because it looks like the plugin is broken
  // rather than like something specific went wrong.
  try {
    switch (message.type) {
      case 'list-collections':
        await sendCollections();
        break;
      case 'sync-tokens':
        await handleSyncTokens(message.contract);
        // A sync may have created the collection the component panel wants next.
        await sendCollections();
        break;
      case 'build-components':
        await handleBuildComponents(message.specs, message.collection);
        break;
      case 'build-prompt':
        await handleBuildPrompt();
        break;
      case 'build-text':
        await handleBuildText(message.collection);
        break;
      case 'mark-frame':
        handleMarkFrame(message.frameType);
        break;
    }
  } catch (error) {
    postToUi({
      type: 'plugin-error',
      action: message.type,
      message: (error as Error)?.message ?? String(error),
    });
  }
};
