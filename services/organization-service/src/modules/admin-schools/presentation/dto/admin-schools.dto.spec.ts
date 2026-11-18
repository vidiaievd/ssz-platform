import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListAdminSchoolsQueryDto } from './admin-schools.dto.js';

const V4 = '6f1c2a9e-0b7d-4e3a-9c55-1d2e3f4a5b6c';
const V5 = '0a1b2c3d-4e5f-5a6b-8c7d-9e0f1a2b3c4d';

async function parse(query: Record<string, unknown>) {
  const dto = plainToInstance(ListAdminSchoolsQueryDto, query);
  return { dto, errors: await validate(dto) };
}

describe('ids of the admin list of schools', () => {
  it('splits a comma list, trims it and drops repeats; v5 ids of seeded schools pass', async () => {
    const { dto, errors } = await parse({ ids: ` ${V4}, ${V5},${V4}` });
    expect(errors).toEqual([]);
    expect(dto.ids).toEqual([V4, V5]);
  });

  it('takes a repeated parameter too', async () => {
    const { dto, errors } = await parse({ ids: [V4, `${V5}`] });
    expect(errors).toEqual([]);
    expect(dto.ids).toEqual([V4, V5]);
  });

  it('stays absent when not sent', async () => {
    const { dto, errors } = await parse({});
    expect(errors).toEqual([]);
    expect(dto.ids).toBeUndefined();
  });

  it.each([
    ['not a UUID', 'nord'],
    ['an empty item', `${V4},`],
    ['an empty value', ''],
  ])('refuses %s', async (_case, ids) => {
    const { errors } = await parse({ ids });
    expect(errors.map((e) => e.property)).toEqual(['ids']);
  });

  it('refuses more than 100 ids', async () => {
    const many = Array.from({ length: 101 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
    const { errors } = await parse({ ids: many.join(',') });
    expect(errors.map((e) => e.property)).toEqual(['ids']);
  });
});
