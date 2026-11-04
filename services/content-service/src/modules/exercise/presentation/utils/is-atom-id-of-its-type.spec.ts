import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ItemTargetDto } from '../dto/requests/set-item-targets.request.dto.js';

// Plan 86, step 8.2: the atom id is checked in the form of its type.

const errorsOf = (atomType: string, atomId: unknown) =>
  validateSync(plainToInstance(ItemTargetDto, { atomType, atomId, role: 'focus' })).map(
    (error) => error.property,
  );

describe('IsAtomIdOfItsType', () => {
  it('takes `<language>:<family>` for a sound', () => {
    expect(errorsOf('sound', 'nb:kj')).toEqual([]);
    expect(errorsOf('sound', 'nb:vowel_length')).toEqual([]);
  });

  it('refuses a uuid, an empty family or a capitalised key for a sound', () => {
    expect(errorsOf('sound', '3f1c2a9e-0b7d-4e5a-9c61-2d8f4b7a1e03')).toEqual(['atomId']);
    expect(errorsOf('sound', 'nb:')).toEqual(['atomId']);
    expect(errorsOf('sound', 'NB:KJ')).toEqual(['atomId']);
  });

  it('takes a uuid of any version for a word or a grammar atom, and refuses a sound key', () => {
    // uuidv5, as the seeded catalogue is.
    expect(errorsOf('grammar_rule_atom', '2ed6657d-e927-568b-95e1-2665a8aea6a2')).toEqual([]);
    expect(errorsOf('vocabulary_item', '3f1c2a9e-0b7d-4e5a-9c61-2d8f4b7a1e03')).toEqual([]);
    expect(errorsOf('vocabulary_item', 'nb:kj')).toEqual(['atomId']);
  });

  it('refuses a non-string', () => {
    expect(errorsOf('sound', 42)).toEqual(['atomId']);
  });
});
