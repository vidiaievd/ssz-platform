import { ForbiddenException } from '@nestjs/common';
import { CreateTagHandler } from './create-tag.handler.js';
import { CreateTagCommand } from './create-tag.command.js';
import { TagScope } from '../../../domain/value-objects/tag-scope.vo.js';
import { TagCategory } from '../../../domain/value-objects/tag-category.vo.js';
import { TagDomainError } from '../../../domain/exceptions/tag-domain.exceptions.js';
import type { ITagRepository } from '../../../domain/repositories/tag.repository.interface.js';
import type { IOrganizationClient } from '../../../../../shared/access-control/domain/ports/organization-client.port.js';
import type { TagSlugGeneratorService } from '../../../domain/services/tag-slug-generator.service.js';

function makeHandler(overrides?: {
  getMemberRole?: jest.Mock;
  save?: jest.Mock;
  generate?: jest.Mock;
}): CreateTagHandler {
  const tagRepo: ITagRepository = {
    findById: jest.fn(),
    findBySlugAndScope: jest.fn(),
    countBySlugPrefix: jest.fn(),
    findAll: jest.fn(),
    save: overrides?.save ?? jest.fn().mockImplementation((e) => Promise.resolve(e)),
  } as unknown as ITagRepository;

  const orgClient: IOrganizationClient = {
    getMemberRole: overrides?.getMemberRole ?? jest.fn().mockResolvedValue(null),
  };

  const slugGenerator = {
    generate: overrides?.generate ?? jest.fn().mockResolvedValue('test-tag'),
  } as unknown as TagSlugGeneratorService;

  return new CreateTagHandler(tagRepo, orgClient, slugGenerator);
}

describe('CreateTagHandler', () => {
  it('creates a global tag when caller is platform admin', async () => {
    const handler = makeHandler();
    const command = new CreateTagCommand(
      'user-1',
      true,
      'Grammar',
      TagCategory.TOPIC,
      TagScope.GLOBAL,
    );
    const result = await handler.execute(command);
    expect(result.isOk).toBe(true);
    expect(result.value.scope).toBe(TagScope.GLOBAL);
  });

  it('throws ForbiddenException when non-admin tries to create global tag', async () => {
    const handler = makeHandler();
    const command = new CreateTagCommand(
      'user-1',
      false,
      'Grammar',
      TagCategory.TOPIC,
      TagScope.GLOBAL,
    );
    await expect(handler.execute(command)).rejects.toThrow(ForbiddenException);
  });

  it('creates school tag for content_admin member', async () => {
    const getMemberRole = jest.fn().mockResolvedValue('content_admin');
    const handler = makeHandler({ getMemberRole });
    const command = new CreateTagCommand(
      'user-1',
      false,
      'Vocabulary',
      TagCategory.TOPIC,
      TagScope.SCHOOL,
      'school-1',
    );
    const result = await handler.execute(command);
    expect(result.isOk).toBe(true);
    expect(result.value.scope).toBe(TagScope.SCHOOL);
  });

  it('creates school tag for owner member', async () => {
    const getMemberRole = jest.fn().mockResolvedValue('owner');
    const handler = makeHandler({ getMemberRole });
    const command = new CreateTagCommand(
      'user-1',
      false,
      'Vocab',
      TagCategory.SKILL,
      TagScope.SCHOOL,
      'school-1',
    );
    const result = await handler.execute(command);
    expect(result.isOk).toBe(true);
  });

  it('throws ForbiddenException when teacher tries to create school tag', async () => {
    const getMemberRole = jest.fn().mockResolvedValue('teacher');
    const handler = makeHandler({ getMemberRole });
    const command = new CreateTagCommand(
      'user-1',
      false,
      'Grammar',
      TagCategory.TOPIC,
      TagScope.SCHOOL,
      'school-1',
    );
    await expect(handler.execute(command)).rejects.toThrow(ForbiddenException);
  });

  it('returns fail when school scope is given without ownerSchoolId', async () => {
    const getMemberRole = jest.fn().mockResolvedValue('content_admin');
    const handler = makeHandler({ getMemberRole });
    const command = new CreateTagCommand(
      'user-1',
      false,
      'Grammar',
      TagCategory.TOPIC,
      TagScope.SCHOOL,
    );
    const result = await handler.execute(command);
    expect(result.isFail).toBe(true);
    expect(result.error).toBe(TagDomainError.SCHOOL_TAG_REQUIRES_SCHOOL);
  });

  it('platform admin can create school tag without role check', async () => {
    const getMemberRole = jest.fn();
    const handler = makeHandler({ getMemberRole });
    const command = new CreateTagCommand(
      'admin-1',
      true,
      'Admin Tag',
      TagCategory.OTHER,
      TagScope.SCHOOL,
      'school-1',
    );
    const result = await handler.execute(command);
    expect(result.isOk).toBe(true);
    expect(getMemberRole).not.toHaveBeenCalled();
  });
});
