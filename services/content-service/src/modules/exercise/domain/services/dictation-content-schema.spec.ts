import { ExerciseContentValidatorService } from './exercise-content-validator.service.js';
// The schema in `prisma/templates/dictation.ts` is the one truth (plan 68 phase 3, item 4)
// — this test runs it through the same AJV the write path uses, rather than re-typing a
// copy here that could drift from what `seed.ts` actually writes to the database. The
// audio schemas it takes are a loose stand-in: they are `seed.ts`'s own (shared by every
// audio-capable template, defined only there) and not this file's concern to re-verify.
import { dictationTemplate } from '../../../../../prisma/templates/dictation.js';

const audioSchemaStandIn = { type: 'object' };
const dictation = dictationTemplate(audioSchemaStandIn, audioSchemaStandIn);

describe('dictation content/answer schema (seeded)', () => {
  it('accepts an empty scaffold — a draft an author has not started', () => {
    const content = { segments: [{ id: 's1' }] };
    const answers = { segments: {}, orphans: [] };

    expect(ExerciseContentValidatorService.validate(content, dictation.contentSchema).isOk).toBe(
      true,
    );
    expect(
      ExerciseContentValidatorService.validateAnswers(answers, dictation.answerSchema).isOk,
    ).toBe(true);
  });

  it('accepts a finished document', () => {
    const content = {
      title: 'Frokost',
      instruction: 'Hør og skriv det du hører.',
      mode: 'segments',
      language: 'nb',
      audio: {
        enabled: true,
        source: 'asset',
        assetId: 'a1',
        title: 'Frokost',
        duration: 12,
        useSegments: true,
        settings: {
          layout: 'top',
          plays: 3,
          seek: true,
          speed: true,
          gate: 'none',
          transcriptWhen: 'after',
        },
      },
      segments: [{ id: 's1', audio: { start: 0, end: 4 } }],
      marking: { caseSensitive: false, punctuation: false, near: 'flag', extraCost: 1 },
      settings: { attempts: 2, threshold: 80, showWordCount: false, revealKey: true, hints: true },
    };
    const answers = {
      segments: {
        s1: {
          text: 'Jeg liker kaffe om morgenen',
          why: 'Preposisjonen «om» brukes med tid på dagen.',
          focus: [{ id: 'f1', wordIndex: 3, why: '«om» styrer dativ-lignende uttrykk.' }],
        },
      },
      orphans: [{ id: 'o1', segmentId: 's1', surface: 'teen', why: 'Gammel skrivemåte.' }],
    };

    expect(ExerciseContentValidatorService.validate(content, dictation.contentSchema).isOk).toBe(
      true,
    );
    expect(
      ExerciseContentValidatorService.validateAnswers(answers, dictation.answerSchema).isOk,
    ).toBe(true);
  });

  it('rejects an object that is not this shape at all', () => {
    const foreign = { pairs: [{ left: 'a', right: 'b' }] };

    expect(ExerciseContentValidatorService.validate(foreign, dictation.contentSchema).isOk).toBe(
      false,
    );
    expect(
      ExerciseContentValidatorService.validateAnswers(foreign, dictation.answerSchema).isOk,
    ).toBe(false);
  });
});
