export const TOKEN_CONTRACT_SPEC_VERSION = '1.0.0';

export type TokenVariableType = 'COLOR' | 'FLOAT' | 'STRING' | 'BOOLEAN';

const SUPPORTED_TYPES: TokenVariableType[] = ['COLOR', 'FLOAT', 'STRING', 'BOOLEAN'];

export interface TokenColorValue {
  r: number;
  g: number;
  b: number;
  a: number;
}

export type TokenVariableValue = TokenColorValue | number | string | boolean;

export interface TokenVariable {
  name: string;
  type: TokenVariableType;
  valuesByMode: Record<string, TokenVariableValue>;
}

export interface TokenContract {
  specVersion: string;
  collection: string;
  modes: string[];
  variables: TokenVariable[];
}

export type TokenContractValidation =
  | { valid: true; contract: TokenContract }
  | { valid: false; errors: string[] };

/**
 * Structural check for figma-import-export's token contract (roadmap Phase 3
 * shape: `{ specVersion, collection, modes, variables }`, values already in
 * Figma's own Variables data model — not Tokens Studio JSON). Gaps are
 * reported, never thrown past this boundary, so a malformed file surfaces as
 * a readable list instead of an opaque crash.
 */
export function validateTokenContract(input: unknown): TokenContractValidation {
  const errors: string[] = [];
  if (typeof input !== 'object' || input === null) {
    return { valid: false, errors: ['payload is not an object'] };
  }
  const value = input as Record<string, unknown>;

  if (value.specVersion !== TOKEN_CONTRACT_SPEC_VERSION) {
    errors.push(
      `unsupported specVersion "${String(value.specVersion)}" (expected "${TOKEN_CONTRACT_SPEC_VERSION}")`,
    );
  }
  if (typeof value.collection !== 'string' || value.collection.length === 0) {
    errors.push('"collection" must be a non-empty string');
  }
  if (
    !Array.isArray(value.modes) ||
    value.modes.length === 0 ||
    !value.modes.every((mode) => typeof mode === 'string')
  ) {
    errors.push('"modes" must be a non-empty array of strings');
  }
  if (!Array.isArray(value.variables)) {
    errors.push('"variables" must be an array');
  } else {
    value.variables.forEach((variable, index) => {
      if (typeof variable !== 'object' || variable === null) {
        errors.push(`variables[${index}] is not an object`);
        return;
      }
      const v = variable as Record<string, unknown>;
      if (typeof v.name !== 'string' || v.name.length === 0) {
        errors.push(`variables[${index}].name must be a non-empty string`);
      }
      if (typeof v.type !== 'string' || !SUPPORTED_TYPES.includes(v.type as TokenVariableType)) {
        errors.push(`variables[${index}].type must be one of ${SUPPORTED_TYPES.join(', ')}`);
      }
      if (typeof v.valuesByMode !== 'object' || v.valuesByMode === null) {
        errors.push(`variables[${index}].valuesByMode must be an object`);
      }
    });
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }
  return { valid: true, contract: value as unknown as TokenContract };
}
