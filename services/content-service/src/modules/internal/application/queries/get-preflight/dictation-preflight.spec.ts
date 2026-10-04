import {
  fromPersisted,
  issues,
  DEFAULT_AUDIO,
  DEFAULT_MARKING,
  DEFAULT_SETTINGS,
} from '@ssz/shared-kernel/dictation';
import { dictationViolations } from './dictation-preflight.js';

// What earns this file: a dictation fails loudly rather than silently (an unfinished
// sentence is a blocker, not a drop), but its rules still read the key column — the
// sentence, the reason, the focus words — which only this query loads alongside the
// content.

function ready() {
  return {
    id: 'ex-1',
    content: {
      title: 'Frokost',
      instruction: 'Hør og skriv det du hører.',
      mode: 'segments',
      language: 'nb',
      audio: { ...DEFAULT_AUDIO, settings: { ...DEFAULT_AUDIO.settings } },
      segments: [{ id: 's1', audio: { start: 0, end: 4 } }],
      marking: { ...DEFAULT_MARKING },
      settings: { ...DEFAULT_SETTINGS },
    } as Record<string, unknown>,
    expectedAnswers: {
      segments: {
        s1: {
          text: 'Jeg liker kaffe om morgenen',
          why: 'Preposisjonen «om» brukes med tid på dagen.',
          focus: [{ id: 'f1', wordIndex: 3, why: '«om» styrer dativ-lignende uttrykk.' }],
        },
      },
      orphans: [] as Array<{ id: string; segmentId: string; surface: string; why: string }>,
    } as Record<string, unknown>,
  };
}

const codesOf = (exercise: ReturnType<typeof ready>) =>
  dictationViolations(exercise).map((v) => [v.ruleCode, v.severity]);

describe('dictationViolations', () => {
  it('passes a finished exercise', () => {
    expect(dictationViolations(ready())).toEqual([]);
  });

  it('blocks a sentence with nothing written, leaving another sentence intact', () => {
    const exercise = ready();
    (exercise.content.segments as Array<Record<string, unknown>>).push({ id: 's2' });
    (exercise.expectedAnswers.segments as Record<string, unknown>).s2 = {
      text: '',
      why: '',
      focus: [],
    };
    expect(codesOf(exercise)).toContainEqual(['DICTATION_DICT_EMPTY_SEGMENT', 'blocker']);
  });

  it('blocks a sentence with no reason for its spelling', () => {
    const exercise = ready();
    (exercise.expectedAnswers.segments as Record<string, { why: string }>).s1.why = '';
    expect(codesOf(exercise)).toEqual([['DICTATION_DICT_NO_WHY', 'blocker']]);
  });

  it('warns when a focus word has no reason', () => {
    const exercise = ready();
    (
      exercise.expectedAnswers.segments as Record<string, { focus: Array<{ why: string }> }>
    ).s1.focus[0].why = '';
    const violation = dictationViolations(exercise).find(
      (v) => v.ruleCode === 'DICTATION_DICT_FOCUS_WITHOUT_REASON',
    );
    expect(violation).toMatchObject({ severity: 'warning' });
  });

  it('reports one violation per code, counting the sentences', () => {
    const exercise = ready();
    (exercise.content.segments as Array<Record<string, unknown>>).push({ id: 's2' }, { id: 's3' });
    (exercise.expectedAnswers.segments as Record<string, unknown>).s2 = {
      text: '',
      why: '',
      focus: [],
    };
    (exercise.expectedAnswers.segments as Record<string, unknown>).s3 = {
      text: '',
      why: '',
      focus: [],
    };
    const found = dictationViolations(exercise).filter(
      (v) => v.ruleCode === 'DICTATION_DICT_EMPTY_SEGMENT',
    );
    expect(found).toHaveLength(1);
    expect(found[0]?.detail).toContain('2 sentences have nothing written');
  });

  it('refuses an empty scaffold rather than publishing an empty exercise', () => {
    const codes = dictationViolations({ id: 'x', content: {}, expectedAnswers: {} }).map(
      (v) => v.ruleCode,
    );
    expect(codes).toEqual(['DICTATION_DICT_NO_TITLE', 'DICTATION_DICT_NO_KEY']);
  });

  it('reports exactly the codes the builder shows, behind the template prefix (AC-X1)', () => {
    // A draft broken on every step at once: the builder's list and publication's list
    // must be the same set, or an author fixes everything the builder names and is
    // still refused.
    const exercise = ready();
    exercise.content.title = '';
    (exercise.content.settings as Record<string, unknown>) = {
      ...(exercise.content.settings as Record<string, unknown>),
      attempts: 1,
      revealKey: false,
    };
    (exercise.expectedAnswers.segments as Record<string, { why: string }>).s1.why = '';

    const builder = [
      ...new Set(
        issues(fromPersisted(exercise.content, exercise.expectedAnswers)).map((i) => i.code),
      ),
    ];
    const published = dictationViolations(exercise).map((v) =>
      v.ruleCode.replace(/^DICTATION_/, ''),
    );
    expect(published).toEqual(builder);
    expect(published.length).toBeGreaterThanOrEqual(3);
  });
});
