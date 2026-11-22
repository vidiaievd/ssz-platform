import { ForbiddenException } from '@nestjs/common';
import { ListTagsHandler } from './list-tags.handler.js';
import { ListTagsQuery } from './list-tags.query.js';
import { TagScope } from '../../../domain/value-objects/tag-scope.vo.js';
import type { ITagRepository } from '../../../domain/repositories/tag.repository.interface.js';
import type { IOrganizationClient } from '../../../../../shared/access-control/domain/ports/organization-client.port.js';

function setup(role: string | null = 'teacher') {
  const findAll = jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, limit: 10, totalPages: 0 });
  const tagRepo = { findAll } as unknown as ITagRepository;
  const getMemberRole = jest.fn().mockResolvedValue(role);
  const orgClient = { getMemberRole } as unknown as IOrganizationClient;
  return { findAll, getMemberRole, handler: new ListTagsHandler(tagRepo, orgClient) };
}

const list = (over: { admin?: boolean; scope?: TagScope; schoolId?: string; search?: string } = {}) =>
  new ListTagsQuery('u1', over.admin ?? false, over.scope, undefined, over.schoolId, over.search, 1, 10);

describe('ListTagsHandler', () => {
  it("shows a non-admin without a scope global tags plus their school's, never other schools'", async () => {
    const { findAll, getMemberRole, handler } = setup('teacher');
    await handler.execute(list({ schoolId: 'sch1', search: 'verb' }));
    expect(getMemberRole).toHaveBeenCalledWith('u1', 'sch1');
    expect(findAll).toHaveBeenCalledWith(
      expect.objectContaining({ visibleToSchool: 'sch1', ownerSchoolId: undefined, search: 'verb' }),
    );
  });

  it('shows a non-admin without a scope or school only global tags', async () => {
    const { findAll, getMemberRole, handler } = setup();
    await handler.execute(list());
    expect(getMemberRole).not.toHaveBeenCalled();
    expect(findAll).toHaveBeenCalledWith(expect.objectContaining({ visibleToSchool: null }));
  });

  it("refuses a school's tags to someone outside it", async () => {
    const { findAll, handler } = setup(null);
    await expect(handler.execute(list({ schoolId: 'sch1' }))).rejects.toBeInstanceOf(ForbiddenException);
    expect(findAll).not.toHaveBeenCalled();
  });

  it('leaves a platform admin unrestricted', async () => {
    const { findAll, handler } = setup();
    await handler.execute(list({ admin: true }));
    expect(findAll).toHaveBeenCalledWith(expect.objectContaining({ visibleToSchool: undefined }));
  });

  it('keeps an explicit school scope narrowed to that school', async () => {
    const { findAll, handler } = setup('owner');
    await handler.execute(list({ scope: TagScope.SCHOOL, schoolId: 'sch1' }));
    expect(findAll).toHaveBeenCalledWith(
      expect.objectContaining({ scope: TagScope.SCHOOL, ownerSchoolId: 'sch1', visibleToSchool: undefined }),
    );
  });
});
