import { jest } from '@jest/globals';
import {
  readSpeakingSnapshot,
  readSubmission,
  sampleDocument,
  SAMPLE_PROMPT_IDS,
  snapshotOf,
  toContent,
  toExpectedAnswers,
} from '@ssz/shared-kernel/read-aloud';
import type { ReadAloudContent } from '@ssz/shared-kernel/read-aloud';
import { ReviewContextResolver } from '../../../../src/modules/attempts/application/services/review-context-resolver.js';
import { SubmitAnswerHandler } from '../../../../src/modules/attempts/application/commands/submit-answer/submit-answer.handler.js';
import { SubmitAnswerCommand } from '../../../../src/modules/attempts/application/commands/submit-answer/submit-answer.command.js';
import { RecordingRefusal } from '../../../../src/modules/attempts/application/services/read-aloud-recordings.js';
import type { IAttemptRepository } from '../../../../src/modules/attempts/domain/repositories/attempt.repository.js';
import type { ExerciseDefinition, IContentClient } from '../../../../src/shared/application/ports/content-client.port.js';
import type { IAnswerValidator } from '../../../../src/shared/application/ports/answer-validator.port.js';
import type { IEventPublisher } from '../../../../src/shared/application/ports/event-publisher.port.js';
import type { IFeedbackGenerator } from '../../../../src/shared/application/ports/feedback-generator.port.js';
import {
  MediaAssetsError,
  type IMediaAssets,
  type MediaAssetDescription,
} from '../../../../src/shared/application/ports/media-assets.port.js';
import { ReadAloudValidator } from '../../../../src/infrastructure/validation/validators/read-aloud.validator.js';
import { Result } from '../../../../src/shared/kernel/result.js';
import { Attempt } from '../../../../src/modules/attempts/domain/entities/attempt.entity.js';

const [P1, P2] = SAMPLE_PROMPT_IDS;

const makeAttempt = (previousAttemptId: string | null = null) =>
  Attempt.reconstitute({
    id: 'attempt-1',
    userId: 'user-1',
    exerciseId: 'ex-1',
    assignmentId: null,
    enrollmentId: null,
    templateCode: 'read_aloud',
    targetLanguage: 'nb',
    difficultyLevel: 'A2',
    checkMode: 'PRACTICE',
    practicedAtoms: [],
    status: 'IN_PROGRESS',
    score: null,
    passed: null,
    timeSpentSeconds: 0,
    submittedAnswer: null,
    validationDetails: null,
    feedback: null,
    answerHash: null,
    revisionCount: 0,
    startedAt: new Date(),
    submittedAt: null,
    scoredAt: null,
    schoolId: 'school-1',
    containerId: 'course-1',
    groupId: 'group-1',
    draftAnswer: { takes: { [P1]: [{ n: 1, assetId: 'a1', seconds: 20 }] }, chosen: {} },
    previousAttemptId,
  });

/**
 * The first try, returned with P1 failed and P2 passed — what the second try carries from.
 * Taken through the entity's own transitions, so it holds what a real return leaves behind.
 */
function returnedTry(): Attempt {
  const attempt = Attempt.reconstitute({
    ...({} as Parameters<typeof Attempt.reconstitute>[0]),
    id: 'attempt-0',
    userId: 'user-1',
    exerciseId: 'ex-1',
    assignmentId: null,
    enrollmentId: null,
    templateCode: 'read_aloud',
    targetLanguage: 'nb',
    difficultyLevel: 'A2',
    checkMode: 'PRACTICE',
    practicedAtoms: [],
    status: 'IN_PROGRESS',
    score: null,
    passed: null,
    timeSpentSeconds: 0,
    submittedAnswer: null,
    validationDetails: null,
    feedback: null,
    answerHash: null,
    revisionCount: 0,
    startedAt: new Date(),
    submittedAt: null,
    scoredAt: null,
  });
  attempt.submit(
    {
      recordings: [
        { itemId: P1, assetId: 'old1', seconds: 20, takes: 1 },
        { itemId: P2, assetId: 'old2', seconds: 25, takes: 1 },
      ],
    },
    'hash',
  );
  attempt.routeForReview({ autoPassedItems: 0, totalItems: 2 }, snapshotOf(sampleDocument()));
  attempt.review({
    reviewerId: 'teacher-1',
    outcome: 'returned',
    decisions: [
      { itemId: P1, approved: false, comment: 'For fort.' },
      { itemId: P2, approved: true, comment: 'Bra.' },
    ],
    comment: null,
    rubricMarks: {
      [`${P1}:pron`]: 1,
      [`${P1}:flow`]: 1,
      [`${P1}:content`]: 1,
      [`${P2}:pron`]: 3,
      [`${P2}:flow`]: 1,
      [`${P2}:content`]: 3,
    },
  });
  attempt.clearDomainEvents();
  return attempt;
}

