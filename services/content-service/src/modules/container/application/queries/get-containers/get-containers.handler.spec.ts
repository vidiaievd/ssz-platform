// The handler takes PrismaService by value for DI and maps rows with the generated
// client's helpers; neither may load the real client under jest.
jest.mock('../../../../../infrastructure/database/prisma.service.js', () => ({
  PrismaService: class {},
}));
jest.mock('../../../../../../generated/prisma/client.js', () => ({
  Prisma: { DbNull: null },
  $Enums: {},
}));

import { GetContainersHandler } from './get-containers.handler.js';
import { GetContainersQuery } from './get-containers.query.js';
import { PaginationService } from '../../../../../shared/discovery/application/services/pagination.service.js';
import { SortParserService } from '../../../../../shared/discovery/application/services/sort-parser.service.js';
import type { ContainerListQueryDto } from '../../../presentation/dto/requests/container-list-query.dto.js';
import type { AuthenticatedUser } from '../../../../../infrastructure/auth/jwt-verifier.service.js';

const USER = { userId: 'user-1' } as AuthenticatedUser;
const OBSOLETE_UNLESS_OWN = {
  OR: [{ maintenanceStatus: { not: 'OBSOLETE' } }, { ownerUserId: 'user-1' }],
};

function makeHandler() {
  const prisma = {
    container: {
      findMany: jest.fn(() => Promise.resolve([])),
      count: jest.fn(() => Promise.resolve(0)),
    },
  };
  const catalogBuilder = {
    build: jest.fn(() =>
      Promise.resolve({ where: { deletedAt: null, AND: [{ OR: [{ visibility: 'PUBLIC' }] }] } }),
    ),
  };
  const handler = new GetContainersHandler(
    prisma as never,
    new PaginationService(),
    new SortParserService(),
    catalogBuilder as never,
  );
  const whereOf = () =>
    (prisma.container.findMany.mock.calls[0] as unknown as [{ where: { AND: unknown[] } }])[0]
      .where;
  return { handler, prisma, whereOf };
}

describe('GetContainersHandler — obsolete courses (plan 90, Q5)', () => {
  it('leaves obsolete courses out of the list, except the caller’s own', async () => {
    const { handler, whereOf } = makeHandler();

    await handler.execute(new GetContainersQuery({} as ContainerListQueryDto, USER));

    expect(whereOf().AND).toContainEqual(OBSOLETE_UNLESS_OWN);
  });

  it('applies the same filter to the count', async () => {
    const { handler, prisma } = makeHandler();

    await handler.execute(new GetContainersQuery({} as ContainerListQueryDto, USER));

    const countWhere = (prisma.container.count.mock.calls[0] as unknown as [{ where: { AND: unknown[] } }])[0]
      .where;
    expect(countWhere.AND).toContainEqual(OBSOLETE_UNLESS_OWN);
  });

  it('lists them when asked with includeObsolete', async () => {
    const { handler, whereOf } = makeHandler();

    await handler.execute(
      new GetContainersQuery({ includeObsolete: true } as ContainerListQueryDto, USER),
    );

    expect(whereOf().AND).not.toContainEqual(OBSOLETE_UNLESS_OWN);
  });
});
