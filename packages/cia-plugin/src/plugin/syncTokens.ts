import { TokenContract } from '@/shared/tokenContract';

export interface SyncGap {
  variable: string;
  reason: string;
}

/**
 * What Figma actually holds for a mode the contract never gave a value for.
 *
 * The contract can omit a theme-mode for a token that theme does not declare,
 * intending it to read as absent. But Figma has no empty state: a variable
 * holds a value for every mode in its collection, so an omitted mode gets
 * whatever Figma defaulted it to when the variable was created. That default
 * is indistinguishable, in the UI and to a reader, from a deliberate value.
 *
 * This is reported rather than worked around, because the honest fix belongs
 * upstream in how the contract expresses "this theme does not have this token".
 */
export interface ModeCoverage {
  variablesWithEveryMode: number;
  variablesMissingSomeMode: number;
  /** A few real examples of what Figma stored where the contract said nothing. */
  samples: { variable: string; mode: string; figmaStored: string }[];
}

export interface SyncResult {
  collection: string;
  variablesCreated: number;
  variablesUpdated: number;
  modesCreated: number;
  coverage: ModeCoverage;
  gaps: SyncGap[];
}

/**
 * The subset of `figma.variables` this module touches, injected rather than
 * read off the global — lets syncTokenContract run against a hand-rolled
 * fake in tests instead of a real Figma sandbox.
 */
export interface VariablesApi {
  getLocalVariableCollections(): VariableCollection[];
  createVariableCollection(name: string): VariableCollection;
  getLocalVariables(): Variable[];
  createVariable(
    name: string,
    collection: VariableCollection,
    resolvedType: VariableResolvedDataType,
  ): Variable;
}

function ensureCollection(
  api: VariablesApi,
  name: string,
): { collection: VariableCollection; created: boolean } {
  const existing = api.getLocalVariableCollections().find((candidate) => candidate.name === name);
  if (existing) {
    return { collection: existing, created: false };
  }
  return { collection: api.createVariableCollection(name), created: true };
}

function ensureModes(
  collection: VariableCollection,
  modes: string[],
  collectionJustCreated: boolean,
): { modeNameToId: Map<string, string>; modesCreated: number } {
  const modeNameToId = new Map<string, string>();
  collection.modes.forEach((mode) => modeNameToId.set(mode.name, mode.modeId));
  let modesCreated = 0;

  modes.forEach((modeName, index) => {
    if (modeNameToId.has(modeName)) {
      return;
    }
    // A brand-new collection already has one default mode ("Mode 1") — rename
    // it into the contract's first mode instead of adding a duplicate.
    if (collectionJustCreated && index === 0) {
      const defaultMode = collection.modes[0];
      collection.renameMode(defaultMode.modeId, modeName);
      modeNameToId.delete(defaultMode.name);
      modeNameToId.set(modeName, defaultMode.modeId);
      return;
    }
    const modeId = collection.addMode(modeName);
    modeNameToId.set(modeName, modeId);
    modesCreated += 1;
  });

  return { modeNameToId, modesCreated };
}

function describeValue(value: unknown): string {
  if (value === undefined) {
    return 'nothing';
  }
  if (value && typeof value === 'object' && 'r' in (value as Record<string, unknown>)) {
    const c = value as { r: number; g: number; b: number; a: number };
    const hex = [c.r, c.g, c.b].map((n) => Math.round(n * 255).toString(16).padStart(2, '0')).join('');
    return `#${hex} at ${Math.round(c.a * 100)}% alpha`;
  }
  return JSON.stringify(value);
}

/**
 * Reads back what Figma stored for every mode the contract did not set, so the
 * difference between "absent" and "defaulted" is visible rather than assumed.
 */
function measureCoverage(
  contract: TokenContract,
  modeNameToId: Map<string, string>,
  written: { name: string; variable: Variable }[],
): ModeCoverage {
  const coverage: ModeCoverage = {
    variablesWithEveryMode: 0,
    variablesMissingSomeMode: 0,
    samples: [],
  };

  written.forEach(({ name, variable }) => {
    const declared = contract.variables.find((candidate) => candidate.name === name);
    const missing = contract.modes.filter((mode) => !declared || !(mode in declared.valuesByMode));

    if (missing.length === 0) {
      coverage.variablesWithEveryMode += 1;
      return;
    }
    coverage.variablesMissingSomeMode += 1;

    if (coverage.samples.length < 5) {
      const mode = missing[0];
      const modeId = modeNameToId.get(mode);
      coverage.samples.push({
        variable: name,
        mode,
        figmaStored: describeValue(modeId ? variable.valuesByMode?.[modeId] : undefined),
      });
    }
  });

  return coverage;
}

export function syncTokenContract(contract: TokenContract, api: VariablesApi): SyncResult {
  const gaps: SyncGap[] = [];
  const { collection, created } = ensureCollection(api, contract.collection);
  const { modeNameToId, modesCreated } = ensureModes(collection, contract.modes, created);

  const existingByName = new Map<string, Variable>();
  api.getLocalVariables().forEach((variable) => {
    if (variable.variableCollectionId === collection.id) {
      existingByName.set(variable.name, variable);
    }
  });

  let variablesCreated = 0;
  let variablesUpdated = 0;
  const written: { name: string; variable: Variable }[] = [];

  contract.variables.forEach((tokenVariable) => {
    const existing = existingByName.get(tokenVariable.name);

    if (existing && existing.resolvedType !== tokenVariable.type) {
      gaps.push({
        variable: tokenVariable.name,
        reason: `existing variable is ${existing.resolvedType}, contract wants ${tokenVariable.type} — skipped`,
      });
      return;
    }

    const target = existing ?? api.createVariable(tokenVariable.name, collection, tokenVariable.type);
    written.push({ name: tokenVariable.name, variable: target });
    if (existing) {
      variablesUpdated += 1;
    } else {
      variablesCreated += 1;
    }

    Object.entries(tokenVariable.valuesByMode).forEach(([modeName, value]) => {
      const modeId = modeNameToId.get(modeName);
      if (!modeId) {
        gaps.push({
          variable: tokenVariable.name,
          reason: `mode "${modeName}" is not declared in contract.modes — value skipped`,
        });
        return;
      }
      try {
        target.setValueForMode(modeId, value as VariableValue);
      } catch (error) {
        gaps.push({
          variable: tokenVariable.name,
          reason: `failed to set value for mode "${modeName}": ${(error as Error).message}`,
        });
      }
    });
  });

  return {
    collection: collection.name,
    variablesCreated,
    variablesUpdated,
    modesCreated,
    coverage: measureCoverage(contract, modeNameToId, written),
    gaps,
  };
}
