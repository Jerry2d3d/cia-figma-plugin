/**
 * Versions this reader understands. A payload declares the MINIMUM version
 * needed to read it, not the version that produced it: `1.1.0` means it
 * contains at least one alias value, which a `1.0.0`-only reader would write
 * into Figma as garbage. Single-theme exports stay `1.0.0` and keep working
 * with any build of this plugin.
 */
export const TOKEN_CONTRACT_SPEC_VERSIONS = ['1.0.0', '1.1.0'] as const;

/** The version this plugin emits when it writes a contract of its own. */
export const TOKEN_CONTRACT_SPEC_VERSION = '1.0.0';

/** The version a payload must declare before it may contain alias values. */
export const TOKEN_CONTRACT_ALIAS_VERSION = '1.1.0';

export type TokenVariableType = 'COLOR' | 'FLOAT' | 'STRING' | 'BOOLEAN';

const SUPPORTED_TYPES: TokenVariableType[] = ['COLOR', 'FLOAT', 'STRING', 'BOOLEAN'];

export interface TokenColorValue {
  r: number;
  g: number;
  b: number;
  a: number;
}

/**
 * A pointer to another variable in the same collection, by name and without
 * the leading dashes. It exists because some tokens genuinely follow another
 * one: cia emits `--btn-radius: var(--radius-md, …)`, so a theme that does not
 * override it is not missing a value, it *is* `radius-md`. Copying the number
 * would silently break that link the moment someone edits `radius-md`.
 */
export interface TokenAliasValue {
  aliasOf: string;
}

export type TokenVariableValue = TokenColorValue | number | string | boolean | TokenAliasValue;

export function isAliasValue(value: unknown): value is TokenAliasValue {
  return typeof value === 'object' && value !== null && typeof (value as TokenAliasValue).aliasOf === 'string';
}

export interface TokenVariable {
  name: string;
  type: TokenVariableType;
  valuesByMode: Record<string, TokenVariableValue>;
  /**
   * The CSS unit the value was declared in, so an import can restore it. A
   * declared `1rem` arrives as value 16 with unit `rem`: the value is stored in
   * px so Figma spacing reads naturally, and the unit records what to write back.
   * So a font size holding 30 with unit rem is the convention, not a mistake.
   */
  unit?: string;
  /**
   * The variable a builder should bind INSTEAD of this one. cia declares
   * `line-height-normal` as the multiplier 1.5, which a round trip must write
   * back unchanged, and no Figma text node can bind: on a node whose unit is
   * PERCENT it reads as 1.5%. The derived `line-height-4` holds 150 and is what
   * to bind. The sync honours this by making this variable an alias of that one,
   * so binding either name resolves to the same value and they cannot drift.
   */
  bindAs?: string;
  /** The numbered step this alias duplicates: `font-size-lg` is `font-size-4`. Same treatment as `bindAs`. */
  sameAs?: string;
  /** The cia Sass map a derived token was computed from, e.g. `$font-sizes-scale`. */
  derivedFrom?: string;
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

  if (typeof value.specVersion !== 'string' || !TOKEN_CONTRACT_SPEC_VERSIONS.includes(value.specVersion as never)) {
    errors.push(
      `unsupported specVersion "${String(value.specVersion)}" (this reader understands ${TOKEN_CONTRACT_SPEC_VERSIONS.join(', ')})`,
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
      (['unit', 'bindAs', 'sameAs', 'derivedFrom'] as const).forEach((field) => {
        if (v[field] !== undefined && typeof v[field] !== 'string') {
          errors.push(`variables[${index}].${field} must be a string when present`);
        }
      });
      // Both say "bind that one instead", so both is two answers to one question.
      if (typeof v.bindAs === 'string' && typeof v.sameAs === 'string') {
        errors.push(`variables[${index}] carries both bindAs and sameAs, which name two different things to bind`);
      }
      if (v.bindAs === '' || v.sameAs === '') {
        errors.push(`variables[${index}] names an empty variable to bind as`);
      }
      if (v.bindAs === v.name || v.sameAs === v.name) {
        errors.push(`variables[${index}] says to bind itself instead of itself`);
      }
      if (typeof v.valuesByMode !== 'object' || v.valuesByMode === null) {
        errors.push(`variables[${index}].valuesByMode must be an object`);
      } else {
        Object.entries(v.valuesByMode as Record<string, unknown>).forEach(([mode, modeValue]) => {
          if (!isAliasValue(modeValue)) {
            return;
          }
          if (modeValue.aliasOf.length === 0) {
            errors.push(`variables[${index}].valuesByMode["${mode}"].aliasOf must be a non-empty string`);
          }
          // An alias is only readable by 1.1.0 and up, so a payload carrying
          // one while claiming 1.0.0 would be mis-written by an older reader.
          if (value.specVersion !== TOKEN_CONTRACT_ALIAS_VERSION) {
            errors.push(
              `variables[${index}].valuesByMode["${mode}"] is an alias, which requires specVersion "${TOKEN_CONTRACT_ALIAS_VERSION}"`,
            );
          }
        });
      }
    });
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }
  return { valid: true, contract: value as unknown as TokenContract };
}

/**
 * Turns `bindAs` and `sameAs` into what the sync already understands: an alias
 * value in every mode. Run after validation and before sync.
 *
 * The producer keeps a declared value as cia wrote it, because its import
 * writes declared variables back into the theme and `--line-height-normal: 150`
 * would put a percentage where a multiplier belongs. So the file says "bind that
 * one instead" on the variable, and this makes it so in Figma: the variable
 * becomes a Figma alias of its target, binding either name resolves to the same
 * value, and the two can never drift. A target that is not in the collection is
 * left alone and reported, never guessed at, which the sync's own alias check
 * then says again at the point of writing.
 */
export function normaliseAliases(contract: TokenContract): { contract: TokenContract; notes: string[] } {
  const names = new Set(contract.variables.map((variable) => variable.name));
  const notes: string[] = [];

  const variables = contract.variables.map((variable) => {
    const target = variable.bindAs ?? variable.sameAs;
    if (!target) {
      return variable;
    }
    if (!names.has(target)) {
      notes.push(`"${variable.name}" says to bind "${target}" instead, which is not in this collection; kept its own value`);
      return variable;
    }
    const valuesByMode: Record<string, TokenVariableValue> = {};
    contract.modes.forEach((mode) => {
      valuesByMode[mode] = { aliasOf: target };
    });
    return { ...variable, valuesByMode };
  });

  // An alias needs the version that admits one, and the rewrite may have
  // introduced the first. The declared version is the MINIMUM to read the file
  // as sent, and this is not the file as sent, so it moves up rather than lying.
  const specVersion = variables.some((variable) =>
    Object.values(variable.valuesByMode).some(isAliasValue),
  )
    ? TOKEN_CONTRACT_ALIAS_VERSION
    : contract.specVersion;

  return { contract: { ...contract, specVersion, variables }, notes };
}
