import React, { useEffect, useState } from 'react';
import { PluginToUiMessage, postToPlugin } from '@/shared/messages';
import { SyncResult } from '@/plugin/syncTokens';

type Status =
  | { kind: 'idle' }
  | { kind: 'syncing' }
  | { kind: 'result'; result: SyncResult }
  | { kind: 'error'; message: string };

export function App() {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  useEffect(() => {
    const onMessage = (event: MessageEvent<{ pluginMessage: PluginToUiMessage }>) => {
      const message = event.data.pluginMessage;
      if (!message) {
        return;
      }
      if (message.type === 'sync-result') {
        setStatus({ kind: 'result', result: message.result });
      } else if (message.type === 'sync-error') {
        setStatus({ kind: 'error', message: message.message });
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    let contract: unknown;
    try {
      contract = JSON.parse(await file.text());
    } catch (error) {
      setStatus({ kind: 'error', message: `invalid JSON: ${(error as Error).message}` });
      return;
    }

    setStatus({ kind: 'syncing' });
    postToPlugin({ type: 'sync-tokens', contract });
  };

  return (
    <div className="app">
      <h1>cia</h1>
      <p>Load a token export produced by figma-import-export, then sync it into Figma Variables.</p>
      <input type="file" accept="application/json" onChange={handleFileChange} />

      {status.kind === 'syncing' && <p>Syncing…</p>}

      {status.kind === 'result' && (
        <div className="result">
          <p>
            Collection <strong>{status.result.collection}</strong>: {status.result.variablesCreated} created,{' '}
            {status.result.variablesUpdated} updated, {status.result.modesCreated} mode(s) added.
          </p>
          {status.result.gaps.length > 0 && (
            <>
              <p>{status.result.gaps.length} gap(s):</p>
              <ul>
                {status.result.gaps.map((gap) => (
                  <li key={`${gap.variable}:${gap.reason}`}>
                    <strong>{gap.variable}</strong>: {gap.reason}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {status.kind === 'error' && <p className="error">{status.message}</p>}
    </div>
  );
}
