import { syncTokenContract, VariablesApi } from '@/plugin/syncTokens';
import { TokenContract } from '@/shared/tokenContract';

const FIGMA_DEFAULTS: Record<string, unknown> = {
  COLOR: { r: 0, g: 0, b: 0, a: 1 },
  FLOAT: 0,
  STRING: '',
  BOOLEAN: false,
};

class FakeVariable {
  values: Record<string, unknown> = {};

  /**
   * Figma has no empty state for a variable value: one exists for every mode in
   * the collection from the moment the variable is created. The fake seeds them
   * the same way, so a mode the contract never sets shows Figma's default here
   * too rather than being conveniently absent.
   */
  constructor(
    public id: string,
    public name: string,
    public variableCollectionId: string,
    public resolvedType: VariableResolvedDataType,
    modeIds: string[] = [],
  ) {
    modeIds.forEach((modeId) => {
      this.values[modeId] = FIGMA_DEFAULTS[resolvedType];
    });
  }

  get valuesByMode() {
    return this.values;
  }

  setValueForMode(modeId: string, value: unknown) {
    this.values[modeId] = value;
  }
}

class FakeVariableCollection {
  modes: { modeId: string; name: string }[];

  private modeCounter = 1;

  constructor(
    public id: string,
    public name: string,
  ) {
    this.modes = [{ modeId: `${id}:mode1`, name: 'Mode 1' }];
  }

  addMode(name: string): string {
    this.modeCounter += 1;
    const modeId = `${this.id}:mode${this.modeCounter}`;
    this.modes.push({ modeId, name });
    return modeId;
  }

  renameMode(modeId: string, newName: string): void {
    const mode = this.modes.find((candidate) => candidate.modeId === modeId);
    if (mode) {
      mode.name = newName;
    }
  }
}

function createFakeApi() {
  const collections: FakeVariableCollection[] = [];
  const variables: FakeVariable[] = [];
  let collectionCounter = 0;
  let variableCounter = 0;

  const api: VariablesApi = {
    getLocalVariableCollections: () => collections as unknown as VariableCollection[],
    createVariableCollection: (name) => {
      collectionCounter += 1;
      const collection = new FakeVariableCollection(`c${collectionCounter}`, name);
      collections.push(collection);
      return collection as unknown as VariableCollection;
    },
    getLocalVariables: () => variables as unknown as Variable[],
    createVariable: (name, collection, type) => {
      variableCounter += 1;
      const target = collection as unknown as FakeVariableCollection;
      const variable = new FakeVariable(
        `v${variableCounter}`,
        name,
        target.id,
        type,
        target.modes.map((mode) => mode.modeId),
      );
      variables.push(variable);
      return variable as unknown as Variable;
    },
  };

  return { api, collections, variables };
}

const baseContract: TokenContract = {
  specVersion: '1.0.0',
  collection: 'cia',
  modes: ['Light', 'Dark'],
  variables: [
    {
      name: 'color/bg/primary',
      type: 'COLOR',
      valuesByMode: {
        Light: { r: 1, g: 1, b: 1, a: 1 },
        Dark: { r: 0, g: 0, b: 0, a: 1 },
      },
    },
  ],
};

describe('syncTokenContract', () => {
  it('creates a new collection, renames its default mode, and creates variables', () => {
    const { api, collections, variables } = createFakeApi();

    const result = syncTokenContract(baseContract, api);

    expect(collections).toHaveLength(1);
    expect(collections[0].modes.map((mode) => mode.name)).toEqual(['Light', 'Dark']);
    expect(variables).toHaveLength(1);
    expect(result).toMatchObject({
      collection: 'cia',
      variablesCreated: 1,
      variablesUpdated: 0,
      modesCreated: 1,
      gaps: [],
    });
    expect(result.coverage.variablesWithEveryMode).toBe(1);
    expect(result.coverage.variablesMissingSomeMode).toBe(0);
  });

  it('reuses an existing collection and updates an existing variable of the same type', () => {
    const { api } = createFakeApi();
    syncTokenContract(baseContract, api);

    const result = syncTokenContract(baseContract, api);

    expect(result.variablesCreated).toBe(0);
    expect(result.variablesUpdated).toBe(1);
    expect(result.modesCreated).toBe(0);
    expect(result.gaps).toEqual([]);
  });

  it('reports a gap instead of overwriting a variable whose type changed', () => {
    const { api, variables } = createFakeApi();
    syncTokenContract(baseContract, api);
    variables[0].resolvedType = 'STRING';

    const result = syncTokenContract(baseContract, api);

    expect(result.gaps).toEqual([
      {
        variable: 'color/bg/primary',
        reason: 'existing variable is STRING, contract wants COLOR — skipped',
      },
    ]);
  });

  it('reports a gap for a value whose mode is not declared in contract.modes', () => {
    const { api } = createFakeApi();
    const contract: TokenContract = {
      ...baseContract,
      variables: [
        {
          name: 'color/bg/primary',
          type: 'COLOR',
          valuesByMode: {
            Light: { r: 1, g: 1, b: 1, a: 1 },
            Contrast: { r: 0.5, g: 0.5, b: 0.5, a: 1 },
          },
        },
      ],
    };

    const result = syncTokenContract(contract, api);

    expect(result.gaps).toEqual([
      {
        variable: 'color/bg/primary',
        reason: 'mode "Contrast" is not declared in contract.modes — value skipped',
      },
    ]);
  });
});

