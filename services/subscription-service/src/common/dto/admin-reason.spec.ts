import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { AdminReasonDto } from './admin-reason.js';

function errors(plain: object): string[] {
  return validateSync(plainToInstance(AdminReasonDto, plain)).flatMap((e) => Object.keys(e.constraints ?? {}));
}

describe('AdminReasonDto', () => {
  it('accepts a reason', () => {
    expect(errors({ reason: 'Agreed with the school' })).toEqual([]);
  });

  it.each([[{}], [{ reason: '' }], [{ reason: '   ' }], [{ reason: 42 }]])('refuses %j', (plain) => {
    expect(errors(plain)).not.toEqual([]);
  });

  it('refuses more than 500 characters', () => {
    expect(errors({ reason: 'x'.repeat(501) })).toContain('maxLength');
  });
});
