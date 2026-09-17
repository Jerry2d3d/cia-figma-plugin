import { UiToPluginMessage, postToUi } from '@/shared/messages';
import { validateTokenContract } from '@/shared/tokenContract';
import { syncTokenContract } from '@/plugin/syncTokens';

figma.showUI(__html__, { width: 360, height: 420 });

figma.ui.onmessage = (message: UiToPluginMessage) => {
  if (message.type !== 'sync-tokens') {
    return;
  }

  const validation = validateTokenContract(message.contract);
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
};
