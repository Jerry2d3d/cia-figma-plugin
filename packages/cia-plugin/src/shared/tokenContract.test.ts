import {
  TOKEN_CONTRACT_ALIAS_VERSION,
  TOKEN_CONTRACT_SPEC_VERSION,
  TokenContract,
  normaliseAliases,
  validateTokenContract,
} from '@/shared/tokenContract';

const validPayload = {
  specVersion: TOKEN_CONTRACT_SPEC_VERSION,
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

describe('validateTokenContract', () => {
  it('accepts a well-formed contract', () => {
    expect(validateTokenContract(validPayload).valid).toBe(true);
  });

  it('rejects a mismatched specVersion', () => {
    const result = validateTokenContract({ ...validPayload, specVersion: '0.9.0' });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0]).toMatch(/specVersion/);
    }
  });

  it('rejects a variable with an unsupported type', () => {
    const result = validateTokenContract({
      ...validPayload,
      variables: [{ name: 'x', type: 'WEIRD', valuesByMode: {} }],
    });
    expect(result.valid).toBe(false);
  });

  it('rejects a non-object payload', () => {
    expect(validateTokenContract('not json').valid).toBe(false);
  });

  it('rejects an empty modes array', () => {
    const result = validateTokenContract({ ...validPayload, modes: [] });
    expect(result.valid).toBe(false);
  });
});

const float = (name: string, value: number, extra: Record<string, unknown> = {}) => ({
  name,
  type: 'FLOAT',
  valuesByMode: { Light: value, Dark: value },
  ...extra,
});

describe('the fields that say which variable to bind instead', () => {
  it('accepts unit, bindAs, sameAs and derivedFrom as the exporter writes them', () => {
    const result = validateTokenContract({
      ...validPayload,
      variables: [
        float('line-height-4', 150, { derivedFrom: '$line-heights' }),
        float('line-height-normal', 1.5, { bindAs: 'line-height-4' }),
        float('font-size-4', 18, { unit: 'rem' }),
        float('font-size-lg', 18, { unit: 'rem', sameAs: 'font-size-4' }),
      ],
    });
    expect(result).toEqual({ valid: true, contract: expect.anything() });
  });

  it('rejects a field that is present but not a string', () => {
    const result = validateTokenContract({
      ...validPayload,
      variables: [float('x', 1, { bindAs: 4 })],
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toEqual(['variables[0].bindAs must be a string when present']);
    }
  });

  it('rejects both bindAs and sameAs on one variable, an empty target, and a self-pointer', () => {
    const errorsFor = (extra: Record<string, unknown>) => {
      const result = validateTokenContract({ ...validPayload, variables: [float('x', 1, extra)] });
      return result.valid ? [] : result.errors;
    };
    expect(errorsFor({ bindAs: 'a', sameAs: 'b' })).toEqual([
      'variables[0] carries both bindAs and sameAs, which name two different things to bind',
    ]);
    expect(errorsFor({ sameAs: '' })).toEqual(['variables[0] names an empty variable to bind as']);
    expect(errorsFor({ bindAs: 'x' })).toEqual(['variables[0] says to bind itself instead of itself']);
  });
});

describe('normaliseAliases', () => {
  const contractOf = (variables: unknown[]): TokenContract =>
    ({ ...validPayload, variables }) as unknown as TokenContract;

  it('rewrites a bindAs variable into an alias of its target in every mode', () => {
    const { contract, notes } = normaliseAliases(
      contractOf([float('line-height-4', 150), float('line-height-normal', 1.5, { bindAs: 'line-height-4' })]),
    );

    const normal = contract.variables[1];
    expect(normal.valuesByMode).toEqual({
      Light: { aliasOf: 'line-height-4' },
      Dark: { aliasOf: 'line-height-4' },
    });
    // The field stays on the variable: it is still true, and a reader may want it.
    expect(normal.bindAs).toBe('line-height-4');
    // The target itself is untouched.
    expect(contract.variables[0].valuesByMode).toEqual({ Light: 150, Dark: 150 });
    expect(notes).toEqual([]);
  });

  it('treats sameAs the same way', () => {
    const { contract } = normaliseAliases(
      contractOf([float('font-size-4', 18), float('font-size-lg', 18, { sameAs: 'font-size-4' })]),
    );

    expect(contract.variables[1].valuesByMode).toEqual({
      Light: { aliasOf: 'font-size-4' },
      Dark: { aliasOf: 'font-size-4' },
    });
  });

  it('bumps the specVersion to the one that admits an alias, since the rewrite introduced one', () => {
    const { contract } = normaliseAliases(
      contractOf([float('a', 1), float('b', 1, { bindAs: 'a' })]),
    );

    expect(contract.specVersion).toBe(TOKEN_CONTRACT_ALIAS_VERSION);
    // And what it produced still validates as a contract.
    expect(validateTokenContract(contract).valid).toBe(true);
  });

  it('keeps the declared value and says so when the target is not in the collection', () => {
    const input = contractOf([float('line-height-normal', 1.5, { bindAs: 'line-height-4' })]);

    const { contract, notes } = normaliseAliases(input);

    // Never guessed at: 1.5 is wrong to bind, but inventing 150 here would be
    // a value the file did not say.
    expect(contract.variables[0].valuesByMode).toEqual({ Light: 1.5, Dark: 1.5 });
    expect(notes).toEqual([
      '"line-height-normal" says to bind "line-height-4" instead, which is not in this collection; kept its own value',
    ]);
    expect(contract.specVersion).toBe(TOKEN_CONTRACT_SPEC_VERSION);
  });

  it('changes nothing when no variable carries either field', () => {
    const input = contractOf([float('a', 1), float('b', 2, { unit: 'rem', derivedFrom: '$x' })]);

    const { contract, notes } = normaliseAliases(input);

    expect(contract).toEqual(input);
    expect(notes).toEqual([]);
  });

  it('does not mutate what it was given', () => {
    const input = contractOf([float('a', 1), float('b', 1, { bindAs: 'a' })]);
    const before = JSON.stringify(input);

    normaliseAliases(input);

    expect(JSON.stringify(input)).toBe(before);
  });
});
