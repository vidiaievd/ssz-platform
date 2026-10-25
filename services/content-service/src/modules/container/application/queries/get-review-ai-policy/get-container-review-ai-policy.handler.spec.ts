import { jest } from '@jest/globals';
import { GetContainerReviewAiPolicyHandler } from './get-container-review-ai-policy.handler.js';
import { GetContainerReviewAiPolicyQuery } from './get-container-review-ai-policy.query.js';
import { SetContainerReviewAiPolicyHandler } from '../../commands/set-review-ai-policy/set-container-review-ai-policy.handler.js';
import { SetContainerReviewAiPolicyCommand } from '../../commands/set-review-ai-policy/set-container-review-ai-policy.command.js';
import { ContainerEntity } from '../../../domain/entities/container.entity.js';
import { ContainerDomainError } from '../../../domain/exceptions/container-domain.exceptions.js';
import { ContainerType } from '../../../domain/value-objects/container-type.vo.js';
import { DifficultyLevel } from '../../../domain/value-objects/difficulty-level.vo.js';
import { Visibility } from '../../../domain/value-objects/visibility.vo.js';
import { getDefaultAccessTier } from '../../../domain/value-objects/access-tier.vo.js';

const SCHOOL = 'school-1';

function course(ownerSchoolId: string | null = SCHOOL): ContainerEntity {
  const visibility = ownerSchoolId ? Visibility.SCHOOL_PRIVATE : Visibility.PRIVATE;
  const created = ContainerEntity.create({
    containerType: ContainerType.COURSE,
    targetLanguage: 'nb',
    difficultyLevel: DifficultyLevel.A2,
    title: 'Ny i Norge — A2',
    ownerUserId: 'author-1',
    ownerSchoolId: ownerSchoolId ?? undefined,
    visibility,
    accessTier: getDefaultAccessTier(visibility),
  });
  if (created.isFail) throw new Error(String(created.error));
  return created.value;
}

function makeQuery(container: ContainerEntity | null, opts: { orgDown?: boolean } = {}) {
  const containers = { findById: jest.fn(() => Promise.resolve(container)) };
  const fail = () => Promise.reject(new Error('organization-service unavailable'));
  const organization = {
    getSchoolReviewAiPolicy: jest.fn(() =>
      opts.orgDown
        ? fail()
        : Promise.resolve({ mode: 'ai_then_teacher', autoAcceptAfterHours: 168, samplePercent: 15 }),
    ),
    getSchoolReviewSettings: jest.fn(() =>
      opts.orgDown
        ? fail()
        : Promise.resolve({ respondWithinHours: 48, escalateAfterHours: 72, escalateTo: 'school_admins' }),
    ),
  };
  const cache = { get: jest.fn(() => Promise.resolve(null)), set: jest.fn(() => Promise.resolve()) };
  return {
    handler: new GetContainerReviewAiPolicyHandler(containers as never, organization as never, cache as never),
    organization,
  };
}

function makeCommand(container: ContainerEntity | null, knownTemplates = ['writing_task', 'read_aloud']) {
  const containers = {
    findById: jest.fn(() => Promise.resolve(container)),
    save: jest.fn(() => Promise.resolve()),
  };
  const templates = {
    findByCode: jest.fn((code: string) => Promise.resolve(knownTemplates.includes(code) ? { code } : null)),
  };
  const auditLog = { record: jest.fn(() => Promise.resolve()) };
  return {
    handler: new SetContainerReviewAiPolicyHandler(containers as never, templates as never, auditLog as never),
    containers,
  };
}

