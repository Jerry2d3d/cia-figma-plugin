import React, { useEffect, useState } from 'react';
import { postToPlugin } from '@/shared/messages';
import { BuildResult } from '@/plugin/buildComponent';
import { readJsonFile } from '@/ui/readJsonFile';

export type ComponentBuildStatus =
  | { kind: 'idle' }
  | { kind: 'building' }
  | { kind: 'result'; result: BuildResult }
  | { kind: 'error'; message: string };

interface Props {
  collections: string[];
  status: ComponentBuildStatus;
  onStatusChange: (status: ComponentBuildStatus) => void;
}

export function ComponentBuildPanel({ collections, status, onStatusChange }: Props) {
  const [collection, setCollection] = useState('');
  const [spec, setSpec] = useState<{ name: string; json: unknown } | null>(null);

  // Keep a valid selection as the list arrives or changes (e.g. after a token sync).
  useEffect(() => {
    if (!collections.includes(collection)) {
      setCollection(collections[0] ?? '');
    }
  }, [collections, collection]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const parsed = await readJsonFile(event);
    if (!parsed) {
      return;
    }
    if (!parsed.ok) {
      setSpec(null);
      onStatusChange({ kind: 'error', message: parsed.error });
      return;
    }
    setSpec({ name: parsed.fileName, json: parsed.json });
    onStatusChange({ kind: 'idle' });
  };

  const handleBuild = () => {
    if (!spec || !collection) {
      return;
    }
    onStatusChange({ kind: 'building' });
    postToPlugin({ type: 'build-component', spec: spec.json, collection });
  };

  return (
    <section className="panel">
      <h2>Components</h2>
      <p>Load a component spec produced by figma-import-export, pick the Variable collection to bind to, then build.</p>

      <label className="field">
        Collection
        <select value={collection} onChange={(event) => setCollection(event.target.value)} disabled={collections.length === 0}>
          {collections.length === 0 && <option value="">No local collections yet: sync tokens first</option>}
          {collections.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        Spec
        <input type="file" accept="application/json" onChange={handleFileChange} />
      </label>

      <button type="button" onClick={handleBuild} disabled={!spec || !collection || status.kind === 'building'}>
        {status.kind === 'building' ? 'Building…' : `Build${spec ? ` ${spec.name}` : ''}`}
      </button>

      {status.kind === 'result' && (
        <div className="result">
          <p>
            Built <strong>{status.result.component}</strong> ({status.result.variantNames.length} variant
            {status.result.variantNames.length === 1 ? '' : 's'}) with {status.result.bindings} binding
            {status.result.bindings === 1 ? '' : 's'} to <strong>{status.result.collection}</strong>.
          </p>
          {status.result.properties.length > 0 && <p>Properties: {status.result.properties.join(', ')}.</p>}
          {status.result.gaps.length > 0 && (
            <>
              <p>{status.result.gaps.length} gap(s) to route upstream:</p>
              <ul>
                {status.result.gaps.map((gap) => (
                  <li key={`${gap.where}:${gap.reason}`}>
                    <strong>{gap.where}</strong>: {gap.reason}
                  </li>
                ))}
              </ul>
            </>
          )}
          {status.result.skipped.length > 0 && (
            <details className="skipped">
              <summary>{status.result.skipped.length} thing(s) not built in v1</summary>
              <ul>
                {status.result.skipped.map((skip) => (
                  <li key={`${skip.where}:${skip.reason}`}>
                    <strong>{skip.where}</strong>: {skip.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {status.kind === 'error' && <p className="error">{status.message}</p>}
    </section>
  );
}
