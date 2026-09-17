import React from 'react';

export type ReadJsonResult = { ok: true; fileName: string; json: unknown } | { ok: false; error: string };

/**
 * Reads the file picked in an `<input type="file">` as JSON. Resolves to null
 * when no file was picked. Resets the input so picking the same file again
 * still fires a change event.
 */
export async function readJsonFile(event: React.ChangeEvent<HTMLInputElement>): Promise<ReadJsonResult | null> {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) {
    return null;
  }
  try {
    return { ok: true, fileName: file.name, json: JSON.parse(await file.text()) };
  } catch (error) {
    return { ok: false, error: `invalid JSON in ${file.name}: ${(error as Error).message}` };
  }
}
