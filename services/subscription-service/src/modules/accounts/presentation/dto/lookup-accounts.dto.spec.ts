import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { LookupAccountsDto } from './account.dto.js';

const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
// Seeded content ids are uuidv5; they must pass too.
const v5 = '9b2e1c4d-3f6a-5b7c-8d9e-0a1b2c3d4e5f';

function errors(plain: object): string[] {
  return validateSync(plainToInstance(LookupAccountsDto, plain)).flatMap((e) => Object.keys(e.constraints ?? {}));
}

describe('LookupAccountsDto', () => {
  it('accepts 1 to 200 UUIDs of any version', () => {
    expect(errors({ type: 'workspace', ids: [id(1), v5] })).toEqual([]);
    expect(errors({ type: 'user', ids: Array.from({ length: 200 }, (_, i) => id(i)) })).toEqual([]);
  });

  it.each([
    [{ type: 'workspace', ids: [] }],
    [{ type: 'workspace' }],
    [{ type: 'school', ids: [id(1)] }],
    [{ type: 'workspace', ids: ['not-a-uuid'] }],
    [{ type: 'workspace', ids: id(1) }],
  ])('refuses %j', (plain) => {
    expect(errors(plain)).not.toEqual([]);
  });

  it('refuses more than 200 ids', () => {
    expect(errors({ type: 'workspace', ids: Array.from({ length: 201 }, (_, i) => id(i)) })).toContain('arrayMaxSize');
  });
});
