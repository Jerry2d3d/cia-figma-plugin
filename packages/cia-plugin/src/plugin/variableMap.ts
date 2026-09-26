/**
 * The variable-name map: Figma's REST API reports a bound field as a variable
 * *id*, and the endpoint that resolves ids to names is Enterprise-only. So a
 * 16px gap reads back as an opaque id rather than `space-md`, which is exactly
 * the token name the screen read-back needs to hand an AI.
 *
 * The plugin is the one place that knows both, because it holds the live
 * document. It writes the map as shared plugin data on the document root,
 * which persists in the file and comes back through the REST API on any plan
 * when the request asks for `plugin_data`.
 *
 * Shape and namespace agreed with figma-import-export; its reader refuses a
 * `specVersion` it does not understand rather than guessing.
 */

export const VARIABLE_MAP_NAMESPACE = 'cia';
export const VARIABLE_MAP_KEY = 'variableMap';
export const VARIABLE_MAP_SPEC_VERSION = '1.0.0';

export interface VariableMapCollection {
  collection: string;
  modes: string[];
  /** Full variable id exactly as `boundVariables` reports it, to token name. */
  variables: Record<string, string>;
}

export interface VariableMap {
  specVersion: string;
  writtenAt: string;
  /**
   * Every local variable is listed, not only the ones a sync created, so a
   * variable added by hand in Figma resolves too.
   */
  coverage: 'all-local';
  collections: VariableMapCollection[];
}

export interface VariableMapApi {
  getLocalVariableCollectionsAsync(): Promise<VariableCollection[]>;
  getLocalVariablesAsync(): Promise<Variable[]>;
  setSharedPluginData(namespace: string, key: string, value: string): void;
}

export function buildVariableMap(
  collections: VariableCollection[],
  variables: Variable[],
  now: Date = new Date(),
): VariableMap {
  const byCollectionId = new Map<string, Record<string, string>>();
  collections.forEach((collection) => byCollectionId.set(collection.id, {}));

  variables.forEach((variable) => {
    const entry = byCollectionId.get(variable.variableCollectionId);
    if (entry) {
      entry[variable.id] = variable.name;
    }
  });

  return {
    specVersion: VARIABLE_MAP_SPEC_VERSION,
    writtenAt: now.toISOString(),
    coverage: 'all-local',
    collections: collections.map((collection) => ({
      collection: collection.name,
      modes: collection.modes.map((mode) => mode.name),
      variables: byCollectionId.get(collection.id) ?? {},
    })),
  };
}

/**
 * Rewrites the map wholesale rather than merging, so it can never outlive the
 * variables it describes. Returns how many ids it covers.
 */
export async function writeVariableMap(api: VariableMapApi): Promise<{ collections: number; variables: number }> {
  const collections = await api.getLocalVariableCollectionsAsync();
  const variables = await api.getLocalVariablesAsync();
  const map = buildVariableMap(collections, variables);

  api.setSharedPluginData(VARIABLE_MAP_NAMESPACE, VARIABLE_MAP_KEY, JSON.stringify(map));

  return {
    collections: map.collections.length,
    variables: map.collections.reduce((total, entry) => total + Object.keys(entry.variables).length, 0),
  };
}
