import { sampleDocument, toContent, toExpectedAnswers } from '@ssz/shared-kernel/minimal-pairs';
import { ExerciseContentValidatorService } from './exercise-content-validator.service.js';
// The schema in `prisma/templates/minimal-pairs.ts` is the one truth (plan 72 phase 4, item 1), run
// through the same AJV the write path uses. Documents come from the kernel's own `toContent` /
// `toExpectedAnswers`, so a split the builder writes and a schema the database holds cannot drift
// apart unnoticed (MP-M15).
import { minimalPairsTemplate } from '../../../../../prisma/templates/minimal-pairs.js';

const template = minimalPairsTemplate();
const content = (doc: unknown) =>
  ExerciseContentValidatorService.validate(doc, template.contentSchema).isOk;
const answers = (doc: unknown) =>
  ExerciseContentValidatorService.validateAnswers(doc, template.answerSchema).isOk;

describe('minimal_pairs content/answer schema (seeded)', () => {
  it('accepts a finished document as the kernel persists it', () => {
    const doc = sampleDocument();
    expect(content(toContent(doc))).toBe(true);
    expect(answers(toExpectedAnswers(doc))).toBe(true);
  });

  it('accepts a draft an author is in the middle of: no pairs, a single word, an empty clip', () => {
    const base = toContent(sampleDocument());
    expect(content({ ...base, pairs: [] })).toBe(true);
    const lonely = toContent(sampleDocument());
    lonely.pairs[0].words = lonely.pairs[0].words.slice(0, 1);
    expect(content(lonely)).toBe(true);
    const clipless = toContent(sampleDocument());
    clipless.pairs[0].words[0].clip = { ...clipless.pairs[0].words[0].clip, assetId: '' };
    expect(content(clipless)).toBe(true);
  });

  it('puts no ceiling on the number of pairs, words or probes — those are the preflight’s', () => {
    const base = toContent(sampleDocument());
    const many = Array.from({ length: 40 }, (_, i) => ({ ...base.pairs[0], id: `p${i}` }));
    expect(content({ ...base, pairs: many })).toBe(true);
    expect(content({ ...base, set: { ...base.set, probes: 80 } })).toBe(true);
  });

  it('refuses dials outside the ones the builder offers', () => {
    const base = toContent(sampleDocument());
    expect(content({ ...base, set: { ...base.set, sampling: 'sorted' } })).toBe(false);
    expect(content({ ...base, set: { ...base.set, playsPerProbe: 4 } })).toBe(false);
    expect(content({ ...base, set: { ...base.set, options: 'some' } })).toBe(false);
    expect(content({ ...base, feedback: { ...base.feedback, showGloss: 'sometimes' } })).toBe(
      false,
    );
    expect(content({ ...base, scoring: { ...base.scoring, memory: 'forever' } })).toBe(false);
    expect(content({ ...base, scoring: { ...base.scoring, attempts: 4 } })).toBe(false);
    expect(content({ ...base, scoring: { ...base.scoring, passPct: 101 } })).toBe(false);
    expect(content({ ...base, scoring: { ...base.scoring, passPct: -1 } })).toBe(false);
  });

  it('refuses a clip provenance the kernel does not know', () => {
    const base = toContent(sampleDocument());
    base.pairs[0].words[0].clip.provenance = 'ai' as never;
    expect(content(base)).toBe(false);
  });

  it('refuses an id with the probe separator in it', () => {
    const base = toContent(sampleDocument());
    expect(content({ ...base, pairs: [{ ...base.pairs[0], id: 'a:b' }] })).toBe(false);
    const word = toContent(sampleDocument());
    word.pairs[0].words[0].id = 'w:1';
    expect(content(word)).toBe(false);
    expect(answers({ pairs: { 'a:b': { note: 'x' } } })).toBe(false);
  });

  it('keeps a URL out of the document’s shape: a clip is an asset id, nothing else is read', () => {
    const props = (
      template.contentSchema.properties.pairs.items.properties.words.items.properties.clip as {
        properties: Record<string, unknown>;
      }
    ).properties;
    expect(Object.keys(props).sort()).toEqual([
      'assetId',
      'dialect',
      'durationMs',
      'fileName',
      'provenance',
      'voice',
    ]);
  });

  it('rejects an object that is not this shape at all', () => {
    expect(content({ prompts: [{ id: 'p1' }] })).toBe(false);
    expect(content({ pairs: 'kj/sj' })).toBe(false);
  });
});
