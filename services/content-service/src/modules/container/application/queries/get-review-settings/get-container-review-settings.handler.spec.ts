import { jest } from '@jest/globals';
import { GetContainerReviewSettingsHandler } from './get-container-review-settings.handler.js';
import { GetContainerReviewSettingsQuery } from './get-container-review-settings.query.js';
import { SetContainerReviewSettingsHandler } from '../../commands/set-review-settings/set-container-review-settings.handler.js';
import { SetContainerReviewSettingsCommand } from '../../commands/set-review-settings/set-container-review-settings.command.js';
import { ContainerEntity } from '../../../domain/entities/container.entity.js';
import { ContainerDomainError } from '../../../domain/exceptions/container-domain.exceptions.js';
import { ContainerType } from '../../../domain/value-objects/container-type.vo.js';
import { DifficultyLevel } from '../../../domain/value-objects/difficulty-level.vo.js';
import { Visibility } from '../../../domain/value-objects/visibility.vo.js';
import { AccessTier } from '../../../domain/value-objects/access-tier.vo.js';

const SCHOOL = 'school-1';

function course(ownerSchoolId: string | null = SCHOOL): ContainerEntity {
  const created = ContainerEntity.create({
    containerType: ContainerType.COURSE,
    targetLanguage: 'nb',
    difficultyLevel: DifficultyLevel.A2,
    title: 'Ny i Norge — A2',
    ownerUserId: 'author-1',
    ownerSchoolId: ownerSchoolId ?? undefined,
    visibility: ownerSchoolId ? Visibility.SCHOOL_PRIVATE : Visibility.PRIVATE,
    accessTier: AccessTier.FREE,
  });
  if (created.isFail) throw new Error(String(created.error));
  return created.value;
}

function makeHandler(container: ContainerEntity | null, schoolHours: number | null = 48) {
  const containers = {
    findById: jest.fn(() => Promise.resolve(container)),
    save: jest.fn(() => Promise.resolve()),
  };
  const organization = {
    getSchoolReviewSettings: jest.fn(() =>
      Promise.resolve(
        schoolHours === null
          ? null
          : { respondWithinHours: schoolHours, escalateAfterHours: 72, escalateTo: 'school_admins' },
      ),
    ),
  };
  const cache = {
    get: jest.fn(() => Promise.resolve(null)),
    set: jest.fn(() => Promise.resolve()),
  };

  return {
    handler: new GetContainerReviewSettingsHandler(
      containers as never,
      organization as never,
      cache as never,
    ),
    containers,
    organization,
    cache,
  };
}

const query = new GetContainerReviewSettingsQuery('course-1');

describe('GetContainerReviewSettingsHandler', () => {
  it('reports the school’s promise when the course makes none of its own', async () => {
    const { handler } = makeHandler(course());

    const result = await handler.execute(query);

    expect(result.value).toEqual({
      respondWithinHours: 48,
      inheritedHours: 48,
      overridden: false,
    });
  });

  /**
   * Criterion 35: the inherited number is reported beside the override, so an author can
   * see what they departed from — and so "inherits 24" and "overrides with 24" stay
   * distinguishable.
   */
  it('reports the override and the inherited number side by side', async () => {
    const container = course();
    container.setReviewRespondWithinHours(24);
    const { handler } = makeHandler(container);

    const result = await handler.execute(query);

    expect(result.value).toEqual({
      respondWithinHours: 24,
      inheritedHours: 48,
      overridden: true,
    });
  });

  it('inherits nothing for a course that belongs to no school', async () => {
    const { handler, organization } = makeHandler(course(null));

    const result = await handler.execute(query);

    expect(result.value).toEqual({
      respondWithinHours: null,
      inheritedHours: null,
      overridden: false,
    });
    expect(organization.getSchoolReviewSettings).not.toHaveBeenCalled();
  });

  it('caches the school’s promise for a minute rather than asking per read', async () => {
    const { handler, cache, organization } = makeHandler(course());

    await handler.execute(query);
    expect(cache.set).toHaveBeenCalledWith(
      `content:school-review-settings:${SCHOOL}`,
      48,
      60,
    );

    cache.get.mockResolvedValue(48 as never);
    await handler.execute(query);
    expect(organization.getSchoolReviewSettings).toHaveBeenCalledTimes(1);
  });

  /** The subject of this route is the course's own setting; a neighbour being down
   *  must not stop an author reading or changing it. */
  it('reports no inherited promise when organization-service cannot be reached', async () => {
    const container = course();
    container.setReviewRespondWithinHours(24);
    const { handler, organization } = makeHandler(container);
    organization.getSchoolReviewSettings.mockRejectedValue(new Error('unreachable') as never);

    const result = await handler.execute(query);

    expect(result.value).toEqual({
      respondWithinHours: 24,
      inheritedHours: null,
      overridden: true,
    });
  });

  it('reports a missing course as missing', async () => {
    const { handler } = makeHandler(null);

    const result = await handler.execute(query);

    expect(result.isFail).toBe(true);
    expect(result.error).toBe(ContainerDomainError.CONTAINER_NOT_FOUND);
  });
});

describe('SetContainerReviewSettingsHandler', () => {
  function makeSetter(container: ContainerEntity | null) {
    const containers = {
      findById: jest.fn(() => Promise.resolve(container)),
      save: jest.fn(() => Promise.resolve()),
    };
    const auditLog = { record: jest.fn(() => Promise.resolve()) };
    return {
      handler: new SetContainerReviewSettingsHandler(containers as never, auditLog as never),
      containers,
      auditLog,
    };
  }

  it('sets the course’s own promise and records who did it', async () => {
    const container = course();
    const { handler, containers, auditLog } = makeSetter(container);

    const result = await handler.execute(
      new SetContainerReviewSettingsCommand('author-1', 'course-1', 24),
    );

    expect(result.isOk).toBe(true);
    expect(container.reviewRespondWithinHours).toBe(24);
    expect(containers.save).toHaveBeenCalled();
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({ changedFields: ['reviewRespondWithinHours'] }),
    );
  });

  /** Null is a value: it gives the promise back to the school rather than freezing a copy. */
  it('clears the override on null', async () => {
    const container = course();
    container.setReviewRespondWithinHours(24);
    const { handler } = makeSetter(container);

    await handler.execute(new SetContainerReviewSettingsCommand('author-1', 'course-1', null));

    expect(container.reviewRespondWithinHours).toBeNull();
  });

  it('refuses hours outside a month and fractions of an hour', async () => {
    const container = course();
    const { handler, containers } = makeSetter(container);

    for (const hours of [0, 721, 1.5]) {
      const result = await handler.execute(
        new SetContainerReviewSettingsCommand('author-1', 'course-1', hours),
      );
      expect(result.error).toBe(ContainerDomainError.INVALID_REVIEW_RESPONSE_TIME);
    }
    expect(containers.save).not.toHaveBeenCalled();
  });
});
