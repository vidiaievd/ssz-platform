import { jest } from '@jest/globals';
import { sampleDocument, toContent, toExpectedAnswers } from '@ssz/shared-kernel/read-aloud';
import {
  REVIEW_DIRECT_FEATURE,
  ReviewerResolver,
  VOICE_REVIEW_FEATURE,
  VOICE_REVIEW_PRONUNCIATION_FEATURE,
  type ReviewerQuestion,
} from '../../../../src/modules/attempts/application/services/reviewer-resolver.js';
import {
  EntitlementsClientError,
  type IEntitlementsClient,
} from '../../../../src/shared/application/ports/entitlements-client.port.js';
import { Result } from '../../../../src/shared/kernel/result.js';

// Plan 79, step 2.1c — who reads free-form work, decided at submit (Q5-A).

const TRANSLATE_CONTENT = {
  dir: 'both',
  langs: { explain: 'Russisk', target: 'Norsk' },
  format: 'set',
  items: [{ id: 's1', dir: 'to_target', source: 'Я живу здесь три года.', gloss: [] }],
  ai: { on: true, checks: { grammar: true, order: true, lexis: true, register: false }, visibility: 'teacher' },
};
const TRANSLATE_ANSWERS = { items: { s1: { refs: ['Jeg har bodd her i tre år'] } } };

const question = (overrides: Partial<ReviewerQuestion> = {}): ReviewerQuestion => ({
  userId: 'user-1',
  schoolId: null,
  templateCode: 'translate_to_target',
  targetLanguage: 'nb',
  submittedAnswer: { answers: [{ itemId: 's1', text: 'Jeg bor her i tre år.' }] },
  rubricSnapshot: null,
  exercise: { content: TRANSLATE_CONTENT, expectedAnswers: TRANSLATE_ANSWERS },
  ...overrides,
});

const setup = (answer: Result<boolean, EntitlementsClientError> = Result.ok(true)) => {
  const isEnabled = jest.fn<IEntitlementsClient['isEnabled']>().mockResolvedValue(answer);
  return { resolver: new ReviewerResolver({ isEnabled }), isEnabled };
};

