import { jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import { AdminSchoolsController } from './admin-schools.controller.js';
import { GetAdminSchoolQuery } from '../../application/queries/get-admin-school.query.js';
import { ListAdminSchoolsQuery } from '../../application/queries/list-admin-schools.query.js';
import { GetAdminSchoolSettingsQuery } from '../../application/queries/get-admin-school-settings.query.js';
import { ListAdminSchoolMembersQuery } from '../../application/queries/list-admin-school-members.query.js';

const SCHOOL_ID = '11111111-1111-5111-8111-111111111111'; // seeded rows are uuidv5

function setup(answer: unknown) {
  const queryBus = { execute: jest.fn<(q: unknown) => Promise<unknown>>().mockResolvedValue(answer) };
  return { queryBus, controller: new AdminSchoolsController(queryBus as never) };
}

describe('AdminSchoolsController', () => {
  it('fills the defaults: first page of 25, newest first', async () => {
    const { queryBus, controller } = setup({ items: [], total: 0, page: 1, limit: 25 });

    await controller.list({});

    const query = queryBus.execute.mock.calls[0][0] as ListAdminSchoolsQuery;
    expect(query).toBeInstanceOf(ListAdminSchoolsQuery);
    expect(query).toMatchObject({ sort: '-createdAt', page: 1, limit: 25 });
  });

  it('answers a card for any UUID version', async () => {
    const { queryBus, controller } = setup({ id: SCHOOL_ID });

    await expect(controller.get(SCHOOL_ID)).resolves.toEqual({ id: SCHOOL_ID });
    expect(queryBus.execute.mock.calls[0][0]).toEqual(new GetAdminSchoolQuery(SCHOOL_ID));
  });

  it('turns an unknown school into 404', async () => {
    const { controller } = setup(null);

    await expect(controller.get(SCHOOL_ID)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('answers 404 for something that is not an id, without touching the database', async () => {
    const { queryBus, controller } = setup({ id: 'x' });

    await expect(controller.get('nordick')).rejects.toBeInstanceOf(NotFoundException);
    expect(queryBus.execute).not.toHaveBeenCalled();
  });

  it('reads a roster page of 50 by default and passes the filters through', async () => {
    const { queryBus, controller } = setup({ items: [], total: 0, page: 1, limit: 50 });

    await controller.members(SCHOOL_ID, { role: 'staff', status: 'active', groupId: SCHOOL_ID });

    expect(queryBus.execute.mock.calls[0][0]).toEqual(
      new ListAdminSchoolMembersQuery(SCHOOL_ID, { role: 'staff', status: 'active', groupId: SCHOOL_ID }, 1, 50),
    );
  });

  it('turns an unknown school into 404 for the roster and the settings', async () => {
    const { controller } = setup(null);

    await expect(controller.members(SCHOOL_ID, {})).rejects.toBeInstanceOf(NotFoundException);
    await expect(controller.settings(SCHOOL_ID)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('answers 404 for roster and settings of a non-id, without touching the database', async () => {
    const { queryBus, controller } = setup({ items: [] });

    await expect(controller.members('nordick', {})).rejects.toBeInstanceOf(NotFoundException);
    await expect(controller.settings('nordick')).rejects.toBeInstanceOf(NotFoundException);
    expect(queryBus.execute).not.toHaveBeenCalled();
  });

  it('reads the settings of a school', async () => {
    const { queryBus, controller } = setup({ review: {} });

    await expect(controller.settings(SCHOOL_ID)).resolves.toEqual({ review: {} });
    expect(queryBus.execute.mock.calls[0][0]).toEqual(new GetAdminSchoolSettingsQuery(SCHOOL_ID));
  });
});
