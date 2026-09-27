import React, { useState } from 'react';
import { postToPlugin } from '@/shared/messages';
import { FRAME_TYPES, FRAME_TYPE_COMPONENTS, normalizeFrameType } from '@/plugin/frameType';

export type FrameStatus =
  | { kind: 'idle' }
  | { kind: 'result'; marked: { name: string; previousName: string; type: string }[]; errors: string[] }
  | { kind: 'error'; message: string };

interface Props {
  status: FrameStatus;
  onStatusChange: (status: FrameStatus) => void;
}

const CUSTOM = '__custom__';

export function FramePanel({ status, onStatusChange }: Props) {
  const [choice, setChoice] = useState<string>(FRAME_TYPES[0]);
  const [custom, setCustom] = useState('');

  const chosenType = choice === CUSTOM ? custom : choice;

  const handleMark = () => {
    const normalized = normalizeFrameType(chosenType);
    if (!normalized.ok) {
      onStatusChange({ kind: 'error', message: normalized.error });
      return;
    }
    postToPlugin({ type: 'mark-frame', frameType: normalized.type });
  };

  return (
    <section className="panel">
      <h2>Frames</h2>
      <p>
        Say what a frame is, so a screen read tells a page apart from a modal. The frame is renamed
        with the type in front, and the type is also stored on the frame itself, where renaming it
        later cannot change what it means.
      </p>

      <label className="field">
        Type
        <select value={choice} onChange={(event) => setChoice(event.target.value)}>
          {FRAME_TYPES.map((type) => {
            const components = FRAME_TYPE_COMPONENTS[type];
            return (
              <option key={type} value={type}>
                {type}
                {components.length > 0 ? ` — ${components.join(', ')}` : ''}
              </option>
            );
          })}
          <option value={CUSTOM}>something else…</option>
        </select>
      </label>

      {choice === CUSTOM && (
        <label className="field">
          Your own type
          <input
            type="text"
            value={custom}
            placeholder="side-panel"
            onChange={(event) => setCustom(event.target.value)}
          />
        </label>
      )}

      <button type="button" onClick={handleMark} disabled={chosenType.trim().length === 0}>
        Mark selected {chosenType.trim().length > 0 ? `as ${chosenType.trim().toLowerCase()}` : ''}
      </button>

      {status.kind === 'result' && (
        <div className="result">
          {status.marked.length > 0 && (
            <>
              <p>
                Marked {status.marked.length} frame{status.marked.length === 1 ? '' : 's'}:
              </p>
              <ul>
                {status.marked.map((frame) => (
                  <li key={frame.name}>
                    <strong>{frame.previousName}</strong> is now {frame.name}
                  </li>
                ))}
              </ul>
            </>
          )}
          {status.errors.length > 0 && (
            <>
              <p className="warn">{status.errors.length} could not be marked:</p>
              <ul>
                {status.errors.map((error) => (
                  <li key={error}>{error}</li>
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
