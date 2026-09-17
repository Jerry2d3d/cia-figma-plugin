import { SyncResult } from '@/plugin/syncTokens';

export type UiToPluginMessage = { type: 'sync-tokens'; contract: unknown };

export type PluginToUiMessage =
  | { type: 'sync-result'; result: SyncResult }
  | { type: 'sync-error'; message: string };

export function postToPlugin(message: UiToPluginMessage): void {
  parent.postMessage({ pluginMessage: message }, '*');
}

export function postToUi(message: PluginToUiMessage): void {
  figma.ui.postMessage(message);
}
