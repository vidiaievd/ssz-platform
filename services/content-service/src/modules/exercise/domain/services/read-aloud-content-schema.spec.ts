import { sampleDocument, toContent, toExpectedAnswers } from '@ssz/shared-kernel/read-aloud';
import { ExerciseContentValidatorService } from './exercise-content-validator.service.js';
// The schema in `prisma/templates/read-aloud.ts` is the one truth (plan 70 phase 4, item 1), run
// through the same AJV the write path uses. Documents come from the kernel's own `toContent` /
// `toExpectedAnswers`, so a split the builder writes and a schema the database holds cannot drift
// apart unnoticed. The audio schema is a stand-in: it is `seed.ts`'s own.
import { readAloudTemplate } from '../../../../../prisma/templates/read-aloud.js';

const template = readAloudTemplate({ type: 'object' });
const content = (doc: unknown) =>
  ExerciseContentValidatorService.validate(doc, template.contentSchema).isOk;
const answers = (doc: unknown) =>
  ExerciseContentValidatorService.validateAnswers(doc, template.answerSchema).isOk;

describe('read_aloud content/answer schema (seeded)', () => {
  it('accepts a finished document as the kernel persists it', () => {
    const doc = sampleDocument();
    expect(content({ ...toContent(doc), audio: { enabled: false } })).toBe(true);
    expect(answers(toExpectedAnswers(doc))).toBe(true);
  });

  it('accepts a draft an author is in the middle of: no prompts, a range past the ceiling', () => {
    const doc = sampleDocument();
    const persisted = toContent(doc);
    expect(content({ ...persisted, prompts: [] })).toBe(true);
    persisted.prompts[0].maxSeconds = 400;
    expect(content(persisted)).toBe(true);
  });

  it('accepts every mode', () => {
    for (const mode of ['read', 'monologue', 'dialogue'] as const) {
      expect(content({ ...toContent(sampleDocument()), mode })).toBe(true);
    }
    expect(content({ ...toContent(sampleDocument()), mode: 'sing' })).toBe(false);
  });

  it('refuses dials outside the ones step 4 offers', () => {
    const base = toContent(sampleDocument());
    expect(content({ ...base, recording: { ...base.recording, takes: 0 } })).toBe(false);
    expect(content({ ...base, recording: { ...base.recording, takes: 4 } })).toBe(false);
    expect(content({ ...base, settings: { ...base.settings, showRubric: 'sometimes' } })).toBe(
      false,
    );
    expect(content({ ...base, settings: { ...base.settings, passScore: -1 } })).toBe(false);
    const long = toContent(sampleDocument());
    long.prompts[0].prepSeconds = 300;
    expect(content(long)).toBe(false);
  });

  it('refuses a criterion weight other than 1 or 2, and an id with the mark separator in it', () => {
    const base = toContent(sampleDocument());
    expect(content({ ...base, rubric: [{ ...base.rubric[0], weight: 3 }] })).toBe(false);
    expect(content({ ...base, rubric: [{ ...base.rubric[0], id: 'a:b' }] })).toBe(false);
    expect(content({ ...base, prompts: [{ ...base.prompts[0], id: 'p:1' }] })).toBe(false);
  });

  it('refuses a key whose descriptors are not the four levels', () => {
    const key = toExpectedAnswers(sampleDocument());
    const id = Object.keys(key.rubric)[0];
    expect(answers({ ...key, rubric: { [id]: { levels: ['a', 'b'] } } })).toBe(false);
  });

  it('rejects an object that is not this shape at all', () => {
    const foreign = { pairs: [{ left: 'a', right: 'b' }] };
    expect(content(foreign)).toBe(false);
  });
});
