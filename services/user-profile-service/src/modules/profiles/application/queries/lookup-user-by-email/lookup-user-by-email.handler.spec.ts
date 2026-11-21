// PrismaService pulls in the generated client, which jest cannot load: the handler gets a fake instead.
jest.mock('../../../../../infrastructure/database/prisma.service.js', () => ({ PrismaService: class {} }));

import { LookupUserByEmailHandler } from './lookup-user-by-email.handler.js';
import { LookupUserByEmailQuery } from './lookup-user-by-email.query.js';

describe('LookupUserByEmailHandler', () => {
  const make = (entry: unknown, profile: unknown) => {
    const prisma = {
      userEmailIndex: { findFirst: jest.fn().mockResolvedValue(entry) },
      profile: { findFirst: jest.fn().mockResolvedValue(profile) },
    };
    return { prisma, handler: new LookupUserByEmailHandler(prisma as any) };
  };

  it('finds the address without case and returns roles with the profile name', async () => {
    const { handler, prisma } = make({ userId: 'u-1', roles: ['student'] }, { displayName: 'Olena' });
    await expect(handler.execute(new LookupUserByEmailQuery('  Olena@X.test '))).resolves.toEqual({
      userId: 'u-1',
      roles: ['student'],
      displayName: 'Olena',
    });
    expect(prisma.userEmailIndex.findFirst).toHaveBeenCalledWith({
      where: { email: { equals: 'Olena@X.test', mode: 'insensitive' } },
    });
  });

  it('null for an unknown address', async () => {
    const { handler, prisma } = make(null, null);
    await expect(handler.execute(new LookupUserByEmailQuery('nobody@x.test'))).resolves.toBeNull();
    expect(prisma.profile.findFirst).not.toHaveBeenCalled();
  });

  it('null for a blank address without asking the database', async () => {
    const { handler, prisma } = make({ userId: 'u-1', roles: [] }, null);
    await expect(handler.execute(new LookupUserByEmailQuery('   '))).resolves.toBeNull();
    expect(prisma.userEmailIndex.findFirst).not.toHaveBeenCalled();
  });
});
