// PrismaService pulls in the generated client, which jest cannot load: the handler gets a fake instead.
jest.mock('../../../../../infrastructure/database/prisma.service.js', () => ({ PrismaService: class {} }));

import { GetUserContactHandler } from './get-user-contact.handler.js';
import { GetUserContactQuery } from './get-user-contact.query.js';

describe('GetUserContactHandler', () => {
  const make = (entry: unknown, profile: unknown) => {
    const prisma = {
      userEmailIndex: { findUnique: jest.fn().mockResolvedValue(entry) },
      profile: { findFirst: jest.fn().mockResolvedValue(profile) },
    };
    return { prisma, handler: new GetUserContactHandler(prisma as any) };
  };

  it('returns the address with the profile name and locale', async () => {
    const { handler } = make({ email: 'o@x.test' }, { displayName: 'Olena', uiLocale: 'uk' });
    await expect(handler.execute(new GetUserContactQuery('u-1'))).resolves.toEqual({
      userId: 'u-1',
      email: 'o@x.test',
      displayName: 'Olena',
      uiLocale: 'uk',
    });
  });

  it('keeps the address when the profile is gone', async () => {
    const { handler } = make({ email: 'o@x.test' }, null);
    await expect(handler.execute(new GetUserContactQuery('u-1'))).resolves.toMatchObject({ email: 'o@x.test', displayName: null, uiLocale: null });
  });

  it('null without an address on record', async () => {
    const { handler, prisma } = make(null, null);
    await expect(handler.execute(new GetUserContactQuery('u-1'))).resolves.toBeNull();
    expect(prisma.profile.findFirst).not.toHaveBeenCalled();
  });
});
