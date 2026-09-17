import { TOKEN_CONTRACT_SPEC_VERSION, validateTokenContract } from '@/shared/tokenContract';

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
