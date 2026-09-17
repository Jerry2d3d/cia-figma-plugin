import React from 'react';
import { postToPlugin } from '@/shared/messages';
import { SyncResult } from '@/plugin/syncTokens';
import { readJsonFile } from '@/ui/readJsonFile';

export type TokenSyncStatus =
  | { kind: 'idle' }
  | { kind: 'syncing' }
  | { kind: 'result'; result: SyncResult }
  | { kind: 'error'; message: string };

interface Props {
  status: TokenSyncStatus;
  onStatusChange: (status: TokenSyncStatus) => void;
}

export function TokenSyncPanel({ status, onStatusChange }: Props) {
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const parsed = await readJsonFile(event);
    if (!parsed) {
      return;
    }
    if (!parsed.ok) {
      onStatusChange({ kind: 'error', message: parsed.error });
      return;
    }
    onStatusChange({ kind: 'syncing' });
    postToPlugin({ type: 'sync-tokens', contract: parsed.json });
  };

  return (
    <section className="panel">
      <h2>Tokens</h2>
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
    </section>
  );
}
