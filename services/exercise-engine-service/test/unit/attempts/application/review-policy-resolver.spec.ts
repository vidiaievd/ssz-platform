import { jest } from '@jest/globals';
import { sampleDocument, toContent, toExpectedAnswers } from '@ssz/shared-kernel/read-aloud';
import {
  ReviewPolicyResolver,
  SCHOOL_REVIEW_AI_POLICY_FEATURE,
  type ReviewPolicyQuestion,
} from '../../../../src/modules/attempts/application/services/review-policy-resolver.js';
import {
  EntitlementsClientError,
  type IEntitlementsClient,
} from '../../../../src/shared/application/ports/entitlements-client.port.js';
import type {
  CourseReviewPolicy,
  IReviewPolicyReader,
  SchoolReviewPolicy,
} from '../../../../src/shared/application/ports/review-policy-reader.port.js';
import { Result } from '../../../../src/shared/kernel/result.js';

// Plan 80, step 3a — the school's review policy, taken at hand-in.

const SCHOOL = 'school-1';
const SUBMITTED = new Date('2026-10-25T10:00:00.000Z');

const TRANSLATE_CONTENT = {
  dir: 'both',
  langs: { explain: 'Russisk', target: 'Norsk' },
  format: 'set',
  items: [{ id: 's1', dir: 'to_target', source: 'Я живу здесь три года.', gloss: [] }],
  ai: { on: true, checks: { grammar: true, order: true, lexis: true, register: false }, visibility: 'teacher' },
};
const TRANSLATE_ANSWERS = { items: { s1: { refs: ['Jeg har bodd her i tre år'] } } };

const question = (overrides: Partial<ReviewPolicyQuestion> = {}): ReviewPolicyQuestion => ({
  userId: 'user-1',
  schoolId: SCHOOL,
  containerId: 'course-1',
  submittedAt: SUBMITTED,
  templateCode: 'translate_to_target',
  targetLanguage: 'nb',
  submittedAnswer: { answers: [{ itemId: 's1', text: 'Jeg bor her i tre år.' }] },
  rubricSnapshot: null,
  exercise: { content: TRANSLATE_CONTENT, expectedAnswers: TRANSLATE_ANSWERS },
  ...overrides,
});

const course = (overrides: Partial<CourseReviewPolicy> = {}): CourseReviewPolicy => ({
  autoAcceptAfterHours: 96,
  teacherReviewTemplates: [],
  schoolMode: 'ai_then_teacher',
  samplePercent: 15,
  ownerSchoolId: SCHOOL,
  ...overrides,
});

const school = (overrides: Partial<SchoolReviewPolicy> = {}): SchoolReviewPolicy => ({
  mode: 'ai_then_teacher',
  autoAcceptAfterHours: 168,
  samplePercent: 15,
  ...overrides,
});

const setup = (opts: {
  course?: CourseReviewPolicy | null | Error;
  school?: SchoolReviewPolicy | null | Error;
  entitled?: Result<boolean, EntitlementsClientError>;
  draw?: number;
} = {}) => {
  const answer = <T>(value: T | Error | undefined, fallback: T) =>
    value instanceof Error ? Promise.reject(value) : Promise.resolve(value === undefined ? fallback : value);
  const policies = {
    courseReviewPolicy: jest.fn<IReviewPolicyReader['courseReviewPolicy']>(() => answer(opts.course, course())),
    schoolReviewPolicy: jest.fn<IReviewPolicyReader['schoolReviewPolicy']>(() => answer(opts.school, school())),
    schoolReviewEffortMinutes: jest.fn<IReviewPolicyReader['schoolReviewEffortMinutes']>(),
  };
  const isEnabled = jest
    .fn<IEntitlementsClient['isEnabled']>()
    .mockResolvedValue(opts.entitled ?? Result.ok(true));
  const resolver = new ReviewPolicyResolver(policies, { isEnabled }, () => opts.draw ?? 0.99);
  return { resolver, policies, isEnabled };
};

