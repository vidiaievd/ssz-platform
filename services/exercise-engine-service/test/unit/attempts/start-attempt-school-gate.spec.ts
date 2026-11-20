import { jest } from '@jest/globals';
import { ConflictException } from '@nestjs/common';
import { ReviewContextResolver } from '../../../src/modules/attempts/application/services/review-context-resolver.js';
import { StartAttemptHandler } from '../../../src/modules/attempts/application/commands/start-attempt/start-attempt.handler.js';
import { StartAttemptCommand } from '../../../src/modules/attempts/application/commands/start-attempt/start-attempt.command.js';
import { SystemClock } from '../../../src/shared/application/ports/clock.port.js';
import { Result } from '../../../src/shared/kernel/result.js';

// Plan 90, block 12 of the live check: a learner began a `writing_task` in an active school, the
// school was suspended, and reopening the page answered 409 SCHOOL_NOT_ACTIVE — the draft stayed in
// the database where nobody could see it. Only a fresh attempt is refused now; an open one is
// handed back as before (the hand-in itself stays gated in submit).

const OPEN_ATTEMPT = {
  id: 'attempt-open',
  templateCode: 'writing_task',
  validationDetails: null,
  answeredQuestions: [],
  checkedRows: [],
  pickedOptions: [],
  probeDraw: null,
  targetLanguage: 'no',
  difficultyLevel: 'B1',
  checkMode: 'PRACTICE',
  previousAttemptId: null,
  totalItems: null,
};

const ENVELOPE = {
  exercise: {
    templateCode: 'writing_task',
    targetLanguage: 'no',
    difficultyLevel: 'B1',
    content: { prompt: 'Skriv om byen din.' },
    expectedAnswers: {},
    answerCheckSettings: null,
  },
  template: { answerSchema: {}, defaultCheckSettings: {} },
  axes: { skills: ['written'], focus: ['grammar'], modality: 'production' },
  targets: [],
};

function makeHandler(open: typeof OPEN_ATTEMPT | null, inactive: string | null = 'suspended') {
  const attempts = {
    findInProgress: jest.fn(() => Promise.resolve(open)),
    findOpenBoard: jest.fn(() => Promise.resolve(null)),
    findLatestReturned: jest.fn(() => Promise.resolve(null)),
    save: jest.fn(() => Promise.resolve()),
  };
  const contentClient = {
    getExerciseForAttempt: jest.fn(() => Promise.resolve(Result.ok(ENVELOPE))),
    getPracticedAtoms: jest.fn(() => Promise.resolve(Result.ok([]))),
    getExercisePlacement: jest.fn(() => Promise.resolve(Result.fail({ statusCode: 404, message: 'Not placed' }))),
  };
  const organizationClient = { resolveLearnerReviewContext: jest.fn() };
  const gate = {
    inactiveStatusOf: jest.fn(() => Promise.resolve(inactive)),
    assertExerciseOpen: jest.fn(() =>
      Promise.reject(new ConflictException({ code: 'SCHOOL_NOT_ACTIVE', schoolStatus: 'suspended' })),
    ),
  };
  const handler = new StartAttemptHandler(
    attempts as never,
    contentClient as never,
    new ReviewContextResolver(contentClient as never, organizationClient as never),
    { publish: jest.fn(() => Promise.resolve()) } as never,
    new SystemClock(),
    gate as never,
  );
  return { handler, attempts, gate };
}

const command = new StartAttemptCommand('user-1', 'ex-1', 'no', null, null, 'PRACTICE');

describe('StartAttemptHandler — a school that is not active', () => {
  it('refuses a fresh attempt with 409 SCHOOL_NOT_ACTIVE and saves nothing', async () => {
    const { handler, attempts, gate } = makeHandler(null);

    await expect(handler.execute(command)).rejects.toBeInstanceOf(ConflictException);
    expect(gate.assertExerciseOpen).toHaveBeenCalledWith('ex-1');
    expect(attempts.save).not.toHaveBeenCalled();
  });

  it('does not refuse an attempt opened before the school stopped — it is named for the caller to join', async () => {
    const { handler, gate } = makeHandler(OPEN_ATTEMPT);

    const result = await handler.execute(command);

    expect(result.isFail && result.error).toEqual({ code: 'ALREADY_IN_PROGRESS', attemptId: 'attempt-open' });
    expect(gate.assertExerciseOpen).not.toHaveBeenCalled();
  });

  it('hands the open attempt back by name with the school status, so its draft is shown read only', async () => {
    const { handler, gate } = makeHandler(OPEN_ATTEMPT);
    const join = new StartAttemptCommand('user-1', 'ex-1', 'no', null, null, 'PRACTICE', 'attempt-open');

    const result = await handler.execute(join);

    expect(result.isOk && result.value).toMatchObject({ attemptId: 'attempt-open', schoolStatus: 'suspended' });
    expect(gate.assertExerciseOpen).not.toHaveBeenCalled();
  });

  it('says nothing about the school when it is active', async () => {
    const { handler } = makeHandler(OPEN_ATTEMPT, null);
    const join = new StartAttemptCommand('user-1', 'ex-1', 'no', null, null, 'PRACTICE', 'attempt-open');

    const result = await handler.execute(join);

    expect(result.isOk && 'schoolStatus' in result.value).toBe(false);
  });
});
