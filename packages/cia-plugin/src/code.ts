import { UiToPluginMessage, postToUi } from '@/shared/messages';
import { validateTokenContract } from '@/shared/tokenContract';
import { validateComponentSpec } from '@/shared/componentSpec';
import { syncTokenContract } from '@/plugin/syncTokens';
import { BuildApi, BuildResult, buildComponent } from '@/plugin/buildComponent';
import { layoutInGrid, originBelow } from '@/plugin/layoutNodes';
import { PromptApi, buildPromptComponent } from '@/plugin/buildPrompt';
import { VariableMapApi, writeVariableMap } from '@/plugin/variableMap';

figma.showUI(__html__, { width: 380, height: 600 });

const buildApi: BuildApi & PromptApi = {
  getLocalVariableCollectionsAsync: () => figma.variables.getLocalVariableCollectionsAsync(),
  getLocalVariablesAsync: () => figma.variables.getLocalVariablesAsync(),
  createComponent: () => figma.createComponent(),
  createText: () => figma.createText(),
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
    const result = syncTokenContract(validation.contract, figma.variables);
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

  postToUi({ type: 'build-result', results, failures });
}

async function handleBuildPrompt(): Promise<void> {
  try {
    const { result, node } = await buildPromptComponent(buildApi);
    reveal(node);
    postToUi({ type: 'prompt-result', result });
  } catch (error) {
    postToUi({ type: 'prompt-error', message: (error as Error).message });
  }
}

figma.ui.onmessage = async (message: UiToPluginMessage) => {
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
  }
};
