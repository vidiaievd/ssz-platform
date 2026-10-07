import {
  sampleDocument,
  SAMPLE_PROMPT_IDS,
  setMode,
  toContent,
  toExpectedAnswers,
} from '@ssz/shared-kernel/read-aloud';
import type { ReadAloudContent } from '@ssz/shared-kernel/read-aloud';
import {
  ReadAloudValidator,
  type ReadAloudDetails,
} from '../../../../src/infrastructure/validation/validators/read-aloud.validator.js';

const [P1, P2] = SAMPLE_PROMPT_IDS;

const validate = (doc: ReadAloudContent, submittedAnswer: unknown) =>
  new ReadAloudValidator().validate({
    templateCode: 'read_aloud',
    content: toContent(doc),
    expectedAnswers: toExpectedAnswers(doc),
    submittedAnswer,
    checkSettings: {},
    targetLanguage: 'nb',
  });

const submission = {
  recordings: [
    { itemId: P1, assetId: 'a1', seconds: 22.4, takes: 3, discarded: [{ assetId: 'a0', seconds: 18 }] },
    { itemId: P2, assetId: 'a2', seconds: 31, takes: 1 },
  ],
};

describe('ReadAloudValidator (plan 70 §3.5)', () => {
  it('never grades: no score, never correct, always a person (RA-U11)', () => {
    const result = validate(sampleDocument(), submission);
    expect(result.isOk).toBe(true);
    expect(result.value).toMatchObject({ correct: false, score: 0, requiresReview: true });
  });

  it('gives the queue each prompt: material, note, focus words and the chosen take', () => {
    const doc = sampleDocument();
    const details = validate(doc, submission).value.details as ReadAloudDetails;

    expect(details.totalItems).toBe(2);
    expect(details.passedItems).toBe(0);
    expect(details.mode).toBe('read');
    expect(details.revision).toBe(doc.settings.revision);
    expect(details.prompts.map((p) => p.itemId)).toEqual([P1, P2]);

    const first = details.prompts[0]!;
    expect(first.label).toBe(doc.prompts[0]!.label);
    expect(first.material).toEqual({ kind: 'read', text: doc.prompts[0]!.text });
    expect(first.note).toBe(doc.prompts[0]!.note);
    expect(first.focus).toEqual(doc.prompts[0]!.focus);
    expect(first.minSeconds).toBe(15);
    expect(first.maxSeconds).toBe(60);
    expect(first.recording).toEqual({ assetId: 'a1', seconds: 22.4, takes: 3, discarded: [] });
  });

  it('names what a failing verdict does, so the queue can label its button', () => {
    const doc = sampleDocument();
    const once = { ...doc, settings: { ...doc.settings, revision: 'once' as const } };
    expect((validate(once, submission).value.details as ReadAloudDetails).revision).toBe('once');
  });

  it('lists the discarded takes only when the author kept every take (DECISIONS §1)', () => {
    const doc = sampleDocument();
    doc.recording = { ...doc.recording, keepAllTakes: true };
    const details = validate(doc, submission).value.details as ReadAloudDetails;
    expect(details.prompts[0]!.recording.discarded).toEqual([{ assetId: 'a0', seconds: 18 }]);
  });

  it("reads only the current mode's material, and no focus words outside `read`", () => {
    const doc = setMode(sampleDocument(), 'dialogue');
    doc.prompts[0] = { ...doc.prompts[0]!, turn: { situation: 'På kontoret', partner: 'Når kan du begynne?' } };
    const details = validate(doc, submission).value.details as ReadAloudDetails;
    expect(details.mode).toBe('dialogue');
    expect(details.prompts[0]!.material).toEqual({
      kind: 'dialogue',
      situation: 'På kontoret',
      partner: 'Når kan du begynne?',
    });
    expect(details.prompts[0]!.focus).toEqual([]);
  });

  it('keeps a recording whose prompt the author has since deleted — it is still the work', () => {
    const doc = sampleDocument();
    doc.prompts = doc.prompts.slice(0, 1);
    const details = validate(doc, submission).value.details as ReadAloudDetails;
    expect(details.prompts).toHaveLength(2);
    expect(details.prompts[1]).toMatchObject({
      itemId: P2,
      label: 'Prompt 2',
      material: null,
      note: '',
      minSeconds: null,
      recording: { assetId: 'a2' },
    });
  });

  it('refuses what is not a list of recordings', () => {
    for (const answer of [null, 'hei', { text: 'hei' }, { recordings: [{ itemId: P1 }] }]) {
      const result = validate(sampleDocument(), answer);
      expect(result.isFail).toBe(true);
      expect(result.error.code).toBe('SCHEMA_MISMATCH');
    }
  });
});
