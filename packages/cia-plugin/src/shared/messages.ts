import { SyncResult } from '@/plugin/syncTokens';
import { BuildResult } from '@/plugin/buildComponent';
import { PromptBuildResult } from '@/plugin/buildPrompt';

export type UiToPluginMessage =
  | { type: 'sync-tokens'; contract: unknown }
  | { type: 'list-collections' }
  | { type: 'build-component'; spec: unknown; collection: string }
  | { type: 'build-prompt' };

export interface VariableMapSummary {
  collections: number;
  variables: number;
}

export type PluginToUiMessage =
  | { type: 'sync-result'; result: SyncResult; variableMap?: VariableMapSummary }
  | { type: 'sync-error'; message: string }
  | { type: 'collections'; names: string[] }
  | { type: 'build-result'; result: BuildResult }
  | { type: 'build-error'; message: string }
  | { type: 'prompt-result'; result: PromptBuildResult }
  | { type: 'prompt-error'; message: string };

export function postToPlugin(message: UiToPluginMessage): void {
  parent.postMessage({ pluginMessage: message }, '*');
}

export function postToUi(message: PluginToUiMessage): void {
  figma.ui.postMessage(message);
}