describe('ReviewPolicyResolver', () => {
  it('takes the course’s terms at the school that owns it, dated from hand-in', async () => {
    const { resolver, policies, isEnabled } = setup();

    expect(await resolver.resolve(question())).toEqual({
      mode: 'ai_then_teacher',
      autoAcceptAt: new Date('2026-10-29T10:00:00.000Z'),
      teacherDrawn: false,
    });
    expect(policies.schoolReviewPolicy).not.toHaveBeenCalled();
    expect(isEnabled).toHaveBeenCalledWith({ type: 'workspace', id: SCHOOL }, SCHOOL_REVIEW_AI_POLICY_FEATURE);
    expect(SCHOOL_REVIEW_AI_POLICY_FEATURE).toBe('school.review_ai_policy');
  });

  it('reads the learner’s school, not the course’s, for a course another school owns', async () => {
    const { resolver, policies } = setup({
      course: course({ ownerSchoolId: 'school-2', teacherReviewTemplates: ['translate_to_target'] }),
      school: school({ mode: 'ai_with_sampling' }),
    });

    expect(await resolver.resolve(question())).toEqual({
      mode: 'ai_with_sampling',
      autoAcceptAt: new Date('2026-11-01T10:00:00.000Z'),
      // The other school's list does not apply here, and the draw missed.
      teacherDrawn: false,
    });
    expect(policies.schoolReviewPolicy).toHaveBeenCalledWith(SCHOOL);
  });

  it('reads the school for work outside a course', async () => {
    const { resolver, policies } = setup();
    expect(await resolver.resolve(question({ containerId: null }))).toMatchObject({ mode: 'ai_then_teacher' });
    expect(policies.courseReviewPolicy).not.toHaveBeenCalled();
  });

  it('falls back to the school, keeping the course’s list, when content could not see the school', async () => {
    const { resolver } = setup({
      course: course({ schoolMode: null, teacherReviewTemplates: ['translate_to_target'] }),
      school: school({ mode: 'ai_with_sampling' }),
    });
    expect(await resolver.resolve(question())).toMatchObject({ mode: 'ai_with_sampling', teacherDrawn: true });
  });

  describe('sampling', () => {
    it('draws work for a teacher within the school’s share', async () => {
      const { resolver } = setup({ course: course({ schoolMode: 'ai_with_sampling' }), draw: 0.1 });
      expect(await resolver.resolve(question())).toMatchObject({ teacherDrawn: true });
    });

    it('lets the rest go by the model', async () => {
      const { resolver } = setup({ course: course({ schoolMode: 'ai_with_sampling' }), draw: 0.15 });
      expect(await resolver.resolve(question())).toMatchObject({ teacherDrawn: false });
    });

    it('always sends a template on the course’s list to a teacher', async () => {
      const { resolver } = setup({
        course: course({ schoolMode: 'ai_with_sampling', teacherReviewTemplates: ['translate_to_target'] }),
      });
      expect(await resolver.resolve(question())).toMatchObject({ teacherDrawn: true });
    });

    it('does not draw in ai_then_teacher, where a teacher sees everything', async () => {
      const { resolver } = setup({ draw: 0 });
      expect(await resolver.resolve(question())).toMatchObject({ teacherDrawn: false });
    });
  });

  it('leaves the term open when there is none to read', async () => {
    const { resolver } = setup({ course: course({ autoAcceptAfterHours: null }) });
    expect(await resolver.resolve(question())).toMatchObject({ autoAcceptAt: null });
  });

  describe('a teacher only', () => {
    it('when the school chose so', async () => {
      const { resolver, isEnabled } = setup({ course: course({ schoolMode: 'teacher_only' }) });
      expect(await resolver.resolve(question())).toBeNull();
      expect(isEnabled).not.toHaveBeenCalled();
    });

    it('when the school’s plan no longer has the key', async () => {
      const { resolver } = setup({ entitled: Result.ok(false) });
      expect(await resolver.resolve(question())).toBeNull();
    });

    it('when the plan cannot be read', async () => {
      const { resolver } = setup({ entitled: Result.fail(new EntitlementsClientError(503, 'down')) });
      expect(await resolver.resolve(question())).toBeNull();
    });

    it('when the policy cannot be read', async () => {
      const { resolver } = setup({ course: new Error('content down') });
      expect(await resolver.resolve(question())).toBeNull();
    });

    it('when the school is not there', async () => {
      const { resolver } = setup({ course: null, school: null });
      expect(await resolver.resolve(question())).toBeNull();
    });

    it('without asking anyone, when no model can read the work', async () => {
      const { resolver, policies, isEnabled } = setup();
      const content = { ...TRANSLATE_CONTENT, ai: { ...TRANSLATE_CONTENT.ai, on: false } };
      expect(
        await resolver.resolve(question({ exercise: { content, expectedAnswers: TRANSLATE_ANSWERS } })),
      ).toBeNull();
      expect(await resolver.resolve(question({ templateCode: 'read_aloud' }))).toBeNull();
      expect(policies.courseReviewPolicy).not.toHaveBeenCalled();
      expect(isEnabled).not.toHaveBeenCalled();
    });
  });

  // Plan 82, Q3/Q5: a school's recordings join its mode only once its plan has the voice check.
  describe('read_aloud', () => {
    const reading = (): ReviewPolicyQuestion => {
      const doc = sampleDocument();
      doc.review.aiStage = true;
      return question({
        templateCode: 'read_aloud',
        submittedAnswer: {
          recordings: doc.prompts.map((p, i) => ({ itemId: p.id, assetId: `asset-${i}`, seconds: 20, takes: 1 })),
        },
        exercise: { content: toContent(doc), expectedAnswers: toExpectedAnswers(doc) },
      });
    };
    const withKeys = (keys: Record<string, Result<boolean, EntitlementsClientError>>) => {
      const { resolver, isEnabled } = setup();
      isEnabled.mockImplementation(async (_payer, key) => keys[key] ?? Result.ok(false));
      return { resolver, isEnabled };
    };

    it('follows the school’s mode when its plan has the voice check', async () => {
      const { resolver, isEnabled } = withKeys({
        [SCHOOL_REVIEW_AI_POLICY_FEATURE]: Result.ok(true),
        'ai.voice_review': Result.ok(true),
      });
      expect(await resolver.resolve(reading())).toMatchObject({ mode: 'ai_then_teacher' });
      expect(isEnabled).toHaveBeenCalledWith({ type: 'workspace', id: SCHOOL }, 'ai.voice_review');
    });

    it('leaves the recordings to a teacher while the voice check is off', async () => {
      const { resolver } = withKeys({ [SCHOOL_REVIEW_AI_POLICY_FEATURE]: Result.ok(true) });
      expect(await resolver.resolve(reading())).toBeNull();
    });

    it('leaves them to a teacher when the voice key cannot be read', async () => {
      const { resolver } = withKeys({
        [SCHOOL_REVIEW_AI_POLICY_FEATURE]: Result.ok(true),
        'ai.voice_review': Result.fail(new EntitlementsClientError(503, 'down')),
      });
      expect(await resolver.resolve(reading())).toBeNull();
    });

    it('does not ask for the voice check on text', async () => {
      const { resolver, isEnabled } = withKeys({ [SCHOOL_REVIEW_AI_POLICY_FEATURE]: Result.ok(true) });
      expect(await resolver.resolve(question())).not.toBeNull();
      expect(isEnabled.mock.calls.map(([, key]) => key)).toEqual([SCHOOL_REVIEW_AI_POLICY_FEATURE]);
    });
  });
});
