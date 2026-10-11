import {
  sampleContent,
  toContent,
  toExpectedAnswers,
} from '@ssz/shared-kernel/information-transfer';
import { ExerciseContentValidatorService } from './exercise-content-validator.service.js';
// The schema in `prisma/templates/information-transfer.ts` is the one truth (plan 73 phase 3,
// item 1), run through the same AJV the write path uses. Documents come from the kernel's own
// `toContent` / `toExpectedAnswers`, so a split the builder writes and a schema the database holds
// cannot drift apart unnoticed.
import { informationTransferTemplate } from '../../../../../prisma/templates/information-transfer.js';

// The layer's block is defined once in `seed.ts` (which cannot be imported here); a permissive
// stand-in keeps this test about the type's own schema.
const template = informationTransferTemplate({ type: 'object' }, { type: 'object' });
const content = (doc: unknown) =>
  ExerciseContentValidatorService.validate(doc, template.contentSchema).isOk;
const answers = (doc: unknown) =>
  ExerciseContentValidatorService.validateAnswers(doc, template.answerSchema).isOk;

describe('information_transfer content/answer schema (seeded)', () => {
  it('accepts a finished document as the kernel persists it, both sources', () => {
    for (const kind of ['audio', 'text'] as const) {
      const doc = sampleContent(kind);
      expect(content(toContent(doc))).toBe(true);
      expect(answers(toExpectedAnswers(doc))).toBe(true);
    }
  });

  it('accepts a draft an author is in the middle of: no fields, a bare field, an empty key', () => {
    const base = toContent(sampleContent());
    expect(content({ ...base, fields: [] })).toBe(true);
    expect(content({ ...base, fields: [{ id: 'abc123' }] })).toBe(true);
    expect(answers({ fields: { abc123: { expected: [], why: '' } } })).toBe(true);
  });

  it('puts no ceiling on the number of fields — that is the preflight’s', () => {
    const base = toContent(sampleContent());
    const many = Array.from({ length: 20 }, (_, i) => ({ ...base.fields[0], id: `f${i}` }));
    expect(content({ ...base, fields: many })).toBe(true);
  });

  it('refuses dials outside the ones the builder offers', () => {
    const base = toContent(sampleContent());
    expect(content({ ...base, sourceKind: 'video' })).toBe(false);
    expect(content({ ...base, form: { ...base.form, layout: 'grid' } })).toBe(false);
    expect(content({ ...base, answering: { ...base.answering, hintsAfter: 2 } })).toBe(false);
    expect(content({ ...base, answering: { ...base.answering, attempts: 4 } })).toBe(false);
    expect(content({ ...base, answering: { ...base.answering, revealKey: 'sometimes' } })).toBe(
      false,
    );
    expect(content({ ...base, scoring: { ...base.scoring, memory: 'forever' } })).toBe(false);
    expect(content({ ...base, scoring: { ...base.scoring, passPct: 101 } })).toBe(false);
    expect(content({ ...base, fields: [{ ...base.fields[0], type: 'email' }] })).toBe(false);
  });

  it('refuses an id with the item-key separator in it', () => {
    const base = toContent(sampleContent());
    expect(content({ ...base, fields: [{ ...base.fields[0], id: 'a:b' }] })).toBe(false);
    expect(answers({ fields: { 'a:b': { expected: ['x'], why: '' } } })).toBe(false);
  });
});
