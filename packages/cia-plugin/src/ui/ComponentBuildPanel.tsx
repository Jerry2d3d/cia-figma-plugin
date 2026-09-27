import React, { useEffect, useState } from 'react';
import { postToPlugin } from '@/shared/messages';
import { BuildResult } from '@/plugin/buildComponent';
import { readJsonFiles } from '@/ui/readJsonFile';

export type ComponentBuildStatus =
  | { kind: 'idle' }
  | { kind: 'building' }
  | {
      kind: 'result';
      results: BuildResult[];
      failures: { name: string; message: string }[];
      duplicates: string[];
    }
  | { kind: 'error'; message: string };

interface Props {
  collections: string[];
  status: ComponentBuildStatus;
  onStatusChange: (status: ComponentBuildStatus) => void;
}

interface LoadedSpec {
  name: string;
  json: unknown;
}

export function ComponentBuildPanel({ collections, status, onStatusChange }: Props) {
  const [collection, setCollection] = useState('');
  const [specs, setSpecs] = useState<LoadedSpec[]>([]);

  // Keep a valid selection as the list arrives or changes (e.g. after a token sync).
  useEffect(() => {
    if (!collections.includes(collection)) {
      setCollection(collections[0] ?? '');
    }
  }, [collections, collection]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const parsed = await readJsonFiles(event);
    if (!parsed) {
      return;
    }
    if (parsed.invalid.length > 0) {
      onStatusChange({
        kind: 'error',
        message: parsed.invalid.map((file) => `${file.fileName}: ${file.error}`).join('; '),
      });
    } else {
      onStatusChange({ kind: 'idle' });
    }
    setSpecs(parsed.valid.map((file) => ({ name: file.fileName, json: file.json })));
  };

  const handleBuild = () => {
    if (specs.length === 0 || !collection) {
      return;
    }
    onStatusChange({ kind: 'building' });
    postToPlugin({ type: 'build-components', specs, collection });
  };

  // The label says what is missing, rather than leaving a greyed button with
  // no reason: an empty collection list disables Build no matter how many
  // specs are chosen, which looks like the plugin is broken.
  const buildLabel = () => {
    if (status.kind === 'building') {
      return specs.length > 1 ? `Building ${specs.length} components…` : 'Building…';
    }
    if (!collection) {
      return 'Sync tokens first';
    }
    if (specs.length === 0) {
      return 'Choose a spec file above';
    }
    return specs.length === 1 ? `Build ${specs[0].name}` : `Build ${specs.length} components`;
  };

  return (
    <section className="panel">
      <h2>Components</h2>
      <p>
        Load one component spec or the whole folder, pick the Variable collection to bind to, then
        build. Everything built in one go is laid out in a grid rather than stacked.
      </p>

      <label className="field">
        Collection
        <select
          value={collection}
          onChange={(event) => setCollection(event.target.value)}
          disabled={collections.length === 0}
        >
          {collections.length === 0 && <option value="">No local collections yet: sync tokens first</option>}
          {collections.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        Spec files
        <input type="file" accept="application/json" multiple onChange={handleFileChange} />
      </label>

      {collections.length === 0 && (
        <p className="warn">
          There are no Variables in this file yet, so there is nothing to bind a component to. Load
          a token file in the Tokens section above first. This is why Build stays greyed out.
        </p>
      )}

      <button
        type="button"
        onClick={handleBuild}
        disabled={specs.length === 0 || !collection || status.kind === 'building'}
      >
        {buildLabel()}
      </button>

      {status.kind === 'result' && (
        <BuildSummary
          results={status.results}
          failures={status.failures}
          duplicates={status.duplicates}
        />
      )}

      {status.kind === 'error' && <p className="error">{status.message}</p>}
    </section>
  );
}

function BuildSummary({
  results,
  failures,
  duplicates,
}: {
  results: BuildResult[];
  failures: { name: string; message: string }[];
  duplicates: string[];
}) {
  const variants = results.reduce((total, result) => total + result.variantNames.length, 0);
  const bindings = results.reduce((total, result) => total + result.bindings, 0);
  const gaps = results.flatMap((result) => result.gaps.map((gap) => ({ ...result, gap })));
  const skipped = results.reduce((total, result) => total + result.skipped.length, 0);
  const single = results.length === 1 ? results[0] : undefined;

  return (
    <div className="result">
      {single ? (
        <p>
          Built <strong>{single.component}</strong> ({single.variantNames.length} variant
          {single.variantNames.length === 1 ? '' : 's'}) with {single.bindings} binding
          {single.bindings === 1 ? '' : 's'} to <strong>{single.collection}</strong>.
        </p>
      ) : (
        <p>
          Built <strong>{results.length} components</strong>: {variants} variants and {bindings}{' '}
          bindings in total.
        </p>
      )}

      {single && single.properties.length > 0 && <p>Properties: {single.properties.join(', ')}.</p>}

      {(() => {
        const empty = results.filter((result) => result.bindings === 0 && result.unbuiltPartCalls > 0);
        if (empty.length === 0) {
          return null;
        }
        return (
          <>
            <p className="warn">
              {empty.length} component{empty.length === 1 ? '' : 's'} arrived as an empty frame. Their
              styling lives in parts, which this version does not build yet, so there was nothing to
              put on the root frame:
            </p>
            <ul>
              {empty
                .slice()
                .sort((a, b) => b.unbuiltPartCalls - a.unbuiltPartCalls)
                .map((result) => (
                  <li key={result.component}>
                    <strong>{result.component}</strong>: {result.unbuiltPartCalls} style call
                    {result.unbuiltPartCalls === 1 ? '' : 's'} in parts
                  </li>
                ))}
            </ul>
          </>
        );
      })()}

      {duplicates.length > 0 && (
        <p className="warn">
          A set named {duplicates.join(', ')} was already on this page, so this build made a second
          copy. Nothing was deleted, because instances may already be placed from the first. Delete
          whichever you do not want.
        </p>
      )}

      {failures.length > 0 && (
        <>
          <p className="error">{failures.length} could not be built:</p>
          <ul>
            {failures.map((failure) => (
              <li key={failure.name}>
                <strong>{failure.name}</strong>: {failure.message}
              </li>
            ))}
          </ul>
        </>
      )}

      {gaps.length > 0 && (
        <>
          <p>{gaps.length} gap(s) to route upstream:</p>
          <ul>
            {gaps.map((entry) => (
              <li key={`${entry.component}:${entry.gap.where}:${entry.gap.reason}`}>
                <strong>
                  {single ? entry.gap.where : `${entry.component} · ${entry.gap.where}`}
                </strong>
                : {entry.gap.reason}
              </li>
            ))}
          </ul>
        </>
      )}

      {skipped > 0 && (
        <details className="skipped">
          <summary>{skipped} thing(s) not built in v1</summary>
          <ul>
            {results.flatMap((result) =>
              result.skipped.map((skip) => (
                <li key={`${result.component}:${skip.where}:${skip.reason}`}>
                  <strong>{single ? skip.where : `${result.component} · ${skip.where}`}</strong>:{' '}
                  {skip.reason}
                </li>
              )),
            )}
          </ul>
        </details>
      )}
    </div>
  );
}
