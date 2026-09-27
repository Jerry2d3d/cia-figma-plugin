import React, { useEffect, useState } from 'react';
import { PluginToUiMessage, postToPlugin } from '@/shared/messages';
import { SyncResult } from '@/plugin/syncTokens';
import { BuildResult } from '@/plugin/buildComponent';
import { PromptBuildResult } from '@/plugin/buildPrompt';
import { TokenSyncPanel, TokenSyncStatus } from '@/ui/TokenSyncPanel';
import { ComponentBuildPanel, ComponentBuildStatus } from '@/ui/ComponentBuildPanel';
import { PromptPanel, PromptStatus } from '@/ui/PromptPanel';
import { FramePanel, FrameStatus } from '@/ui/FramePanel';

export function App() {
  const [collections, setCollections] = useState<string[]>([]);
  const [syncStatus, setSyncStatus] = useState<TokenSyncStatus>({ kind: 'idle' });
  const [buildStatus, setBuildStatus] = useState<ComponentBuildStatus>({ kind: 'idle' });
  const [promptStatus, setPromptStatus] = useState<PromptStatus>({ kind: 'idle' });
  const [frameStatus, setFrameStatus] = useState<FrameStatus>({ kind: 'idle' });

  useEffect(() => {
    const onMessage = (event: MessageEvent<{ pluginMessage?: PluginToUiMessage }>) => {
      const message = event.data.pluginMessage;
      if (!message) {
        return;
      }
      switch (message.type) {
        case 'sync-result':
          setSyncStatus({
            kind: 'result',
            result: message.result as SyncResult,
            variableMap: message.variableMap,
          });
          break;
        case 'sync-error':
          setSyncStatus({ kind: 'error', message: message.message });
          break;
        case 'collections':
          setCollections(message.names);
          break;
        case 'build-result':
          setBuildStatus({
            kind: 'result',
            results: message.results as BuildResult[],
            failures: message.failures,
            duplicates: message.duplicates,
          });
          break;
        case 'build-error':
          setBuildStatus({ kind: 'error', message: message.message });
          break;
        case 'prompt-result':
          setPromptStatus({
            kind: 'result',
            result: message.result as PromptBuildResult,
            duplicate: message.duplicate,
          });
          break;
        case 'prompt-error':
          setPromptStatus({ kind: 'error', message: message.message });
          break;
        case 'frame-result':
          setFrameStatus({ kind: 'result', marked: message.marked, errors: message.errors });
          break;
      }
    };
    window.addEventListener('message', onMessage);
    postToPlugin({ type: 'list-collections' });
    return () => window.removeEventListener('message', onMessage);
  }, []);

  return (
    <div className="app">
      <h1>cia</h1>
      <TokenSyncPanel status={syncStatus} onStatusChange={setSyncStatus} />
      <ComponentBuildPanel collections={collections} status={buildStatus} onStatusChange={setBuildStatus} />
      <PromptPanel status={promptStatus} onStatusChange={setPromptStatus} />
      <FramePanel status={frameStatus} onStatusChange={setFrameStatus} />
    </div>
  );
}