describe('GetContainerReviewAiPolicyHandler', () => {
  it('inherits the school’s term and reports the school’s mode and share', async () => {
    const { handler } = makeQuery(course());

    const r = await handler.execute(new GetContainerReviewAiPolicyQuery('c-1'));
    expect(r.value).toEqual({
      autoAcceptAfterHours: 168,
      inheritedAutoAcceptAfterHours: 168,
      overridden: false,
      escalationFloorHours: 72,
      teacherReviewTemplates: [],
      schoolMode: 'ai_then_teacher',
      samplePercent: 15,
      ownerSchoolId: SCHOOL,
    });
  });

  it('applies the course’s own term', async () => {
    const c = course();
    c.setReviewAiPolicy(96, ['writing_task']);
    const { handler } = makeQuery(c);

    const r = await handler.execute(new GetContainerReviewAiPolicyQuery('c-1'));
    expect(r.value).toMatchObject({ autoAcceptAfterHours: 96, overridden: true, teacherReviewTemplates: ['writing_task'] });
  });

  /** Q2-A: the administrator hears of unanswered work before the model's verdict counts. */
  it('raises a course term below the school’s escalation to it', async () => {
    const c = course();
    c.setReviewAiPolicy(24, []);
    const { handler } = makeQuery(c);

    const r = await handler.execute(new GetContainerReviewAiPolicyQuery('c-1'));
    expect(r.value).toMatchObject({ autoAcceptAfterHours: 72, overridden: true, escalationFloorHours: 72 });
  });

  it('inherits nothing for a course outside a school, or while the school cannot be reached', async () => {
    const outside = await makeQuery(course(null)).handler.execute(new GetContainerReviewAiPolicyQuery('c-1'));
    expect(outside.value).toMatchObject({
      autoAcceptAfterHours: null,
      schoolMode: null,
      samplePercent: null,
      ownerSchoolId: null,
    });

    const c = course();
    c.setReviewAiPolicy(96, []);
    const down = await makeQuery(c, { orgDown: true }).handler.execute(new GetContainerReviewAiPolicyQuery('c-1'));
    expect(down.value).toMatchObject({ autoAcceptAfterHours: 96, inheritedAutoAcceptAfterHours: null, schoolMode: null });
  });

  it('reports a missing course as missing', async () => {
    const r = await makeQuery(null).handler.execute(new GetContainerReviewAiPolicyQuery('c-1'));
    expect(r.error).toBe(ContainerDomainError.CONTAINER_NOT_FOUND);
  });
});

describe('SetContainerReviewAiPolicyHandler', () => {
  it('stores the term and the templates, sorted and unique', async () => {
    const c = course();
    const { handler, containers } = makeCommand(c);

    const r = await handler.execute(
      new SetContainerReviewAiPolicyCommand('author-1', 'c-1', 72, ['writing_task', 'read_aloud', 'writing_task']),
    );
    expect(r.isOk).toBe(true);
    expect(c.reviewAutoAcceptAfterHours).toBe(72);
    expect(c.reviewTeacherTemplates).toEqual(['read_aloud', 'writing_task']);
    expect(containers.save).toHaveBeenCalled();
  });

  it('goes back to the school’s term with null', async () => {
    const c = course();
    c.setReviewAiPolicy(72, []);
    await makeCommand(c).handler.execute(new SetContainerReviewAiPolicyCommand('author-1', 'c-1', null, []));
    expect(c.reviewAutoAcceptAfterHours).toBeNull();
  });

  /** A misspelt code would send the essays it meant to the model instead of the teacher. */
  it('refuses a template the catalogue does not know', async () => {
    const c = course();
    const { handler, containers } = makeCommand(c);

    const r = await handler.execute(new SetContainerReviewAiPolicyCommand('author-1', 'c-1', 72, ['writing_tsk']));
    expect(r.error).toBe(ContainerDomainError.UNKNOWN_EXERCISE_TEMPLATE);
    expect(containers.save).not.toHaveBeenCalled();
  });

  it('refuses hours outside a month and fractions of an hour', async () => {
    for (const hours of [0, 721, 1.5]) {
      const r = await makeCommand(course()).handler.execute(
        new SetContainerReviewAiPolicyCommand('author-1', 'c-1', hours, []),
      );
      expect(r.error).toBe(ContainerDomainError.INVALID_REVIEW_AI_POLICY);
    }
  });
});
