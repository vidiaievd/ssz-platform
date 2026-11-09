import { isUUID, ValidateBy, type ValidationOptions } from 'class-validator';
import { AtomType, SOUND_ATOM_ID } from '../../domain/value-objects/atom-type.vo.js';

/**
 * An atom id in the form of its `atomType` (plan 86, step 8.2): `<language>:<family>` for a
 * sound, a uuid of any version for a word or a grammar atom. One validator rather than two
 * `ValidateIf`s, which combine with "and"; the same rule as the engine's `put-ai-draft.dto.ts`.
 * Whether the atom exists is the command's question, not the format's.
 */
export function IsAtomIdOfItsType(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isAtomIdOfItsType',
      validator: {
        validate: (value: unknown, args) =>
          typeof value === 'string' &&
          ((args?.object as { atomType?: unknown }).atomType === AtomType.SOUND
            ? SOUND_ATOM_ID.test(value)
            : isUUID(value)),
        defaultMessage: () =>
          'atomId must be a UUID for a word or grammar atom, `<language>:<family>` for a sound',
      },
    },
    options,
  );
}
