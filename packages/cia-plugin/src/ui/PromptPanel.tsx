import React from 'react';
import { postToPlugin } from '@/shared/messages';
import { PromptBuildResult } from '@/plugin/buildPrompt';

export type PromptStatus =
  | { kind: 'idle' }
  | { kind: 'building' }
  | { kind: 'result'; result: PromptBuildResult }
  | { kind: 'error'; message: string };

interface Props {
  status: PromptStatus;
  onStatusChange: (status: PromptStatus) => void;
}

export function PromptPanel({ status, onStatusChange }: Props) {
  const handleClick = () => {
    onStatusChange({ kind: 'building' });
    postToPlugin({ type: 'build-prompt' });
  };

  return (
    <section className="panel">
      <h2>Prompt</h2>
      <p>
        Add the Prompt component so rules for the AI can live next to the design they apply to. Place one inside a
        frame to scope it to that frame. Figma comments stay human-only.
      </p>
      <button type="button" onClick={handleClick} disabled={status.kind === 'building'}>
        {status.kind === 'building' ? 'Adding…' : 'Add Prompt component'}
      </button>

      {status.kind === 'result' && (
        <div className="result">
          <p>
            Added <strong>{status.result.component}</strong> with {status.result.variantNames.length} variants and
            properties {status.result.properties.join(', ')}.
          </p>
        </div>
      )}

      {status.kind === 'error' && <p className="error">{status.message}</p>}
    </section>
  );
}