describe('multi-theme collection', () => {
  // The agreed shape: one collection named `cia`, ten modes carrying five
  // themes with light and dark each, so a component binds once and a frame
  // picks its theme by mode. Components must never bind to a collection named
  // after a theme, or changing theme would mean rebinding every one of them.
  const THEMES = ['sketchbook', 'boilerplate', 'terminal', 'glass', 'press'];
  const MODES = THEMES.flatMap((theme) => [`${theme} Light`, `${theme} Dark`]);

  function multiThemeContract(): TokenContract {
    return {
      specVersion: '1.0.0',
      collection: 'cia',
      modes: MODES,
      variables: [
        {
          name: 'paper',
          type: 'COLOR',
          valuesByMode: Object.fromEntries(
            MODES.map((mode, index) => [
              mode,
              { r: index / 10, g: index / 10, b: index / 10, a: 1 },
            ]),
          ),
        },
        {
          name: 'space-md',
          type: 'FLOAT',
          valuesByMode: Object.fromEntries(MODES.map((mode) => [mode, 16])),
        },
      ],
    };
  }

  it('creates all ten modes, renaming the default rather than leaving Mode 1 behind', () => {
    const { api, collections } = createFakeApi();

    const result = syncTokenContract(multiThemeContract(), api);

    expect(collections).toHaveLength(1);
    expect(collections[0].name).toBe('cia');
    expect(collections[0].modes.map((mode) => mode.name)).toEqual(MODES);
    expect(collections[0].modes).toHaveLength(10);
    // One is the renamed default, so only nine are added.
    expect(result.modesCreated).toBe(9);
    expect(result.gaps).toEqual([]);
  });

  it('gives every variable a value in all ten modes', () => {
    const { api, variables } = createFakeApi();

    syncTokenContract(multiThemeContract(), api);

    variables.forEach((variable) => {
      expect(Object.keys(variable.values)).toHaveLength(10);
    });
  });

  it('is idempotent, so re-syncing swaps values without adding modes', () => {
    const { api, collections } = createFakeApi();
    syncTokenContract(multiThemeContract(), api);

    const result = syncTokenContract(multiThemeContract(), api);

    expect(collections[0].modes).toHaveLength(10);
    expect(result.modesCreated).toBe(0);
    expect(result.variablesCreated).toBe(0);
    expect(result.variablesUpdated).toBe(2);
  });

  it('reports a theme missing a token as a gap rather than leaving that mode unset', () => {
    const { api } = createFakeApi();
    const contract = multiThemeContract();
    // press has no value for this one, which is the real-world case: a base
    // theme that never declared a token its siblings have.
    contract.variables.push({
      name: 'page-band-bg',
      type: 'COLOR',
      valuesByMode: { 'press Nonexistent': { r: 1, g: 1, b: 1, a: 1 } },
    });

    const result = syncTokenContract(contract, api);

    expect(result.gaps).toEqual([
      {
        variable: 'page-band-bg',
        reason: 'mode "press Nonexistent" is not declared in contract.modes — value skipped',
      },
    ]);
  });
});

