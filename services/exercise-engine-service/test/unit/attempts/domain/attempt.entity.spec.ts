import { Attempt } from '../../../../src/modules/attempts/domain/entities/attempt.entity.js';
import { AttemptStartedEvent } from '../../../../src/modules/attempts/domain/events/attempt-started.event.js';
import { AttemptScoredEvent } from '../../../../src/modules/attempts/domain/events/attempt-scored.event.js';
import { AttemptCompletedUnscoredEvent } from '../../../../src/modules/attempts/domain/events/attempt-completed-unscored.event.js';
import { AttemptRoutedForReviewEvent } from '../../../../src/modules/attempts/domain/events/attempt-routed-for-review.event.js';
import {
  AttemptAlreadySubmittedError,
  InvalidAttemptTransitionError,
  InvalidScoreError,
} from '../../../../src/modules/attempts/domain/exceptions/attempt.errors.js';

const makeAttempt = () =>
  Attempt.create({
    userId: 'user-1',
    exerciseId: 'ex-1',
    templateCode: 'multiple_choice',
    targetLanguage: 'no',
    difficultyLevel: 'B1',
    checkMode: 'PRACTICE',
    practicedAtoms: [],
  });

describe('Attempt entity', () => {
  describe('create()', () => {
    it('creates an IN_PROGRESS attempt', () => {
      const attempt = makeAttempt();
      expect(attempt.status).toBe('IN_PROGRESS');
      expect(attempt.userId).toBe('user-1');
      expect(attempt.exerciseId).toBe('ex-1');
      expect(attempt.scoreValue).toBeNull();
      expect(attempt.timeSpentSeconds).toBe(0);
    });

    it('raises AttemptStartedEvent', () => {
      const attempt = makeAttempt();
      const events = attempt.getDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(AttemptStartedEvent);
      const ev = events[0] as AttemptStartedEvent;
      expect(ev.payload.userId).toBe('user-1');
      expect(ev.payload.exerciseId).toBe('ex-1');
      expect(ev.payload.assignmentId).toBeNull();
    });

    it('includes assignmentId when provided', () => {
      const attempt = Attempt.create({
        userId: 'u',
        exerciseId: 'e',
        templateCode: 'fill_in_blank',
        targetLanguage: 'de',
        difficultyLevel: 'A1',
        checkMode: 'PRACTICE',
        practicedAtoms: [],
        assignmentId: 'assign-99',
      });
      const ev = attempt.getDomainEvents()[0] as AttemptStartedEvent;
      expect(ev.payload.assignmentId).toBe('assign-99');
    });
  });

  describe('submit()', () => {
    it('transitions IN_PROGRESS → SUBMITTED', () => {
      const attempt = makeAttempt();
      const result = attempt.submit({ answer: 'A' }, 'hash123');
      expect(result.isOk).toBe(true);
      expect(attempt.status).toBe('SUBMITTED');
      expect(attempt.submittedAnswer).toEqual({ answer: 'A' });
      expect(attempt.answerHash).toBe('hash123');
      expect(attempt.submittedAt).toBeInstanceOf(Date);
    });

    it('fails when already SUBMITTED', () => {
      const attempt = makeAttempt();
      attempt.submit({}, 'h1');
      const result = attempt.submit({}, 'h2');
      expect(result.isFail).toBe(true);
      expect(result.error).toBeInstanceOf(AttemptAlreadySubmittedError);
    });

    it('fails when ABANDONED', () => {
      const attempt = makeAttempt();
      attempt.abandon();
      const result = attempt.submit({}, 'hash');
      expect(result.isFail).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidAttemptTransitionError);
    });

    it('fails when already SCORED', () => {
      const attempt = makeAttempt();
      attempt.submit({}, 'h');
      attempt.score(80, true, null, null);
      const result = attempt.submit({}, 'h2');
      expect(result.isFail).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidAttemptTransitionError);
    });
  });

  describe('score()', () => {
    it('transitions SUBMITTED → SCORED', () => {
      const attempt = makeAttempt();
      attempt.submit({ answer: 'B' }, 'h');
      const result = attempt.score(75, true, { details: true }, { text: 'Good' });
      expect(result.isOk).toBe(true);
      expect(attempt.status).toBe('SCORED');
      expect(attempt.scoreValue).toBe(75);
      expect(attempt.passed).toBe(true);
      expect(attempt.validationDetails).toEqual({ details: true });
      expect(attempt.feedback).toEqual({ text: 'Good' });
      expect(attempt.scoredAt).toBeInstanceOf(Date);
    });

    it('raises AttemptScoredEvent with correct payload', () => {
      const attempt = makeAttempt();
      attempt.addTimeSpent(30);
      attempt.submit({}, 'h');
      attempt.clearDomainEvents();
      attempt.score(60, false, null, null);
      const events = attempt.getDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(AttemptScoredEvent);
      const ev = events[0] as AttemptScoredEvent;
      expect(ev.eventType).toBe('exercise.attempt.completed');
      expect(ev.payload.userId).toBe('user-1');
      expect(ev.payload.score).toBe(60);
      expect(ev.payload.timeSpentSeconds).toBe(30);
      expect(ev.payload.completed).toBe(true);
    });

    it('fails when not SUBMITTED', () => {
      const attempt = makeAttempt();
      const result = attempt.score(50, true, null, null);
      expect(result.isFail).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidAttemptTransitionError);
    });

    it('fails with score < 0', () => {
      const attempt = makeAttempt();
      attempt.submit({}, 'h');
      const result = attempt.score(-1, false, null, null);
      expect(result.isFail).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidScoreError);
    });

    it('fails with score > 100', () => {
      const attempt = makeAttempt();
      attempt.submit({}, 'h');
      const result = attempt.score(101, true, null, null);
      expect(result.isFail).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidScoreError);
    });

    it('accepts boundary scores 0 and 100', () => {
      const a1 = makeAttempt();
      a1.submit({}, 'h');
      expect(a1.score(0, false, null, null).isOk).toBe(true);

      const a2 = makeAttempt();
      a2.submit({}, 'h');
      expect(a2.score(100, true, null, null).isOk).toBe(true);
    });
  });

  describe('reopenForRecheck()', () => {
    const scored = () => {
      const attempt = makeAttempt();
      attempt.submit({}, 'h');
      attempt.score(40, false, null, null);
      attempt.clearDomainEvents();
      return attempt;
    };

    it('puts a scored practice attempt back in progress and counts the re-check', () => {
      const attempt = scored();
      const result = attempt.reopenForRecheck();
      expect(result.isOk).toBe(true);
      expect(attempt.status).toBe('IN_PROGRESS');
      expect(attempt.recheckCount).toBe(1);
      // The resubmission counter is a different thing and stays put.
      expect(attempt.revisionCount).toBe(0);
      expect(attempt.submit({}, 'h2').isOk).toBe(true);
    });

    it('scores a re-check without raising a second AttemptScoredEvent', () => {
      const attempt = scored();
      attempt.reopenForRecheck();
      attempt.submit({}, 'h2');
      attempt.clearDomainEvents();

      expect(attempt.score(100, true, null, null).isOk).toBe(true);
      expect(attempt.scoreValue).toBe(100);
      // Progress and the SRS heard about the first check. A correction is the
      // learner reading the feedback, not fresh evidence that they knew the word.
      expect(attempt.getDomainEvents()).toHaveLength(0);
    });

    it('still reports a resubmission after a RETURNED verdict as fresh evidence', () => {
      const attempt = makeAttempt();
      // What start-attempt writes for the second go at a returned exercise: a
      // different attempt entirely, not a re-check of the scored one.
      attempt.snapshotReviewContext({
        schoolId: null,
        containerId: null,
        groupId: null,
        exercisePath: null,
        previousAttemptId: 'attempt-1',
        revisionCount: 1,
      });
      attempt.submit({}, 'h');
      attempt.clearDomainEvents();

      expect(attempt.score(80, true, null, null).isOk).toBe(true);
      expect(attempt.getDomainEvents()).toHaveLength(1);
    });

    it('refuses once the answers were revealed', () => {
      const attempt = scored();
      attempt.revealAnswers();
      const result = attempt.reopenForRecheck();
      expect(result.isFail).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidAttemptTransitionError);
    });

    it('refuses on a graded attempt — that is one shot at a teacher', () => {
      const attempt = Attempt.create({
        userId: 'user-1',
        exerciseId: 'ex-1',
        templateCode: 'word_bank_gap_fill',
        targetLanguage: 'no',
        difficultyLevel: 'B1',
        checkMode: 'GRADED',
        practicedAtoms: [],
      });
      attempt.submit({}, 'h');
      attempt.score(40, false, null, null);

      const result = attempt.reopenForRecheck();
      expect(result.isFail).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidAttemptTransitionError);
    });

    it('refuses when the attempt was never scored', () => {
      const attempt = makeAttempt();
      const result = attempt.reopenForRecheck();
      expect(result.isFail).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidAttemptTransitionError);
    });
  });

  describe('routeForReview()', () => {
    it('transitions SUBMITTED → ROUTED_FOR_REVIEW', () => {
      const attempt = makeAttempt();
      attempt.submit({}, 'h');
      const result = attempt.routeForReview();
      expect(result.isOk).toBe(true);
      expect(attempt.status).toBe('ROUTED_FOR_REVIEW');
    });

    it('tells progress the attempt finished unscored', () => {
      const attempt = makeAttempt();
      attempt.addTimeSpent(15);
      attempt.submit({}, 'h');
      attempt.clearDomainEvents();
      attempt.routeForReview();

      const ev = attempt
        .getDomainEvents()
        .find((e) => e instanceof AttemptCompletedUnscoredEvent) as AttemptCompletedUnscoredEvent;
      expect(ev).toBeDefined();
      expect(ev.eventType).toBe('exercise.attempt.completed');
      expect(ev.payload.score).toBeNull();
      expect(ev.payload.completed).toBe(false);
      expect(ev.payload.timeSpentSeconds).toBe(15);
    });

    it('announces the submission separately, with the context review needs', () => {
      const attempt = makeAttempt();
      attempt.snapshotReviewContext({
        schoolId: 'school-1',
        containerId: 'course-1',
        groupId: 'group-1',
        exercisePath: null,
        previousAttemptId: null,
        revisionCount: 0,
      });
      attempt.submit({}, 'h');
      attempt.clearDomainEvents();
      attempt.routeForReview();

      const ev = attempt
        .getDomainEvents()
        .find((e) => e instanceof AttemptRoutedForReviewEvent) as AttemptRoutedForReviewEvent;
      expect(ev).toBeDefined();
      expect(ev.eventType).toBe('exercise.attempt.routed_for_review');
      expect(ev.payload).toMatchObject({
        attemptId: attempt.id,
        schoolId: 'school-1',
        containerId: 'course-1',
        groupId: 'group-1',
      });
      expect(ev.payload.submittedAt).toBe(attempt.submittedAt?.toISOString());
    });

    it('writes down the machine tally as a hint for the queue', () => {
      const attempt = makeAttempt();
      attempt.submit({}, 'h');
      attempt.routeForReview({ autoPassedItems: 4, totalItems: 5 });

      expect(attempt.autoPassedItems).toBe(4);
      expect(attempt.totalItems).toBe(5);
    });

    it('only fills blanks when review context is backfilled later', () => {
      const attempt = makeAttempt();
      attempt.snapshotReviewContext({
        schoolId: 'school-1',
        containerId: null,
        groupId: null,
        exercisePath: null,
        previousAttemptId: null,
        revisionCount: 0,
      });

      attempt.backfillReviewContext({
        schoolId: 'school-2',
        containerId: 'course-1',
        groupId: 'group-1',
      });

      // The school was snapshotted when the learner started; where they are now
      // does not rewrite where they were.
      expect(attempt.schoolId).toBe('school-1');
      expect(attempt.containerId).toBe('course-1');
      expect(attempt.groupId).toBe('group-1');
    });

    it('fails when not SUBMITTED', () => {
      const attempt = makeAttempt();
      const result = attempt.routeForReview();
      expect(result.isFail).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidAttemptTransitionError);
    });

    it('fails when already SCORED', () => {
      const attempt = makeAttempt();
      attempt.submit({}, 'h');
      attempt.score(80, true, null, null);
      const result = attempt.routeForReview();
      expect(result.isFail).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidAttemptTransitionError);
    });
  });

  describe('abandon()', () => {
    it('transitions IN_PROGRESS → ABANDONED', () => {
      const attempt = makeAttempt();
      const result = attempt.abandon();
      expect(result.isOk).toBe(true);
      expect(attempt.status).toBe('ABANDONED');
    });

    it('transitions SUBMITTED → ABANDONED', () => {
      const attempt = makeAttempt();
      attempt.submit({}, 'h');
      const result = attempt.abandon();
      expect(result.isOk).toBe(true);
      expect(attempt.status).toBe('ABANDONED');
    });

    it('is idempotent when already ABANDONED', () => {
      const attempt = makeAttempt();
      attempt.abandon();
      const result = attempt.abandon();
      expect(result.isOk).toBe(true);
      expect(attempt.status).toBe('ABANDONED');
    });

    it('fails when SCORED', () => {
      const attempt = makeAttempt();
      attempt.submit({}, 'h');
      attempt.score(80, true, null, null);
      const result = attempt.abandon();
      expect(result.isFail).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidAttemptTransitionError);
    });

    it('fails when ROUTED_FOR_REVIEW', () => {
      const attempt = makeAttempt();
      attempt.submit({}, 'h');
      attempt.routeForReview();
      const result = attempt.abandon();
      expect(result.isFail).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidAttemptTransitionError);
    });
  });

  describe('addTimeSpent()', () => {
    it('accumulates time across multiple calls', () => {
      const attempt = makeAttempt();
      attempt.addTimeSpent(10);
      attempt.addTimeSpent(20);
      attempt.addTimeSpent(5);
      expect(attempt.timeSpentSeconds).toBe(35);
    });

    it('ignores non-positive values', () => {
      const attempt = makeAttempt();
      attempt.addTimeSpent(0);
      attempt.addTimeSpent(-10);
      expect(attempt.timeSpentSeconds).toBe(0);
    });

    it('accumulates time even after submission', () => {
      const attempt = makeAttempt();
      attempt.addTimeSpent(30);
      attempt.submit({}, 'h');
      attempt.addTimeSpent(10);
      expect(attempt.timeSpentSeconds).toBe(40);
    });
  });

  describe('reconstitute()', () => {
    it('restores all fields without raising events', () => {
      const now = new Date();
      const attempt = Attempt.reconstitute({
        id: 'restored-id',
        userId: 'u2',
        exerciseId: 'e2',
        assignmentId: 'a1',
        enrollmentId: null,
        templateCode: 'match_pairs',
        targetLanguage: 'fr',
        difficultyLevel: 'C1',
        checkMode: 'PRACTICE',
        practicedAtoms: [],
        status: 'SCORED',
        score: 90,
        passed: true,
        timeSpentSeconds: 120,
        submittedAnswer: { pairs: [] },
        validationDetails: { correct: 5, total: 5 },
        feedback: null,
        answerHash: 'abc',
        revisionCount: 0,
        startedAt: now,
        submittedAt: now,
        scoredAt: now,
      });

      expect(attempt.id).toBe('restored-id');
      expect(attempt.status).toBe('SCORED');
      expect(attempt.scoreValue).toBe(90);
      expect(attempt.timeSpentSeconds).toBe(120);
      expect(attempt.getDomainEvents()).toHaveLength(0);
    });
  });
  describe('useSelfCheck()', () => {
    it('spends checks up to the exercise\'s budget and then refuses', () => {
      const attempt = makeAttempt();

      expect(attempt.useSelfCheck(2).isOk).toBe(true);
      expect(attempt.selfChecksUsed).toBe(1);
      expect(attempt.useSelfCheck(2).isOk).toBe(true);
      expect(attempt.selfChecksUsed).toBe(2);

      const spent = attempt.useSelfCheck(2);
      expect(spent.isFail).toBe(true);
      expect(spent.error).toBeInstanceOf(InvalidAttemptTransitionError);
      // A refused check costs nothing.
      expect(attempt.selfChecksUsed).toBe(2);
    });

    it('refuses outright when the exercise offers none', () => {
      const attempt = makeAttempt();
      const result = attempt.useSelfCheck(0);

      expect(result.isFail).toBe(true);
      expect(attempt.selfChecksUsed).toBe(0);
    });

    it('refuses once the answer is in — the machine does not grade this twice', () => {
      const attempt = makeAttempt();
      attempt.submit({}, 'h');

      const result = attempt.useSelfCheck(3);
      expect(result.isFail).toBe(true);
      expect(attempt.selfChecksUsed).toBe(0);
    });
  });
  describe('answerQuestion()', () => {
    const answer = (questionId: string, verdict: 'pass' | 'partial' | 'fail' = 'pass') => ({
      questionId,
      text: 'Alle må ha lys foran og bak når det er mørkt.',
      verdict,
    });

    it('records each answer once, in the order they were handed in', () => {
      const attempt = makeAttempt();

      expect(attempt.answerQuestion(answer('q1')).isOk).toBe(true);
      expect(attempt.answerQuestion(answer('q2', 'partial')).isOk).toBe(true);

      expect(attempt.answeredQuestions.map((a) => a.questionId)).toEqual(['q1', 'q2']);
      expect(attempt.answeredQuestions[1]).toMatchObject({ verdict: 'partial' });
      expect(attempt.answeredQuestions[0]?.answeredAt).toBeInstanceOf(Date);
    });

    it('refuses a second answer to the same question', () => {
      // IMPLEMENTATION.md puts this in the model rather than the UI: the review queue
      // assumes one answer per student per question, and a hidden button is one replayed
      // request away from two.
      const attempt = makeAttempt();
      attempt.answerQuestion(answer('q1'));

      const again = attempt.answerQuestion({ questionId: 'q1', text: 'Noe annet.', verdict: 'fail' });
      expect(again.isFail).toBe(true);
      expect(again.error).toBeInstanceOf(InvalidAttemptTransitionError);
      // A refused answer changes nothing — the first one still stands.
      expect(attempt.answeredQuestions).toHaveLength(1);
      expect(attempt.answeredQuestions[0]?.verdict).toBe('pass');
    });

    it('refuses once the set is no longer open', () => {
      const attempt = makeAttempt();
      attempt.submit({ answers: [] }, 'hash');

      const late = attempt.answerQuestion(answer('q1'));
      expect(late.isFail).toBe(true);
      expect(attempt.answeredQuestions).toHaveLength(0);
    });

    it('hands back a copy, so the list cannot be appended to from outside', () => {
      const attempt = makeAttempt();
      attempt.answerQuestion(answer('q1'));

      attempt.answeredQuestions.push(answer('q2') as never);
      expect(attempt.answeredQuestions).toHaveLength(1);
    });
  });
  describe('checkRow()', () => {
    const board = (rowId: string, solved = false, revealed = false) => ({
      rowId,
      placement: { 'f-sub': ['c1'], 'f-v': ['c3'] },
      solved,
      revealed,
    });

    it('counts the checks on a sentence and keeps the last board', () => {
      // Unlike an answer, a check decides nothing: the handoff gives the student `Rett
      // opp` and unlimited retries, and the counter is what they see as `Forsøk N`.
      const attempt = makeAttempt();

      expect(attempt.checkRow(board('r1')).isOk).toBe(true);
      expect(attempt.checkRow(board('r1')).isOk).toBe(true);

      expect(attempt.checkedRows).toHaveLength(1);
      expect(attempt.checkedRows[0]).toMatchObject({ rowId: 'r1', attempts: 2, solved: false });
      expect(attempt.checkedRows[0]?.checkedAt).toBeInstanceOf(Date);
    });

    it('refuses a sentence that is already solved', () => {
      const attempt = makeAttempt();
      attempt.checkRow(board('r1', true));

      const again = attempt.checkRow(board('r1'));
      expect(again.isFail).toBe(true);
      expect(again.error).toBeInstanceOf(InvalidAttemptTransitionError);
      // A refused check changes nothing — the solved board still stands.
      expect(attempt.checkedRows[0]?.solved).toBe(true);
      expect(attempt.checkedRows[0]?.attempts).toBe(1);
    });

    it('refuses a sentence that was revealed, and does not spend an attempt on the reveal', () => {
      // `Vis riktig skjema` puts the answer on the board. Anything checked afterwards
      // would be the answer handed straight back, so the refusal is the model's, not the
      // runner's disabled button.
      const attempt = makeAttempt();
      attempt.checkRow(board('r1'));
      attempt.checkRow({ ...board('r1'), revealed: true });

      expect(attempt.checkedRows[0]).toMatchObject({ revealed: true, attempts: 1 });
      expect(attempt.checkRow(board('r1')).isFail).toBe(true);
    });

    it('keeps the sentences apart', () => {
      const attempt = makeAttempt();
      attempt.checkRow(board('r1', true));
      attempt.checkRow(board('r2'));

      expect(attempt.checkedRows.map((row) => row.rowId)).toEqual(['r1', 'r2']);
    });

    it('refuses once the set is no longer open', () => {
      const attempt = makeAttempt();
      attempt.submit({ rows: [] }, 'hash');

      expect(attempt.checkRow(board('r1')).isFail).toBe(true);
      expect(attempt.checkedRows).toHaveLength(0);
    });

    it('hands back copies, so the state cannot be edited from outside', () => {
      const attempt = makeAttempt();
      attempt.checkRow(board('r1'));

      attempt.checkedRows[0]!.revealed = true;
      attempt.checkedRows.push(board('r2') as never);

      expect(attempt.checkedRows).toHaveLength(1);
      expect(attempt.checkedRows[0]?.revealed).toBe(false);
    });
  });
});
