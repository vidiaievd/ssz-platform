import { jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import { AdminUsersController } from './admin-users.controller.js';
import { GetAdminUserSchoolsQuery } from '../../application/queries/get-admin-user-schools.query.js';
import { GetAdminUserSchoolsHandler } from '../../application/queries/get-admin-user-schools.handler.js';

const USER_ID = '22222222-2222-5222-8222-222222222222'; // seeded users are uuidv5

function setup(answer: unknown) {
  const queryBus = { execute: jest.fn<(q: unknown) => Promise<unknown>>().mockResolvedValue(answer) };
  return { queryBus, controller: new AdminUsersController(queryBus as never) };
}

describe('AdminUsersController', () => {
  it("reads a user's schools for any UUID version", async () => {
    const answer = { userId: USER_ID, owned: [], memberships: [] };
    const { queryBus, controller } = setup(answer);

    await expect(controller.schools(USER_ID)).resolves.toEqual(answer);
    expect(queryBus.execute.mock.calls[0][0]).toEqual(new GetAdminUserSchoolsQuery(USER_ID));
  });

  it('answers 404 for something that is not an id, without touching the database', async () => {
    const { queryBus, controller } = setup({});

    await expect(controller.schools('kari@example.com')).rejects.toBeInstanceOf(NotFoundException);
    expect(queryBus.execute).not.toHaveBeenCalled();
  });
});

describe('GetAdminUserSchoolsHandler', () => {
  it('shapes what the reader found', async () => {
    const reader = {
      rowsOf: jest.fn<() => Promise<unknown>>().mockResolvedValue({ owned: [], memberships: [], groups: [] }),
    };
    const handler = new GetAdminUserSchoolsHandler(reader as never);

    await expect(handler.execute(new GetAdminUserSchoolsQuery(USER_ID))).resolves.toEqual({
      userId: USER_ID,
      owned: [],
      memberships: [],
    });
    expect(reader.rowsOf).toHaveBeenCalledWith(USER_ID);
  });
});