describe('modes the contract does not set', () => {
  it('reports what Figma stored, because a variable is never truly unset', () => {
    const { api } = createFakeApi();
    const contract: TokenContract = {
      specVersion: '1.0.0',
      collection: 'cia',
      modes: ['boilerplate Light', 'press Light'],
      variables: [
        {
          name: 'page-band-bg',
          type: 'COLOR',
          // press does not declare this token, so the contract omits that mode
          // entirely, meaning it to read as absent.
          valuesByMode: { 'boilerplate Light': { r: 1, g: 1, b: 1, a: 1 } },
        },
      ],
    };

    const result = syncTokenContract(contract, api);

    expect(result.gaps).toEqual([]);
    expect(result.coverage.variablesMissingSomeMode).toBe(1);
    // The finding that matters: Figma holds a value there regardless, and it
    // looks like any other colour to a designer reading the panel.
    expect(result.coverage.samples).toEqual([
      { variable: 'page-band-bg', mode: 'press Light', figmaStored: '#000000 at 100% alpha' },
    ]);
  });

  it('counts a fully covered variable as covered', () => {
    const { api } = createFakeApi();

    const result = syncTokenContract(baseContract, api);

    expect(result.coverage).toEqual({
      variablesWithEveryMode: 1,
      variablesMissingSomeMode: 0,
      samples: [],
    });
  });
});

describe('alias values', () => {
  function aliasContract(overrides: Partial<TokenContract> = {}): TokenContract {
    return {
      specVersion: '1.1.0',
      collection: 'cia',
      modes: ['boilerplate Light', 'terminal Light'],
      variables: [
        {
          name: 'btn-radius',
          type: 'FLOAT',
          // terminal overrides with square corners; boilerplate follows the
          // library default, which is radius-md rather than a copied number.
          valuesByMode: { 'terminal Light': 0, 'boilerplate Light': { aliasOf: 'radius-md' } },
        },
        {
          name: 'radius-md',
          type: 'FLOAT',
          valuesByMode: { 'boilerplate Light': 6, 'terminal Light': 0 },
        },
      ],
      ...overrides,
    };
  }

  it('writes a real Figma alias, resolving a target declared later in the contract', () => {
    const { api, variables } = createFakeApi();

    const result = syncTokenContract(aliasContract(), api);

    const btn = variables.find((v) => v.name === 'btn-radius');
    const radiusMd = variables.find((v) => v.name === 'radius-md');
    expect(btn?.values[Object.keys(btn.values)[0]]).toBeDefined();
    const aliasValue = Object.values(btn!.values).find(
      (v) => typeof v === 'object' && v !== null && 'type' in (v as object),
    );
    expect(aliasValue).toEqual({ type: 'VARIABLE_ALIAS', id: radiusMd!.id });
    expect(result.gaps).toEqual([]);
  });

  it('keeps a literal override alongside an alias in another mode', () => {
    const { api, variables } = createFakeApi();

    syncTokenContract(aliasContract(), api);

    const btn = variables.find((v) => v.name === 'btn-radius');
    expect(Object.values(btn!.values)).toContain(0);
  });

  it('reports a missing alias target rather than inventing a literal', () => {
    const { api } = createFakeApi();
    const contract = aliasContract();
    contract.variables[0].valuesByMode['boilerplate Light'] = { aliasOf: 'radius-nope' };

    const result = syncTokenContract(contract, api);

    expect(result.gaps).toEqual([
      {
        variable: 'btn-radius',
        reason: 'alias target "radius-nope" is not in this collection (mode "boilerplate Light") — value skipped',
      },
    ]);
  });

  it('refuses an alias whose target is a different type', () => {
    const { api } = createFakeApi();
    const contract = aliasContract();
    contract.variables.push({
      name: 'paper',
      type: 'COLOR',
      valuesByMode: { 'boilerplate Light': { r: 1, g: 1, b: 1, a: 1 } },
    });
    contract.variables[0].valuesByMode['boilerplate Light'] = { aliasOf: 'paper' };

    const result = syncTokenContract(contract, api);

    expect(result.gaps[0].reason).toBe(
      'alias target "paper" is COLOR, "btn-radius" is FLOAT — value skipped',
    );
  });

  it('refuses a loop rather than choosing which link to break', () => {
    const { api } = createFakeApi();
    const contract = aliasContract();
    contract.variables[0].valuesByMode['boilerplate Light'] = { aliasOf: 'radius-md' };
    contract.variables[1].valuesByMode['boilerplate Light'] = { aliasOf: 'btn-radius' };

    const result = syncTokenContract(contract, api);

    expect(result.gaps.map((gap) => gap.reason)).toEqual([
      'alias to "radius-md" in mode "boilerplate Light" forms a loop — value skipped',
      'alias to "btn-radius" in mode "boilerplate Light" forms a loop — value skipped',
    ]);
  });
});
