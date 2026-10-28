import type { AssistContext } from '../domain/assist-answer.js';
import { AssistPayerResolver } from './assist-payer.resolver.js';
import type { AssistEnrollment, ClassSession } from './ports/assist-readers.js';

// Plan 83, step 3: who pays for a turn of the student assistant, and whether it may start.

const USER = 'user-1';
const COURSE = 'c0000000-0000-4000-8000-000000000001';
const OTHER_COURSE = 'c0000000-0000-4000-8000-000000000009';
const UNIT = 'c0000000-0000-4000-8000-000000000002';
const ATTEMPT = 'c0000000-0000-4000-8000-000000000004';
const LESSON = 'c0000000-0000-4000-8000-000000000005';
const SCHOOL = 's-1';
const TUTOR = 's-solo';

const session: ClassSession = {
  id: LESSON,
  groupId: 'g-1',
  schoolId: SCHOOL,
  date: '2026-10-29',
  startTime: '18:00',
  endTime: '19:30',
  status: 'scheduled',
  type: 'lesson',
  contentUnitId: UNIT,
  contentLessonId: null,
};

function setup(over: { enrollment?: AssistEnrollment | null; courseOfAttempt?: string | null; attemptFound?: boolean; members?: string[] | null; session?: ClassSession | null } = {}) {
  const enrollments = {
    enrollment: jest.fn().mockResolvedValue(over.enrollment === undefined ? { status: 'active', schoolId: null } : over.enrollment),
  };
  const attempts = {
    attemptScope: jest
      .fn()
      .mockResolvedValue(
        over.attemptFound === false ? null : { attemptId: ATTEMPT, exerciseId: 'ex-1', courseId: over.courseOfAttempt === undefined ? COURSE : over.courseOfAttempt },
      ),
  };
  const classes = { session: jest.fn().mockResolvedValue(over.session === undefined ? session : over.session) };
  const rosters = { members: jest.fn().mockResolvedValue(over.members === undefined ? [USER] : over.members) };
  const resolver = new AssistPayerResolver(enrollments, attempts, classes, rosters);
  return { resolver, enrollments, attempts, classes, rosters };
}

async function resolve(context: AssistContext, over: Parameters<typeof setup>[0] = {}) {
  const env = setup(over);
  return { ...env, result: await env.resolver.resolve({ userId: USER, context }) };
}

describe('AssistPayerResolver — a course in the context', () => {
  it('bills the learner for a self-study course', async () => {
    const { result, enrollments } = await resolve({ kind: 'unit', courseId: COURSE, unitId: UNIT });
    expect(result.value.payer).toEqual({ type: 'user', id: USER });
    expect(enrollments.enrollment).toHaveBeenCalledWith(USER, COURSE);
  });

  it('bills the workspace the learner is enrolled through — a school or a tutor', async () => {
    const school = await resolve({ kind: 'unit', courseId: COURSE, unitId: UNIT }, { enrollment: { status: 'active', schoolId: SCHOOL } });
    expect(school.result.value.payer).toEqual({ type: 'workspace', id: SCHOOL });
    const tutor = await resolve({ kind: 'word', courseId: COURSE, lemma: 'bil' }, { enrollment: { status: 'completed', schoolId: TUTOR } });
    expect(tutor.result.value.payer).toEqual({ type: 'workspace', id: TUTOR });
  });

  it('refuses a course the learner does not hold, whatever the kind', async () => {
    for (const context of [
      { kind: 'unit', courseId: COURSE, unitId: UNIT },
      { kind: 'word', courseId: COURSE, lemma: 'bil' },
      { kind: 'free', courseId: COURSE },
    ] as AssistContext[]) {
      const { result } = await resolve(context, { enrollment: null });
      expect(result.error).toEqual({ code: 'not_enrolled' });
    }
  });

  it('lets a free question or a word without a course go to the learner\'s own plan, asking nobody (Q3)', async () => {
    for (const context of [{ kind: 'free' }, { kind: 'word', lemma: 'bil' }] as AssistContext[]) {
      const { result, enrollments } = await resolve(context, { enrollment: { status: 'active', schoolId: SCHOOL } });
      expect(result.value.payer).toEqual({ type: 'user', id: USER });
      expect(enrollments.enrollment).not.toHaveBeenCalled();
    }
  });
});

