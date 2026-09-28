import React, { useEffect, useState } from 'react';
import { postToPlugin } from '@/shared/messages';
import { TextBuildResult } from '@/plugin/buildText';

export type TextStatus =
  | { kind: 'idle' }
  | { kind: 'building' }
  | { kind: 'result'; result: TextBuildResult; duplicate: boolean }
  | { kind: 'error'; message: string };

interface Props {
  collections: string[];
  status: TextStatus;
  onStatusChange: (status: TextStatus) => void;
}

/**
 * The Text library component: one variant per cia type preset, with and
 * without wrapping, and the text as a property. Every other component will
 * place an instance of this rather than carry its own raw text, so it comes
 * before them in the build order.
 */
export function TextPanel({ collections, status, onStatusChange }: Props) {
  const [collection, setCollection] = useState('');

  useEffect(() => {
    if (!collections.includes(collection)) {
      setCollection(collections[0] ?? '');
    }
  }, [collections, collection]);

  const handleClick = () => {
    if (!collection) {
      return;
    }
    onStatusChange({ kind: 'building' });
    postToPlugin({ type: 'build-text', collection });
  };

  const label = () => {
    if (status.kind === 'building') {
      return 'Adding…';
    }
    if (!collection) {
      return 'Sync tokens first';
    }
    return 'Add Text component';
  };

  return (
    <section className="panel">
      <h2>Text</h2>
      <p>
        One component, a variant per cia type preset from display down to overline, each with and
        without wrapping. Place it anywhere text goes, pick the preset, and the size, weight, line
        height and spacing come with it. The text itself is a property on the instance.
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

      <button type="button" onClick={handleClick} disabled={!collection || status.kind === 'building'}>
        {label()}
      </button>

      {status.kind === 'result' && (
        <div className="result">
          <p>
            Added <strong>{status.result.component}</strong> with {status.result.variantNames.length} variants,{' '}
            {status.result.bindings} bindings to <strong>{status.result.collection}</strong>, and property{' '}
            {status.result.properties.join(', ')}.
          </p>
          {status.result.unthemeable.length > 0 && (
            <>
              <p className="warn">
                {status.result.unthemeable.length} value(s) are set as plain numbers because the collection
                has no variable for them. They are correct and will not change when you switch theme.
                They bind the day the theme file carries these tokens:
              </p>
              <ul>
                {status.result.unthemeable.map((entry) => (
                  <li key={entry}>{entry}</li>
                ))}
              </ul>
            </>
          )}
          {status.result.gaps.map((gap) => (
            <p key={gap} className="warn">
              {gap}
            </p>
          ))}
          {status.duplicate && (
            <p className="warn">
              A Text set was already on this page, so this is a second copy. Nothing was deleted,
              because instances may already be placed from the first. Delete whichever you do not
              want.
            </p>
          )}
        </div>
      )}

      {status.kind === 'error' && <p className="error">{status.message}</p>}
    </section>
  );
}