describe('ReviewerResolver', () => {
  it('leaves work with a school to its teacher, and asks nobody', async () => {
    const { resolver, isEnabled } = setup();
    expect(await resolver.resolve(question({ schoolId: 'school-1' }))).toBe('teacher');
    expect(isEnabled).not.toHaveBeenCalled();
  });

  it('hands self-study work to a model when the learner has the key', async () => {
    const { resolver, isEnabled } = setup(Result.ok(true));
    expect(await resolver.resolve(question())).toBe('ai');
    expect(isEnabled).toHaveBeenCalledWith({ type: 'user', id: 'user-1' }, REVIEW_DIRECT_FEATURE);
    expect(REVIEW_DIRECT_FEATURE).toBe('ai.review_direct');
  });

  it('says nobody when the key is off', async () => {
    const { resolver } = setup(Result.ok(false));
    expect(await resolver.resolve(question())).toBe('none');
  });

  it('says nobody, without asking, when the author switched AI off', async () => {
    const { resolver, isEnabled } = setup();
    const content = { ...TRANSLATE_CONTENT, ai: { ...TRANSLATE_CONTENT.ai, on: false } };
    expect(
      await resolver.resolve(question({ exercise: { content, expectedAnswers: TRANSLATE_ANSWERS } })),
    ).toBe('none');
    expect(isEnabled).not.toHaveBeenCalled();
  });

  it('says nobody, without asking, for multiple_choice — there is no review prompt', async () => {
    const { resolver, isEnabled } = setup();
    expect(await resolver.resolve(question({ templateCode: 'multiple_choice' }))).toBe('none');
    expect(isEnabled).not.toHaveBeenCalled();
  });

  it('says nobody for an old-form short_answer, which no prompt reads', async () => {
    const { resolver, isEnabled } = setup();
    const answer = await resolver.resolve(
      question({
        templateCode: 'short_answer',
        submittedAnswer: { text: 'Han bor i Oslo.' },
        exercise: { content: { question: 'Hvor bor han?' }, expectedAnswers: { accepted_answers: ['i Oslo'] } },
      }),
    );
    expect(answer).toBe('none');
    expect(isEnabled).not.toHaveBeenCalled();
  });

  it('routes as before when subscription-service does not answer — `none` would be final', async () => {
    const { resolver } = setup(Result.fail(new EntitlementsClientError(503, 'down')));
    expect(await resolver.resolve(question())).toBe('ai');
  });

  // Plan 82, step 6: a `read` exercise is checked by ear, on its own keys.
  describe('read_aloud', () => {
    const reading = (edit: (doc: ReturnType<typeof sampleDocument>) => void = () => {}) => {
      const doc = sampleDocument();
      doc.review.aiStage = true;
      edit(doc);
      return question({
        templateCode: 'read_aloud',
        submittedAnswer: {
          recordings: doc.prompts.map((p, i) => ({ itemId: p.id, assetId: `asset-${i}`, seconds: 20, takes: 1 })),
        },
        exercise: { content: toContent(doc), expectedAnswers: toExpectedAnswers(doc) },
      });
    };
    const keys = (answers: Record<string, Result<boolean, EntitlementsClientError>>) => {
      const isEnabled = jest
        .fn<IEntitlementsClient['isEnabled']>()
        .mockImplementation(async (_payer, key) => answers[key] ?? Result.ok(false));
      return { resolver: new ReviewerResolver({ isEnabled }), isEnabled };
    };

    it('hands the reading to the voice check when the learner has its key', async () => {
      const { resolver, isEnabled } = keys({ [VOICE_REVIEW_FEATURE]: Result.ok(true) });
      expect(await resolver.resolve(reading())).toBe('ai');
      expect(isEnabled).toHaveBeenCalledTimes(1);
      expect(isEnabled).toHaveBeenCalledWith({ type: 'user', id: 'user-1' }, 'ai.voice_review');
    });

    it('takes the pronunciation level alone as a key too', async () => {
      const { resolver, isEnabled } = keys({ [VOICE_REVIEW_PRONUNCIATION_FEATURE]: Result.ok(true) });
      expect(await resolver.resolve(reading())).toBe('ai');
      expect(isEnabled).toHaveBeenLastCalledWith({ type: 'user', id: 'user-1' }, 'ai.voice_review_pronunciation');
    });

    it('says nobody when neither key is on, and never asks for the text review', async () => {
      const { resolver, isEnabled } = keys({ [REVIEW_DIRECT_FEATURE]: Result.ok(true) });
      expect(await resolver.resolve(reading())).toBe('none');
      expect(isEnabled.mock.calls.map(([, key]) => key)).toEqual(['ai.voice_review', 'ai.voice_review_pronunciation']);
    });

    it('routes as before when a key that could decide it is unreadable', async () => {
      const { resolver } = keys({ [VOICE_REVIEW_FEATURE]: Result.fail(new EntitlementsClientError(503, 'down')) });
      expect(await resolver.resolve(reading())).toBe('ai');
    });

    it.each<[string, (doc: ReturnType<typeof sampleDocument>) => void]>([
      ['the AI stage is off', (doc) => void (doc.review.aiStage = false)],
      ['the transcript check is off', (doc) => void (doc.review.ai.transcript = false)],
      ['the mode is dialogue (Q7)', (doc) => void (doc.mode = 'dialogue')],
      ['a prompt has no passage', (doc) => void (doc.prompts[1]!.text = '  ')],
    ])('says nobody, without asking, when %s', async (_why, edit) => {
      const { resolver, isEnabled } = keys({ [VOICE_REVIEW_FEATURE]: Result.ok(true) });
      expect(await resolver.resolve(reading(edit))).toBe('none');
      expect(isEnabled).not.toHaveBeenCalled();
    });
  });
});
