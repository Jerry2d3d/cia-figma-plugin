import React from 'react';

export type ReadJsonResult = { ok: true; fileName: string; json: unknown } | { ok: false; error: string };

export interface ReadJsonFilesResult {
  valid: { fileName: string; json: unknown }[];
  invalid: { fileName: string; error: string }[];
}

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

/**
 * The same, for a multiple-file input. One unreadable file is reported rather
 * than failing the whole selection, so picking a folder with a stray file in it
 * still builds everything else.
 */
export async function readJsonFiles(
  event: React.ChangeEvent<HTMLInputElement>,
): Promise<ReadJsonFilesResult | null> {
  const files = Array.from(event.target.files ?? []);
  event.target.value = '';
  if (files.length === 0) {
    return null;
  }

  const result: ReadJsonFilesResult = { valid: [], invalid: [] };
  // Sorted so the canvas layout order matches the file list, not the order the
  // browser happens to hand them over in.
  const sorted = files.sort((a, b) => a.name.localeCompare(b.name));

  for (const file of sorted) {
    try {
      // eslint-disable-next-line no-await-in-loop
      result.valid.push({ fileName: file.name, json: JSON.parse(await file.text()) });
    } catch (error) {
      result.invalid.push({ fileName: file.name, error: `invalid JSON: ${(error as Error).message}` });
    }
  }

  return result;
}
