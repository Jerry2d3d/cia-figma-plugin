import React, { useEffect, useState } from 'react';
import { PluginToUiMessage, postToPlugin } from '@/shared/messages';
import { SyncResult } from '@/plugin/syncTokens';
import { BuildResult } from '@/plugin/buildComponent';
import { TokenSyncPanel, TokenSyncStatus } from '@/ui/TokenSyncPanel';
import { ComponentBuildPanel, ComponentBuildStatus } from '@/ui/ComponentBuildPanel';

export function App() {
  const [collections, setCollections] = useState<string[]>([]);
  const [syncStatus, setSyncStatus] = useState<TokenSyncStatus>({ kind: 'idle' });
  const [buildStatus, setBuildStatus] = useState<ComponentBuildStatus>({ kind: 'idle' });

  useEffect(() => {
    const onMessage = (event: MessageEvent<{ pluginMessage?: PluginToUiMessage }>) => {
      const message = event.data.pluginMessage;
      if (!message) {
        return;
      }
      switch (message.type) {
        case 'sync-result':
          setSyncStatus({ kind: 'result', result: message.result as SyncResult });
          break;
        case 'sync-error':
          setSyncStatus({ kind: 'error', message: message.message });
          break;
        case 'collections':
          setCollections(message.names);
          break;
        case 'build-result':
          setBuildStatus({ kind: 'result', result: message.result as BuildResult });
          break;
        case 'build-error':
          setBuildStatus({ kind: 'error', message: message.message });
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
    </div>
  );
}
