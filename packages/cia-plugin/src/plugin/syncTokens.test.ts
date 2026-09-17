import { syncTokenContract, VariablesApi } from '@/plugin/syncTokens';
import { TokenContract } from '@/shared/tokenContract';

class FakeVariable {
  values: Record<string, unknown> = {};

  constructor(
    public id: string,
    public name: string,
    public variableCollectionId: string,
    public resolvedType: VariableResolvedDataType,
  ) {}

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
      const variable = new FakeVariable(
        `v${variableCounter}`,
        name,
        (collection as unknown as FakeVariableCollection).id,
        type,
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
    expect(result).toEqual({
      collection: 'cia',
      variablesCreated: 1,
      variablesUpdated: 0,
      modesCreated: 1,
      gaps: [],
    });
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