const defOf = (doc: ReadAloudContent): ExerciseDefinition => ({
  exercise: {
    id: 'ex-1',
    templateCode: 'read_aloud',
    targetLanguage: 'nb',
    difficultyLevel: 'A2',
    content: toContent(doc) as unknown as Record<string, unknown>,
    expectedAnswers: toExpectedAnswers(doc) as unknown as Record<string, unknown>,
    answerCheckSettings: null,
  },
  template: {
    code: 'read_aloud',
    contentSchema: {},
    answerSchema: { type: 'object' },
    defaultCheckSettings: {},
    supportedLanguages: null,
  },
  instruction: null,
});

/** A recording media-service would describe as this student's, for this attempt. */
const asset = (id: string, seconds: number, over: Partial<MediaAssetDescription> = {}): MediaAssetDescription => ({
  id,
  ownerId: 'user-1',
  entityType: 'submission_recording',
  entityId: 'attempt-1',
  status: 'READY',
  mimeType: 'audio/webm',
  sizeBytes: seconds * 3000,
  durationMs: seconds * 1000,
  ...over,
});

const recordings = (over: Record<string, unknown> = {}) => ({
  recordings: [
    { itemId: P1, assetId: 'a1', seconds: 20, takes: 2, ...over },
    { itemId: P2, assetId: 'a2', seconds: 25, takes: 1 },
  ],
});

function setup(opts: {
  doc?: ReadAloudContent;
  assets?: MediaAssetDescription[];
  media?: IMediaAssets | null;
  previous?: Attempt;
} = {}) {
  const attempt = makeAttempt(opts.previous?.id ?? null);
  const repo: jest.Mocked<IAttemptRepository> = {
    findById: jest
      .fn<IAttemptRepository['findById']>()
      .mockImplementation(async (id) => (id === opts.previous?.id ? opts.previous : attempt)),
    findInProgress: jest.fn<IAttemptRepository['findInProgress']>(),
    findAllByUser: jest.fn<IAttemptRepository['findAllByUser']>(),
    save: jest.fn<IAttemptRepository['save']>().mockResolvedValue(undefined),
  };
  const content: jest.Mocked<IContentClient> = {
    getExerciseForAttempt: jest
      .fn<IContentClient['getExerciseForAttempt']>()
      .mockResolvedValue(Result.ok(defOf(opts.doc ?? sampleDocument()))),
    getPracticedAtoms: jest.fn<IContentClient['getPracticedAtoms']>().mockResolvedValue(Result.ok([])),
    getExercisePlacement: jest.fn<IContentClient['getExercisePlacement']>(),
  };
  // The real per-type validator behind the port, so the details the queue reads are the ones
  // the template actually writes.
  const readAloud = new ReadAloudValidator();
  const validator: jest.Mocked<IAnswerValidator> = {
    validate: jest
      .fn<IAnswerValidator['validate']>()
      .mockImplementation(async (input) => readAloud.validate(input)),
  };
  const feedback: jest.Mocked<IFeedbackGenerator> = {
    generate: jest.fn<IFeedbackGenerator['generate']>(),
  };
  const publisher: jest.Mocked<IEventPublisher> = {
    publish: jest.fn<IEventPublisher['publish']>().mockResolvedValue(undefined),
  };
  const media: jest.Mocked<IMediaAssets> = {
    describe: jest
      .fn<IMediaAssets['describe']>()
      .mockResolvedValue(Result.ok(opts.assets ?? [asset('a1', 20), asset('a2', 25)])),
  };
  const reviewContext = new ReviewContextResolver(content as any, {
    getMemberRole: jest.fn(),
    resolveLearnerReviewContext: jest.fn(),
  } as any);
  const handler = new SubmitAnswerHandler(
    repo as any,
    content as any,
    validator as any,
    feedback as any,
    publisher as any,
    reviewContext,
    undefined,
    opts.media === undefined ? media : opts.media,
  );
  const submit = (answer: unknown) =>
    handler.execute(new SubmitAnswerCommand('attempt-1', 'user-1', answer, 90, 'nb'));
  return { attempt, repo, validator, publisher, media, submit };
}

