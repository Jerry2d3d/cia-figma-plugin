import { TokenContract } from '@/shared/tokenContract';

export interface SyncGap {
  variable: string;
  reason: string;
}

export interface SyncResult {
  collection: string;
  variablesCreated: number;
  variablesUpdated: number;
  modesCreated: number;
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
    gaps,
  };
}
