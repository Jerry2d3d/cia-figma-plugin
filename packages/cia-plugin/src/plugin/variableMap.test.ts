import {
  buildVariableMap,
  VARIABLE_MAP_KEY,
  VARIABLE_MAP_NAMESPACE,
  VARIABLE_MAP_SPEC_VERSION,
  VariableMapApi,
  writeVariableMap,
} from '@/plugin/variableMap';

function collection(id: string, name: string, modes: string[]) {
  return {
    id,
    name,
    modes: modes.map((modeName, index) => ({ modeId: `${id}:${index}`, name: modeName })),
  } as unknown as VariableCollection;
}

function variable(id: string, name: string, collectionId: string) {
  return { id, name, variableCollectionId: collectionId } as unknown as Variable;
}

describe('buildVariableMap', () => {
  const collections = [
    collection('c1', 'boilerplate', ['Light', 'Dark']),
    collection('c2', 'sketchbook', ['Light']),
  ];
  const variables = [
    variable('VariableID:12:34', 'space-md', 'c1'),
    variable('VariableID:12:35', 'paper', 'c1'),
    variable('VariableID:99:1', 'ink', 'c2'),
    // A variable in no known collection must not land anywhere.
    variable('VariableID:77:7', 'orphan', 'gone'),
  ];

  it('keys full variable ids to token names, per collection', () => {
    const map = buildVariableMap(collections, variables, new Date('2026-09-26T12:00:00Z'));

    expect(map).toEqual({
      specVersion: VARIABLE_MAP_SPEC_VERSION,
      writtenAt: '2026-09-26T12:00:00.000Z',
      coverage: 'all-local',
      collections: [
        {
          collection: 'boilerplate',
          modes: ['Light', 'Dark'],
          variables: { 'VariableID:12:34': 'space-md', 'VariableID:12:35': 'paper' },
        },
        {
          collection: 'sketchbook',
          modes: ['Light'],
          variables: { 'VariableID:99:1': 'ink' },
        },
      ],
    });
  });

  it('keeps ids verbatim, so a reader needs no string surgery', () => {
    const map = buildVariableMap(collections, variables);

    expect(Object.keys(map.collections[0].variables)).toEqual(['VariableID:12:34', 'VariableID:12:35']);
  });

  it('lists a collection with no variables rather than omitting it', () => {
    const map = buildVariableMap([collection('c3', 'empty', ['Light'])], []);

    expect(map.collections).toEqual([{ collection: 'empty', modes: ['Light'], variables: {} }]);
  });
});

describe('writeVariableMap', () => {
  function createFakeApi() {
    const written: { namespace: string; key: string; value: string }[] = [];
    const api: VariableMapApi = {
      getLocalVariableCollectionsAsync: async () => [collection('c1', 'boilerplate', ['Light', 'Dark'])],
      getLocalVariablesAsync: async () => [
        variable('VariableID:1:1', 'space-md', 'c1'),
        variable('VariableID:1:2', 'paper', 'c1'),
      ],
      setSharedPluginData: (namespace, key, value) => written.push({ namespace, key, value }),
    };
    return { api, written };
  }

  it('writes one JSON payload under the agreed namespace and key', async () => {
    const { api, written } = createFakeApi();

    const result = await writeVariableMap(api);

    expect(written).toHaveLength(1);
    expect(written[0].namespace).toBe(VARIABLE_MAP_NAMESPACE);
    expect(written[0].key).toBe(VARIABLE_MAP_KEY);
    expect(result).toEqual({ collections: 1, variables: 2 });

    const parsed = JSON.parse(written[0].value);
    expect(parsed.specVersion).toBe(VARIABLE_MAP_SPEC_VERSION);
    expect(parsed.collections[0].variables['VariableID:1:1']).toBe('space-md');
    expect(typeof parsed.writtenAt).toBe('string');
  });

  it('rewrites wholesale, so the map never outlives the variables it describes', async () => {
    const { api, written } = createFakeApi();

    await writeVariableMap(api);
    await writeVariableMap(api);

    // Same key both times: the second write replaces rather than appends.
    expect(written.map((entry) => entry.key)).toEqual([VARIABLE_MAP_KEY, VARIABLE_MAP_KEY]);
  });
});
