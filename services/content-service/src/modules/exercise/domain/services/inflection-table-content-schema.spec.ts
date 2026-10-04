import {
  emptyContent,
  sampleContent,
  toContent,
  toExpectedAnswers,
} from '@ssz/shared-kernel/inflection-table';
import { ExerciseContentValidatorService } from './exercise-content-validator.service.js';
// The schema in `prisma/templates/inflection-table.ts` is the one truth (plan 69 phase 3,
// item 1), run through the same AJV the write path uses. Documents come from the kernel's own
// `toContent` / `toExpectedAnswers`, so a split the builder writes and a schema the database
// holds cannot drift apart unnoticed. The audio schema is a stand-in: it is `seed.ts`'s own.
import { inflectionTableTemplate } from '../../../../../prisma/templates/inflection-table.js';

const template = inflectionTableTemplate({ type: 'object' });
const content = (doc: unknown) =>
  ExerciseContentValidatorService.validate(doc, template.contentSchema).isOk;
const answers = (doc: unknown) =>
  ExerciseContentValidatorService.validateAnswers(doc, template.answerSchema).isOk;

describe('inflection_table content/answer schema (seeded)', () => {
  it('accepts the scaffold — a draft an author has not started, with and without a pack', () => {
    for (const lang of ['nb', 'uk']) {
      const doc = emptyContent(lang);
      expect(content(toContent(doc))).toBe(true);
      expect(answers(toExpectedAnswers(doc))).toBe(true);
    }
  });

  it('accepts a finished table as the kernel persists it', () => {
    const doc = sampleContent({ input: { mode: 'bank', bankExtra: 3, shuffleRows: true } });
    expect(content({ ...toContent(doc), audio: { enabled: false } })).toBe(true);
    expect(answers(toExpectedAnswers(doc))).toBe(true);
  });

  it('accepts a row typed by hand and a seeded (uuidv5) dictionary link', () => {
    const doc = sampleContent();
    const persisted = toContent(doc);
    persisted.rows[0].dictId = null;
    persisted.rows[1].dictId = '5d4b1c2e-8f3a-5b7c-9d1e-2f3a4b5c6d7e';
    expect(content(persisted)).toBe(true);
  });

  it('refuses a cell key that is not rowId:slotId, and a slot id that is not an identifier', () => {
    expect(answers({ cells: { r1defSg: { value: 'x', accept: [], why: '' } } })).toBe(false);
    expect(answers({ cells: { 'r1:def-sg': { value: 'x', accept: [], why: '' } } })).toBe(false);
    expect(content({ ...toContent(sampleContent()), slots: ['def sg'] })).toBe(false);
  });

  it('refuses settings outside the dials of step 4', () => {
    const base = toContent(sampleContent());
    expect(content({ ...base, settings: { ...base.settings, attempts: 0 } })).toBe(false);
    expect(content({ ...base, settings: { ...base.settings, threshold: 40 } })).toBe(false);
    expect(content({ ...base, input: { ...base.input, bankExtra: 6 } })).toBe(false);
  });

  it('rejects an object that is not this shape at all', () => {
    const foreign = { pairs: [{ left: 'a', right: 'b' }] };
    expect(content(foreign)).toBe(false);
    expect(answers(foreign)).toBe(false);
  });
});