describe('AssistPayerResolver — a submission', () => {
  it('takes the course from the attempt, not from the client', async () => {
    const { result, enrollments, attempts } = await resolve(
      { kind: 'submission', attemptId: ATTEMPT, courseId: OTHER_COURSE },
      { enrollment: { status: 'active', schoolId: SCHOOL } },
    );
    expect(attempts.attemptScope).toHaveBeenCalledWith(ATTEMPT, USER);
    expect(enrollments.enrollment).toHaveBeenCalledWith(USER, COURSE);
    expect(result.value).toEqual({ payer: { type: 'workspace', id: SCHOOL }, context: { kind: 'submission', attemptId: ATTEMPT, courseId: COURSE } });
  });

  it('drops a client\'s course when the attempt has none, and bills the learner', async () => {
    const { result, enrollments } = await resolve({ kind: 'submission', attemptId: ATTEMPT, courseId: OTHER_COURSE }, { courseOfAttempt: null });
    expect(result.value).toEqual({ payer: { type: 'user', id: USER }, context: { kind: 'submission', attemptId: ATTEMPT } });
    expect(enrollments.enrollment).not.toHaveBeenCalled();
  });

  it('answers not_found for someone else\'s attempt, and not_enrolled once the learner left the course', async () => {
    expect((await resolve({ kind: 'submission', attemptId: ATTEMPT }, { attemptFound: false })).result.error).toEqual({ code: 'not_found' });
    expect((await resolve({ kind: 'submission', attemptId: ATTEMPT }, { enrollment: null })).result.error).toEqual({ code: 'not_enrolled' });
  });
});

describe('AssistPayerResolver — a class', () => {
  it('bills the session\'s workspace for a learner of its group', async () => {
    const { result, rosters } = await resolve({ kind: 'class', lessonId: LESSON });
    expect(rosters.members).toHaveBeenCalledWith(SCHOOL, 'g-1');
    expect(result.value.payer).toEqual({ type: 'workspace', id: SCHOOL });
  });

  it('bills the session\'s workspace even when the course came to the learner as self-study', async () => {
    const { result } = await resolve({ kind: 'class', lessonId: LESSON, courseId: COURSE }, { enrollment: { status: 'active', schoolId: null } });
    expect(result.value.payer).toEqual({ type: 'workspace', id: SCHOOL });
  });

  it('answers not_found outside the group or for an unknown class or group', async () => {
    expect((await resolve({ kind: 'class', lessonId: LESSON }, { members: ['user-2'] })).result.error).toEqual({ code: 'not_found' });
    expect((await resolve({ kind: 'class', lessonId: LESSON }, { members: null })).result.error).toEqual({ code: 'not_found' });
    expect((await resolve({ kind: 'class', lessonId: LESSON }, { session: null })).result.error).toEqual({ code: 'not_found' });
  });

  it('still checks a course the class context names', async () => {
    const { result } = await resolve({ kind: 'class', lessonId: LESSON, courseId: COURSE }, { enrollment: null });
    expect(result.error).toEqual({ code: 'not_enrolled' });
  });
});

describe('AssistPayerResolver — the shape of the context', () => {
  it.each<[AssistContext, string]>([
    [{ kind: 'unit', courseId: COURSE }, 'unitId'],
    [{ kind: 'unit', unitId: UNIT }, 'courseId'],
    [{ kind: 'submission' }, 'attemptId'],
    [{ kind: 'class' }, 'lessonId'],
    [{ kind: 'word' }, 'lemma'],
    [{ kind: 'lesson' } as unknown as AssistContext, 'kind'],
  ])('refuses %j before asking anyone', async (context, needed) => {
    const { result, enrollments, attempts, classes } = await resolve(context);
    expect(result.error).toEqual({ code: 'invalid_context', message: expect.stringContaining(needed) });
    expect(enrollments.enrollment).not.toHaveBeenCalled();
    expect(attempts.attemptScope).not.toHaveBeenCalled();
    expect(classes.session).not.toHaveBeenCalled();
  });

  it('lets a reader that could not be asked throw, rather than guess a payer', async () => {
    const { resolver, enrollments } = setup();
    enrollments.enrollment.mockRejectedValue(new Error('learning-service answered 500'));
    await expect(resolver.resolve({ userId: USER, context: { kind: 'unit', courseId: COURSE, unitId: UNIT } })).rejects.toThrow('500');
  });
});