describe('SubmitAnswerHandler — read_aloud (plan 70 §3.5)', () => {
  it('routes the recordings to a person, always, with nothing for the learner but the receipt (RA-U11)', async () => {
    const { attempt, repo, publisher, submit } = setup();

    const result = await submit(recordings());

    expect(result.isOk).toBe(true);
    expect(result.value).toMatchObject({ requiresReview: true, correct: false, score: null });
    // The note and the focus words are the teacher's: not a learner-facing template.
    expect(result.value.details).toBeUndefined();
    expect(attempt.status).toBe('ROUTED_FOR_REVIEW');
    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(publisher.publish).toHaveBeenCalledWith(
      'exercise.attempt.routed_for_review',
      expect.objectContaining({ templateCode: 'read_aloud' }),
    );
  });

  it('counts a prompt as an item the machine passed none of', async () => {
    const { attempt, submit } = setup();
    await submit(recordings());
    expect(attempt.autoPassedItems).toBe(0);
    expect(attempt.totalItems).toBe(2);
  });

  it('freezes the rubric with who may see each criterion and the mode the work answered', async () => {
    const doc = sampleDocument();
    doc.rubric[1] = { ...doc.rubric[1]!, studentVisible: false };
    const { attempt, submit } = setup({ doc });

    await submit(recordings());

    const snapshot = readSpeakingSnapshot(attempt.rubricSnapshot);
    expect(snapshot?.mode).toBe('read');
    expect(snapshot?.passScore).toBe(doc.settings.passScore);
    expect(snapshot?.criteria.map((c) => c.studentVisible)).toEqual([true, false, true]);
    expect(snapshot?.criteria[0]!.levels[3]).toBe(doc.rubric[0]!.levels[3]);
  });

  it('asks media-service about every take sent, the discarded ones included', async () => {
    const doc = sampleDocument();
    doc.recording = { ...doc.recording, keepAllTakes: true };
    const { media, submit } = setup({
      doc,
      assets: [asset('a1', 20), asset('a2', 25), asset('a0', 70)],
    });

    const result = await submit(recordings({ discarded: [{ assetId: 'a0', seconds: 70 }] }));

    expect(media.describe).toHaveBeenCalledWith(['a1', 'a0', 'a2']);
    // A discarded take is checked for ownership only — its length is nobody's business.
    expect(result.isOk).toBe(true);
  });

  describe('a try after a return carries the passed prompts (phase 11b)', () => {
    it('takes a recording of the failed prompt only, and writes the passed one in from the return', async () => {
      const { attempt, media, validator, submit } = setup({ previous: returnedTry(), assets: [asset('a1', 20)] });

      const result = await submit({ recordings: [recordings().recordings[0]] });

      expect(result.isOk).toBe(true);
      // The carried recording was checked when it was handed in, for the attempt it was made for.
      expect(media.describe).toHaveBeenCalledWith(['a1']);
      expect(readSubmission(attempt.submittedAnswer)?.recordings).toEqual([
        { itemId: P1, assetId: 'a1', seconds: 20, takes: 2 },
        {
          itemId: P2,
          assetId: 'old2',
          seconds: 25,
          takes: 1,
          carried: {
            attemptId: 'attempt-0',
            attempt: 1,
            marks: { pron: 3, flow: 1, content: 3 },
            points: 13,
            max: 15,
            comment: 'Bra.',
          },
        },
      ]);
      // The queue draws it folded from the details.
      const validated = (await validator.validate.mock.results[0]!.value) as { value: { details: unknown } };
      const details = validated.value.details as { prompts: Array<{ itemId: string; carried: unknown }> };
      expect(details.prompts.map((p) => [p.itemId, p.carried !== null])).toEqual([
        [P1, false],
        [P2, true],
      ]);
    });

    it('drops a recording a client still sent for the carried prompt, and a carried flag it forged', async () => {
      const { attempt, media, submit } = setup({ previous: returnedTry(), assets: [asset('a1', 20)] });

      const result = await submit({
        recordings: [
          { ...recordings().recordings[0], carried: { attemptId: 'x', attempt: 1, points: 15, max: 15 } },
          recordings().recordings[1],
        ],
      });

      expect(result.isOk).toBe(true);
      expect(media.describe).toHaveBeenCalledWith(['a1']);
      const written = readSubmission(attempt.submittedAnswer)!.recordings;
      expect(written[0]).not.toHaveProperty('carried');
      expect(written[1]).toMatchObject({ itemId: P2, assetId: 'old2', carried: { attemptId: 'attempt-0' } });
    });

    it('still wants the failed prompt', async () => {
      const { submit } = setup({ previous: returnedTry() });
      const result = await submit({ recordings: [] });
      expect(result.error).toMatchObject({ code: 'RA_RECORDING_MISSING', itemIds: [P1] });
    });

    it('carries nothing under `revision: once` — a later try records everything', async () => {
      const doc = sampleDocument();
      doc.settings = { ...doc.settings, revision: 'once' };
      const { submit } = setup({ doc, previous: returnedTry(), assets: [asset('a1', 20)] });

      const result = await submit({ recordings: [recordings().recordings[0]] });

      expect(result.error).toMatchObject({ code: 'RA_RECORDING_MISSING', itemIds: [P2] });
    });
  });

  describe('refusals leave the attempt as it was (RA-U9)', () => {
    async function refused(
      answer: unknown,
      opts: Parameters<typeof setup>[0] = {},
    ): Promise<{ error: unknown; ctx: ReturnType<typeof setup> }> {
      const ctx = setup(opts);
      const result = await ctx.submit(answer);
      expect(result.isFail).toBe(true);
      // Nothing written, nothing published, the draft where the student left it.
      expect(ctx.repo.save).not.toHaveBeenCalled();
      expect(ctx.publisher.publish).not.toHaveBeenCalled();
      expect(ctx.validator.validate).not.toHaveBeenCalled();
      expect(ctx.attempt.status).toBe('IN_PROGRESS');
      expect(ctx.attempt.draftAnswer).toEqual({
        takes: { [P1]: [{ n: 1, assetId: 'a1', seconds: 20 }] },
        chosen: {},
      });
      return { error: result.error, ctx };
    }

    it('a submission that is not one is a schema mismatch', async () => {
      const { error } = await refused({ text: 'hei' });
      expect(error).toMatchObject({ code: 'SCHEMA_MISMATCH' });
    });

    it('a prompt with no recording, without asking media-service', async () => {
      const { error, ctx } = await refused({ recordings: [recordings().recordings[0]] });
      expect(error).toBeInstanceOf(RecordingRefusal);
      expect(error).toMatchObject({ code: 'RA_RECORDING_MISSING', itemIds: [P2] });
      expect(ctx.media.describe).not.toHaveBeenCalled();
    });

    it("someone else's recording reads as no recording", async () => {
      const { error } = await refused(recordings(), {
        assets: [asset('a1', 20, { ownerId: 'user-2' }), asset('a2', 25)],
      });
      expect(error).toMatchObject({ code: 'RA_RECORDING_NOT_FOUND', itemIds: [P1] });
    });

    it('a recording made for another attempt', async () => {
      const { error } = await refused(recordings(), {
        assets: [asset('a1', 20), asset('a2', 25, { entityId: 'attempt-0' })],
      });
      expect(error).toMatchObject({ code: 'RA_RECORDING_NOT_FOUND', itemIds: [P2] });
    });

    it('a chosen take outside its prompt’s range, by the server’s measurement', async () => {
      // The client says 20 s; media-service measured 12. Range 15–60 ± 0.5.
      const { error } = await refused(recordings(), {
        assets: [asset('a1', 12), asset('a2', 25)],
      });
      expect(error).toMatchObject({ code: 'RA_RECORDING_LENGTH', itemIds: [P1] });
    });

    it('media-service away is a 503 for the caller, not a missing recording (RA-U10)', async () => {
      const { error } = await refused(recordings(), {
        media: {
          describe: jest
            .fn<IMediaAssets['describe']>()
            .mockResolvedValue(Result.fail(new MediaAssetsError(503, 'connect ECONNREFUSED'))),
        },
      });
      expect(error).toEqual({ code: 'MEDIA_UNAVAILABLE' });
    });

    it('a module with no media binding answers the same way', async () => {
      const { error } = await refused(recordings(), { media: null });
      expect(error).toEqual({ code: 'MEDIA_UNAVAILABLE' });
    });
  });
});
