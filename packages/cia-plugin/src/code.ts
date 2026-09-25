import { UiToPluginMessage, postToUi } from '@/shared/messages';
import { validateTokenContract } from '@/shared/tokenContract';
import { validateComponentSpec } from '@/shared/componentSpec';
import { syncTokenContract } from '@/plugin/syncTokens';
import { BuildApi, buildComponent } from '@/plugin/buildComponent';
import { PromptApi, buildPromptComponent } from '@/plugin/buildPrompt';

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

function handleSyncTokens(contract: unknown): void {
  const validation = validateTokenContract(contract);
  if (!validation.valid) {
    postToUi({ type: 'sync-error', message: validation.errors.join('; ') });
    return;
  }
  try {
    const result = syncTokenContract(validation.contract, figma.variables);
    postToUi({ type: 'sync-result', result });
  } catch (error) {
    postToUi({ type: 'sync-error', message: (error as Error).message });
  }
}

async function handleBuildComponent(spec: unknown, collection: string): Promise<void> {
  const validation = validateComponentSpec(spec);
  if (!validation.valid) {
    postToUi({ type: 'build-error', message: validation.errors.join('; ') });
    return;
  }
  try {
    const { result, node } = await buildComponent(validation.spec, { collectionName: collection }, buildApi);
    reveal(node);
    postToUi({ type: 'build-result', result });
  } catch (error) {
    postToUi({ type: 'build-error', message: (error as Error).message });
  }
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
      handleSyncTokens(message.contract);
      // A sync may have created the collection the component panel wants next.
      await sendCollections();
      break;
    case 'build-component':
      await handleBuildComponent(message.spec, message.collection);
      break;
    case 'build-prompt':
      await handleBuildPrompt();
      break;
  }
};
