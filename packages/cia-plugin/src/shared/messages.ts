import { SyncResult } from '@/plugin/syncTokens';
import { BuildResult } from '@/plugin/buildComponent';
import { PromptBuildResult } from '@/plugin/buildPrompt';
import { TextBuildResult } from '@/plugin/buildText';

export type UiToPluginMessage =
  | { type: 'sync-tokens'; contract: unknown }
  | { type: 'list-collections' }
  | { type: 'build-components'; specs: { name: string; json: unknown }[]; collection: string }
  | { type: 'build-prompt' }
  | { type: 'build-text'; collection: string }
  | { type: 'mark-frame'; frameType: string };

export interface VariableMapSummary {
  collections: number;
  variables: number;
}

export type PluginToUiMessage =
  | { type: 'sync-result'; result: SyncResult; variableMap?: VariableMapSummary }
  | { type: 'sync-error'; message: string }
  | { type: 'collections'; names: string[] }
  | {
      type: 'build-result';
      results: BuildResult[];
      failures: { name: string; message: string }[];
      /** Names that already existed on the page before this build ran. */
      duplicates: string[];
    }
  | { type: 'build-error'; message: string }
  | { type: 'prompt-result'; result: PromptBuildResult; duplicate: boolean }
  /** Anything that threw where nothing else caught it. Always surfaced. */
  | { type: 'plugin-error'; action: string; message: string }
  | { type: 'frame-result'; marked: { name: string; previousName: string; type: string }[]; errors: string[] }
  | { type: 'prompt-error'; message: string }
  | { type: 'text-result'; result: TextBuildResult; duplicate: boolean }
  | { type: 'text-error'; message: string };

export function postToPlugin(message: UiToPluginMessage): void {
  parent.postMessage({ pluginMessage: message }, '*');
}

export function postToUi(message: PluginToUiMessage): void {
  figma.ui.postMessage(message);
}
