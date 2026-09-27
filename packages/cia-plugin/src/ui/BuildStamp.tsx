import React from 'react';

declare const __BUILD_STAMP__: string;

/**
 * Which build Figma is actually running. Figma caches a development plugin's
 * UI, so re-running it does not reliably pick up new code, and the only way to
 * tell used to be spotting whether a feature was present. Now it is readable.
 */
export function BuildStamp() {
  return <p className="stamp">build {__BUILD_STAMP__}</p>;
}
